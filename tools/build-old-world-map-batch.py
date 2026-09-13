#!/usr/bin/env python3
"""Run one bounded geography-first Old World / Asia-Pacific land batch.

The original whole-world builder dissolved every existing region into one huge
geometry before clipping source polygons. This runner keeps the same region and
endowment rules, but indexes only existing regions near the active batch and
subtracts only polygons that can actually intersect each source piece.
"""
import argparse
import importlib.util
import json
import time
from pathlib import Path

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / 'tools' / 'build-old-world-asia-pacific.py'
FULL_PLAN = ROOT / 'tools' / 'map-region-plan-old-world-pacific.json'

BATCH_PREFIXES = {
    'europe-greenland': ('ow_',),
    'africa-arabia': ('af_', 'ar_'),
    'central-south-asia': ('ca_', 'na_', 'sa_'),
    'east-southeast-asia': ('ea_', 'se_'),
    'maritime-oceania': ('mi_', 'au_', 'nz_', 'pac_'),
}


def load_builder():
    spec = importlib.util.spec_from_file_location('old_world_builder_batch', BUILDER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bbox_geometry(spec):
    minx, miny, maxx, maxy = spec['bbox']
    if minx <= maxx:
        return box(minx, miny, maxx, maxy)
    return unary_union([box(minx, miny, 180, maxy), box(-180, miny, maxx, maxy)])


def raw_geometry_bounds(geometry):
    """Cheap GeoJSON bounds without constructing/repairing a Shapely geometry."""
    bounds = [180.0, 90.0, -180.0, -90.0]

    def walk(node):
        if not isinstance(node, list) or not node:
            return
        if isinstance(node[0], (int, float)) and len(node) >= 2:
            x, y = float(node[0]), float(node[1])
            bounds[0] = min(bounds[0], x); bounds[1] = min(bounds[1], y)
            bounds[2] = max(bounds[2], x); bounds[3] = max(bounds[3], y)
            return
        for child in node:
            walk(child)

    walk((geometry or {}).get('coordinates', []))
    return tuple(bounds)


def bbox_intersects(a, b):
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def local_subtract(builder, geom, existing_geoms, existing_tree):
    """Subtract only existing regions whose envelopes intersect geom."""
    candidate_indices = existing_tree.query(geom)
    if len(candidate_indices) == 0:
        return builder.map_v2.repair(geom)
    overlaps = []
    for raw_idx in candidate_indices:
        candidate = existing_geoms[int(raw_idx)]
        if candidate.intersects(geom):
            overlaps.append(candidate)
    if not overlaps:
        return builder.map_v2.repair(geom)
    mask = overlaps[0] if len(overlaps) == 1 else builder.map_v2.repair(unary_union(overlaps))
    return builder.map_v2.repair(geom.difference(mask))


def build_source_units(builder, admin0_targets, existing_geoms, existing_tree):
    adm1 = builder.fast.natural_earth_admin1()
    adm1_items = []
    for feature in adm1.get('features', []):
        geom = builder.map_v2.clean(shape(feature['geometry']))
        if not geom.is_empty:
            adm1_items.append((feature, geom))
    adm1_tree = STRtree([geom for _, geom in adm1_items])
    pieces = []

    def add_piece(geom, name, source):
        geom = local_subtract(builder, geom, existing_geoms, existing_tree)
        if geom.is_empty or builder.map_v2.area_sqkm(geom) < 8:
            return
        area = builder.map_v2.area_sqkm(geom)
        pieces.append({
            'geometry': geom, 'names': [name], 'anchor': name,
            'anchorArea': area, 'mergeArea': geom.area, 'source': source,
        })

    for feature, country_geom in admin0_targets:
        country_name = str(builder.prop(feature, 'NAME_EN', 'ADMIN', 'NAME', 'name') or 'Unnamed land')
        covered_parts = []
        for raw_idx in adm1_tree.query(country_geom):
            adm_feature, adm_geom = adm1_items[int(raw_idx)]
            part = builder.map_v2.repair(adm_geom.intersection(country_geom))
            if part.is_empty or builder.map_v2.area_sqkm(part) < 8:
                continue
            add_piece(part, builder.map_v2.feature_name(adm_feature), country_name)
            covered_parts.append(part)
        if covered_parts:
            covered = covered_parts[0] if len(covered_parts) == 1 else builder.map_v2.repair(unary_union(covered_parts))
            remainder = builder.map_v2.repair(country_geom.difference(covered))
        else:
            remainder = country_geom
        if not remainder.is_empty:
            add_piece(remainder, country_name, country_name)

    extra = builder.pacific_extra_geometry()
    if not extra.is_empty:
        for raw_idx in adm1_tree.query(extra):
            adm_feature, adm_geom = adm1_items[int(raw_idx)]
            part = builder.map_v2.repair(adm_geom.intersection(extra))
            if not part.is_empty:
                add_piece(part, builder.map_v2.feature_name(adm_feature), 'Pacific extra')
    return pieces


def local_coverage(builder, wanted_mask, existing_geoms, existing_tree, new_regions):
    coverage_parts = []
    for raw_idx in existing_tree.query(wanted_mask):
        geom = existing_geoms[int(raw_idx)]
        if geom.intersects(wanted_mask):
            coverage_parts.append(builder.map_v2.repair(geom.intersection(wanted_mask)))
    for region in new_regions:
        if region['geometry'].intersects(wanted_mask):
            coverage_parts.append(builder.map_v2.repair(region['geometry'].intersection(wanted_mask)))
    if not coverage_parts:
        return 0.0, 0.0
    covered = coverage_parts[0] if len(coverage_parts) == 1 else builder.map_v2.repair(unary_union(coverage_parts))
    target_area = builder.map_v2.area_sqkm(wanted_mask)
    covered_area = builder.map_v2.area_sqkm(covered)
    return covered_area, covered_area / max(1, target_area)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('batch', choices=tuple(BATCH_PREFIXES))
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    started = time.perf_counter()

    print(f'BATCH={args.batch}', flush=True)
    plan = json.loads(FULL_PLAN.read_text())
    prefixes = BATCH_PREFIXES[args.batch]
    zones = [z for z in plan['zones'] if z['id'].startswith(prefixes)]
    if not zones:
        raise RuntimeError(f'No zones selected for {args.batch}')
    print('BATCH_ZONES=' + ','.join(z['id'] for z in zones), flush=True)

    builder = load_builder()
    if args.batch != 'maritime-oceania':
        builder.PACIFIC_EXTRAS = []
    print(f'PHASE import seconds={time.perf_counter()-started:.2f}', flush=True)

    batch_mask = builder.map_v2.repair(unary_union([bbox_geometry(z) for z in zones]))
    batch_bounds = batch_mask.bounds
    admin0 = builder.fast.fetch_json_retry(builder.map_v2.ADMIN0_URL)
    print(f'PHASE admin0 seconds={time.perf_counter()-started:.2f}', flush=True)

    # Only inspect ADM0 features whose cheap raw bounds can intersect this batch.
    candidate_features = []
    for feature in admin0.get('features', []):
        if bbox_intersects(raw_geometry_bounds(feature.get('geometry')), batch_bounds):
            candidate_features.append(feature)
    batch_admin0 = {'type': 'FeatureCollection', 'features': candidate_features}
    original_targets = builder.target_admin0_features(batch_admin0, set(plan['targetContinents']))
    targets = []
    for feature, geom in original_targets:
        clipped = builder.map_v2.repair(geom.intersection(batch_mask))
        if not clipped.is_empty and builder.map_v2.area_sqkm(clipped) >= 8:
            targets.append((feature, clipped))
    wanted_mask = builder.target_mask(targets)
    print(f'PHASE target_mask targets={len(targets)} seconds={time.perf_counter()-started:.2f}', flush=True)

    geo = json.loads(builder.BASE_GEO.read_text())
    meta_doc = json.loads(builder.BASE_META.read_text())
    resources = json.loads(builder.BASE_RESOURCES.read_text())
    base_count = len(geo.get('features', []))

    # Crucial optimisation: do not repair/simplify/index the whole world twice.
    # For subtraction/coverage this batch only needs existing geometries whose
    # raw envelopes can intersect the active batch mask.
    local_features = [
        f for f in geo['features']
        if bbox_intersects(raw_geometry_bounds(f.get('geometry')), batch_bounds)
    ]
    phase = time.perf_counter()
    existing_geoms = [builder.map_v2.repair(shape(f['geometry'])) for f in local_features]
    existing_geoms = [g for g in existing_geoms if not g.is_empty]
    existing_tree = STRtree(existing_geoms)
    print(f'PHASE existing_index local={len(existing_geoms)} total={base_count} seconds={time.perf_counter()-phase:.2f}', flush=True)

    phase = time.perf_counter()
    pieces = build_source_units(builder, targets, existing_geoms, existing_tree)
    print(f'SOURCE_PIECES={len(pieces)}', flush=True)
    print(f'PHASE source_units seconds={time.perf_counter()-phase:.2f}', flush=True)
    grouped = builder.assign_to_zones(pieces, zones)

    new_regions = []
    phase = time.perf_counter()
    for zone in zones:
        source = grouped.get(zone['id'], [])
        if not source:
            print(f"ZONE_SKIP {zone['id']} already covered or no source pieces", flush=True)
            continue
        clusters = builder.fast.cluster_regions_fast(source, zone['targetRegions'])
        regions = builder.make_regions(zone, clusters)
        print(f"ZONE {zone['id']} pieces={len(source)} regions={len(regions)} area={sum(r['areaSqKm'] for r in regions):.0f}", flush=True)
        new_regions.extend(regions)
    print(f'PHASE clustering seconds={time.perf_counter()-phase:.2f}', flush=True)

    phase = time.perf_counter()
    builder.map_v2.add_land_adjacency(geo['features'], meta_doc['regions'], new_regions)
    print(f'PHASE adjacency seconds={time.perf_counter()-phase:.2f}', flush=True)

    ids = {f['properties']['id'] for f in geo['features']}
    for region in new_regions:
        if region['id'] in ids:
            raise RuntimeError(f"Duplicate generated region id {region['id']}")
        ids.add(region['id'])
        geo['features'].append({
            'type': 'Feature',
            'properties': {
                'id': region['id'], 'name': region['name'], 'sourceGroup': region['sourceGroup'],
                'navigationContinent': region['navigationContinent'], 'navigationGroup': region['navigationGroup'],
            },
            'geometry': mapping(region['geometry']),
        })
        meta_doc['regions'].append({
            'id': region['id'], 'name': region['name'], 'centroid': region['centroid'],
            'areaSqKm': region['areaSqKm'], 'neighbors': region['neighbors'],
        })
        resources[region['id']] = builder.endowment(region)

    target_area = builder.map_v2.area_sqkm(wanted_mask)
    covered_area, coverage_ratio = local_coverage(builder, wanted_mask, existing_geoms, existing_tree, new_regions)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out/'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',',':')))
    (out/'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',',':')))
    (out/'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',',':')))
    review = [
        {'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup'],'sourceUnits':r['sourceUnits'],
         'areaSqKm':round(r['areaSqKm'],1),'neighbors':len(r['neighbors'])}
        for r in new_regions
    ]
    (out/f'{args.batch}-region-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    report = {
        'batch': args.batch, 'baseRegions': base_count, 'newRegions': len(new_regions),
        'totalRegions': len(geo['features']), 'targetAreaSqKm': round(target_area,1),
        'coveredTargetAreaSqKm': round(covered_area,1), 'targetCoverageRatio': coverage_ratio,
        'regionsByZone': {zone['id']: sum(1 for r in new_regions if r['sourceGroup']==zone['id']) for zone in zones},
    }
    (out/f'{args.batch}-coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(f'BASE_REGIONS={base_count}', flush=True)
    print(f'NEW_REGIONS={len(new_regions)}', flush=True)
    print(f'TOTAL_REGIONS={len(geo["features"])}', flush=True)
    print(f'TARGET_COVERAGE_RATIO={coverage_ratio:.6f}', flush=True)
    print(f'PHASE total seconds={time.perf_counter()-started:.2f}', flush=True)
    if coverage_ratio < 0.985:
        raise RuntimeError(f'{args.batch} target coverage only {coverage_ratio:.3%}')


if __name__ == '__main__':
    main()
