#!/usr/bin/env python3
"""Final broad expansion runner with geography-first microstate absorption.

Uses the fast spatial-index source path and deliberately avoids rebuilding a
world-sized union after every country. Country masks are mutually exclusive;
new land therefore only needs to be subtracted from the pre-existing simulated
map, which the fast wrapper already indexes. This entry point is the clean
detailed regeneration target used by the broad-map workflow.
"""
import argparse
import importlib.util
import json
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
FAST_PATH = ROOT / 'tools' / 'build-map-expansion-v2-fast.py'
spec = importlib.util.spec_from_file_location('map_fast', FAST_PATH)
fast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fast)
map_v2 = fast.map_v2

SWISS_DISPLAY_NAMES = {
    'Sankt Gallen hinterland': 'Swiss Plateau & Upper Rhine',
    'Bern': 'Bernese Plateau & Alps',
    'Graubünden': 'Rhaetian Alps',
    'Vaud hinterland': 'Lake Geneva & Western Plateau',
    'Ticino hinterland': 'Southern Swiss Alps',
    'Valais': 'Upper Rhône & Valais',
}

PRESERVE_COMPACTION_NAMES = {
    'Oslo',
    'Svalbard',
    'Hiiu maakond',
    'Saare maakond',
    'Bahrain',
}
MAX_COMPACTION_AREA_SQKM = 6000.0


