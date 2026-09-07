#!/usr/bin/env python3
"""Final broad expansion runner with geography-first microstate absorption.

Uses the fast spatial-index source path and deliberately avoids rebuilding a
world-sized union after every country. Country masks are mutually exclusive;
new land therefore only needs to be subtracted from the pre-existing simulated
map, which the fast wrapper already indexes. This entry point is also the clean
regeneration target used by the broad-map workflow.
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-map-expansion-v2')
    args = parser.parse_args()
    plan = json.loads(Path(map_v2.PLAN).read_text())
    resource_plan = json.loads(Path(map_v2.RESOURCE_PLAN).read_text())
    base_geo = json.loads(Path(map_v2.BASE_GEO).read_text())
    base_meta_doc = json.loads(Path(map_v2.BASE_META).read_text())
    base_resources = json.loads(Path(map_v2.BASE_RESOURCES).read_text())
    expected = int(plan['targetExistingRegionCount'])
    if len(base_geo.get('features', [])) != expected:
        raise RuntimeError(f"Base map has {len(base_geo.get('features', []))} regions; expected {expected}")

    wanted = {c['iso'] for c in plan['countries']} | {m['iso'] for m in plan.get('microstateAbsorption', [])}
    admin0 = fast.fetch_json_retry(map_v2.ADMIN0_URL)
    masks = fast.country_masks_with_hosts(admin0, wanted)
    absorb_microstates_geographic(base_geo['features'], base_meta_doc['regions'], masks,
                                  plan.get('microstateAbsorption', []))

    all_new = []
    for country in plan['countries']:
        mask = masks.get(country['iso'])
        pieces = fast.source_features_fast(country, mask, None)
        if not pieces:
            print(f"COUNTRY_SKIP {country['iso']} already covered or no substantial uncovered land")
            continue
        clusters = fast.cluster_regions_fast(pieces, country['targetRegions'])
        regions = fast.make_game_regions_fast(country, clusters)
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
    main()