def absorb_microstates_geographic(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    for item in specs:
        iso = item['iso']
        micro = masks.get(iso)
        if micro is None:
            for alias in fast.ALIASES.get(iso, set()):
                micro = masks.get(alias)
                if micro is not None:
                    break
        host = masks.get(fast.HOST_ISO.get(iso))
        if micro is None or host is None or micro.is_empty or host.is_empty:
            print(f'MICROSTATE_WARN missing {iso} or host geometry')
            continue

        candidates = []
        host_env = host.envelope
        all_regions = []
        for f in base_geo:
            g = map_v2.repair(shape(f['geometry']))
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.12 else 0
            all_regions.append(((shared > 0, shared, -d), f, g, d))
            if not g.envelope.intersects(host_env):
                continue
            total_area = max(1.0, map_v2.area_sqkm(g))
            host_area = map_v2.area_sqkm(g.intersection(host))
            if host_area <= 0.25:
                continue
            host_share = host_area / total_area
            candidates.append(((shared > 0, shared, -d, host_share, host_area), f, g, d))

        if not candidates:
            raise RuntimeError(f'{iso}: no gameplay region overlaps host geography')

        _, f, g, chosen_distance = max(candidates, key=lambda item: item[0])
        if chosen_distance > 0.35:
            _, nearest_f, nearest_g, nearest_distance = max(all_regions, key=lambda item: item[0])
            if nearest_distance < chosen_distance:
                print(f"MICROSTATE_NEAREST_FALLBACK {iso} hostDistance={chosen_distance:.3f} nearestDistance={nearest_distance:.3f}")
                f, g = nearest_f, nearest_g

        merged = map_v2.repair(unary_union([g, micro]))
        f['geometry'] = map_v2.mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(merged)
        print(f"MICROSTATE_ABSORB {iso} -> {f['properties'].get('name')}")


def clean_detached_liechtenstein_from_base():
    """Undo the earlier bad absorption that attached Liechtenstein to Haut-Rhin."""
    admin0 = fast.fetch_json_retry(map_v2.ADMIN0_URL)
    masks = fast.country_masks_with_hosts(admin0, {'LIE', 'CHE'})
    lie = masks.get('LIE')
    if lie is None or lie.is_empty:
        print('ALPINE_CLEANUP_WARN Liechtenstein mask missing')
        return

    geo_doc = json.loads(Path(map_v2.BASE_GEO).read_text())
    meta_doc = json.loads(Path(map_v2.BASE_META).read_text())
    meta_by_id = {m['id']: m for m in meta_doc['regions']}
    changed = False

    for f in geo_doc.get('features', []):
        if f.get('properties', {}).get('name') != 'Haut-Rhin':
            continue
        g = map_v2.repair(shape(f['geometry']))
        overlap = map_v2.area_sqkm(g.intersection(lie))
        if overlap < 50:
            continue
        cleaned = map_v2.repair(g.difference(lie.buffer(1e-7)))
        if cleaned.is_empty:
            raise RuntimeError('Alpine cleanup would remove all of Haut-Rhin')
        f['geometry'] = map_v2.mapping(cleaned)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = cleaned.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(cleaned)
        print(f'ALPINE_CLEANUP removed {overlap:.1f}sqkm detached Liechtenstein component from Haut-Rhin')
        changed = True

    if not changed:
        print('ALPINE_CLEANUP no detached Liechtenstein component found')
        return

    geo_path = Path('/tmp/simworld-clean-base-regions.geo.json')
    meta_path = Path('/tmp/simworld-clean-base-regions.meta.json')
    geo_path.write_text(json.dumps(geo_doc, ensure_ascii=False, separators=(',', ':')))
    meta_path.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    map_v2.BASE_GEO = geo_path
    map_v2.BASE_META = meta_path
    fast.prepare_existing_index(geo_doc.get('features', []))


def prune_stale_base_adjacency(base_features, base_meta):
    """Remove metadata neighbour edges that no longer exist in the geometry."""
    geoms = {
        f['properties']['id']: map_v2.repair(shape(f['geometry']))
        for f in base_features
    }
    removed = 0
    for m in base_meta:
        mid = m['id']
        mg = geoms.get(mid)
        if mg is None:
            continue
        kept = []
        for nid in m.get('neighbors', []):
            ng = geoms.get(nid)
            if ng is not None and mg.distance(ng) <= map_v2.ADJ_TOL:
                kept.append(nid)
            else:
                removed += 1
        m['neighbors'] = sorted(set(kept))
    print(f'ADJACENCY_PRUNE removedDirectedEdges={removed}')


def compact_overrepresented_source_groups(base_geo, base_meta_doc, base_resources, configured_plan):
    """Collapse only small duplicate admin remnants left by mixed source vintages.

    A source group is eligible only when it contains more regions than its plan
    target. Within that group, only non-preserved regions below 6,000 km² are
    absorbed. Once the smallest remaining region is larger than that threshold,
    compaction stops for the group rather than redesigning legitimate geography.
    """
    targets = {c['iso']: int(c['targetRegions']) for c in configured_plan.get('countries', [])}
    features = base_geo['features']
    meta = base_meta_doc['regions']
    total_removed = 0
    blocked_groups = set()

    while True:
        meta_by_id = {m['id']: m for m in meta}
        groups = {}
        for f in features:
            group = f.get('properties', {}).get('sourceGroup')
            if group in targets:
                groups.setdefault(group, []).append(f)

        over = [
            (group, fs, targets[group])
            for group, fs in groups.items()
            if len(fs) > targets[group] and group not in blocked_groups
        ]
        if not over:
            break

        changed = False
        for group, fs, target_count in sorted(over):
            excess = len(fs) - target_count
            for _ in range(excess):
                current = [f for f in features if f.get('properties', {}).get('sourceGroup') == group]
                removable = [f for f in current if f.get('properties', {}).get('name') not in PRESERVE_COMPACTION_NAMES]
                if not removable:
                    blocked_groups.add(group)
                    break

                def area_of(f):
                    m = meta_by_id.get(f['properties']['id'])
                    return float(m.get('areaSqKm', 0)) if m else map_v2.area_sqkm(shape(f['geometry']))

                sliver = min(removable, key=area_of)
                sliver_area = area_of(sliver)
                if sliver_area > MAX_COMPACTION_AREA_SQKM:
                    print(
                        f'SLIVER_STOP group={group} count={len(current)} target={target_count} '
                        f'smallestRemaining={sliver_area:.1f}sqkm'
                    )
                    blocked_groups.add(group)
                    break

                sid = sliver['properties']['id']
                sg = map_v2.repair(shape(sliver['geometry']))
                neighbours = set(meta_by_id.get(sid, {}).get('neighbors', []))
                candidates = []
                for other in current:
                    oid = other['properties']['id']
                    if oid == sid or oid not in neighbours:
                        continue
                    og = map_v2.repair(shape(other['geometry']))
                    sb = getattr(sg, 'boundary', None)
                    ob = getattr(og, 'boundary', None)
                    shared = sb.intersection(ob).length if sb is not None and ob is not None else 0.0
                    candidates.append((shared, area_of(other), other, og))
                if not candidates:
                    print(f'SLIVER_STOP group={group} no same-source neighbour for {sliver["properties"].get("name")}')
                    blocked_groups.add(group)
                    break

                shared, _, target, tg = max(candidates, key=lambda x: (x[0], x[1]))
                tid = target['properties']['id']
                merged = map_v2.repair(unary_union([tg, sg]))
                target['geometry'] = map_v2.mapping(merged)
                tm = meta_by_id[tid]
                sm = meta_by_id[sid]
                c = merged.centroid
                tm['centroid'] = [c.x, c.y]
                tm['areaSqKm'] = map_v2.area_sqkm(merged)
                tm['neighbors'] = sorted((set(tm.get('neighbors', [])) | set(sm.get('neighbors', []))) - {sid, tid})

                for m in meta:
                    ns = set(m.get('neighbors', []))
                    if sid in ns:
                        ns.remove(sid)
                        if m['id'] != tid:
                            ns.add(tid)
                    ns.discard(m['id'])
                    m['neighbors'] = sorted(ns)

                features[:] = [f for f in features if f['properties']['id'] != sid]
                meta[:] = [m for m in meta if m['id'] != sid]
                base_resources.pop(sid, None)
                print(
                    f'SLIVER_MERGE group={group} area={sliver_area:.1f} '
                    f'{sliver["properties"].get("name")} -> {target["properties"].get("name")} shared={shared:.6f}'
                )
                total_removed += 1
                changed = True
                meta_by_id.pop(sid, None)

        if not changed and all(group in blocked_groups for group, _, _ in over):
            break

    print(f'SLIVER_COMPACTION removedRegions={total_removed}')
    return total_removed


def apply_swiss_display_names(regions):
    """Use geographic Swiss labels without changing stable generated IDs."""
    renamed = 0
    for r in regions:
        old = r['name']
        new = SWISS_DISPLAY_NAMES.get(old)
        if new:
            r['name'] = new
            print(f'SWISS_RENAME {old} -> {new} id={r["id"]}')
            renamed += 1
    if renamed != 6:
        raise RuntimeError(f'Expected to rename 6 Swiss gameplay regions, renamed {renamed}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-map-expansion-v2')
    args = parser.parse_args()
    plan = json.loads(Path(map_v2.PLAN).read_text())
    configured_plan = json.loads((ROOT / 'tools' / 'map-region-plan-v2.json').read_text())
    resource_plan = json.loads(Path(map_v2.RESOURCE_PLAN).read_text())
    base_geo = json.loads(Path(map_v2.BASE_GEO).read_text())
    base_meta_doc = json.loads(Path(map_v2.BASE_META).read_text())
    base_resources = json.loads(Path(map_v2.BASE_RESOURCES).read_text())
    expected = int(plan['targetExistingRegionCount'])
    configured_baseline = int(configured_plan['targetExistingRegionCount'])
    rebased = expected > configured_baseline
    append_only = set(configured_plan.get('appendOnlyCountriesWhenRebased', [])) if rebased else set()
    if append_only:
        print('IDEMPOTENT_APPEND_ONLY=' + ','.join(sorted(append_only)))
    if len(base_geo.get('features', [])) != expected:
        raise RuntimeError(f"Base map has {len(base_geo.get('features', []))} regions; expected {expected}")

    compact_overrepresented_source_groups(base_geo, base_meta_doc, base_resources, configured_plan)

    wanted = {c['iso'] for c in plan['countries']} | {m['iso'] for m in plan.get('microstateAbsorption', [])}
    admin0 = fast.fetch_json_retry(map_v2.ADMIN0_URL)
    masks = fast.country_masks_with_hosts(admin0, wanted)

    ordinary_microstates = [m for m in plan.get('microstateAbsorption', []) if m.get('iso') != 'LIE']
    absorb_microstates_geographic(base_geo['features'], base_meta_doc['regions'], masks, ordinary_microstates)
    prune_stale_base_adjacency(base_geo['features'], base_meta_doc['regions'])

    all_new = []
    for country in plan['countries']:
        if append_only and country['iso'] not in append_only:
            print(f"COUNTRY_REBASE_SKIP {country['iso']}")
            continue

        mask = masks.get(country['iso'])
        pieces = fast.source_features_fast(country, mask, None)

        if country['iso'] == 'CHE' and pieces:
            lie = masks.get('LIE')
            if lie is not None and not lie.is_empty:
                lie_area = map_v2.area_sqkm(lie)
                pieces.append({
                    'geometry': lie,
                    'names': ['Liechtenstein'],
                    'anchor': 'Liechtenstein',
                    'anchorArea': lie_area,
                    'mergeArea': lie.area,
                })
                print(f'SWISS_CLUSTER added Liechtenstein source piece area={lie_area:.1f}sqkm')

        if not pieces:
            print(f"COUNTRY_SKIP {country['iso']} already covered or no substantial uncovered land")
            continue
        clusters = fast.cluster_regions_fast(pieces, country['targetRegions'])
        regions = fast.make_game_regions_fast(country, clusters)
        if country['iso'] == 'CHE' and regions:
            apply_swiss_display_names(regions)
        if not regions:
            print(f"COUNTRY_SKIP {country['iso']} only duplicate source slivers remained")
            continue
        print(f"COUNTRY {country['iso']} sourcePieces={len(pieces)} gameRegions={len(regions)} "
              f"uncoveredArea={sum(r['areaSqKm'] for r in regions):.0f}")
        all_new.extend(regions)

    map_v2.add_land_adjacency(base_geo['features'], base_meta_doc['regions'], all_new)
    ids = {f['properties']['id'] for f in base_geo['features']}
    accepted_new = []
    for r in all_new:
        if r['id'] in ids:
            print(f"DUPLICATE_FINAL_SKIP {r['sourceGroup']} {r['name']}")
            continue
        ids.add(r['id'])
        accepted_new.append(r)
        base_geo['features'].append({'type':'Feature','properties':{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup']},'geometry':map_v2.mapping(r['geometry'])})
        base_meta_doc['regions'].append({'id':r['id'],'name':r['name'],'centroid':r['centroid'],'areaSqKm':r['areaSqKm'],'neighbors':r['neighbors']})
        base_resources[r['id']] = map_v2.resource_endowment(r, resource_plan)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out/'regions.geo.json').write_text(json.dumps(base_geo, ensure_ascii=False, separators=(',',':')))
    (out/'regions.meta.json').write_text(json.dumps(base_meta_doc, ensure_ascii=False, separators=(',',':')))
    (out/'resources.initial.json').write_text(json.dumps(base_resources, ensure_ascii=False, separators=(',',':')))
    review = [{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup'],'sourceUnits':r['sourceUnits'],'areaSqKm':round(r['areaSqKm'],1),'neighbors':len(r['neighbors'])} for r in accepted_new]
    (out/'v2-region-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    isolated = [r['name'] for r in accepted_new if not r['neighbors']]
    print(f'BASE_REGIONS={expected}')
    print(f'NEW_REGIONS={len(accepted_new)}')
    print(f"TOTAL_REGIONS={len(base_geo['features'])}")
    print(f'ISOLATED_NEW_REGIONS={len(isolated)}')
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))


map_v2.fetch_json = fast.fetch_json_retry
map_v2.country_masks = fast.country_masks_with_hosts
map_v2.absorb_microstates = absorb_microstates_geographic
map_v2.source_features = fast.source_features_fast
map_v2.cluster_regions = fast.cluster_regions_fast
map_v2.make_game_regions = fast.make_game_regions_fast

if __name__ == '__main__':
    fast.make_runtime_plan_idempotent()
    clean_detached_liechtenstein_from_base()
    main()