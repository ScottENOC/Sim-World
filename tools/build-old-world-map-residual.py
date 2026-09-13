#!/usr/bin/env python3
"""Fill land left between bounded Old World / Asia-Pacific batch masks.

The five main batches deliberately use bounded physical-zone envelopes for speed.
This final pass considers the full target landmass, subtracts the already-built
map through an STRtree, and assigns only genuine residual pieces to the nearest
physical zone. It preserves geography-first grouping without lowering coverage.
"""
import importlib.util
import json
import time
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
BATCH_PATH = ROOT / 'tools' / 'build-old-world-map-batch.py'
BUILDER_PATH = ROOT / 'tools' / 'build-old-world-asia-pacific.py'
PLAN_PATH = ROOT / 'tools' / 'map-region-plan-old-world-pacific.json'
WORLD = ROOT / 'data' / 'world'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    started = time.perf_counter()
    batch = load(BATCH_PATH, 'old_world_batch_residual')
    builder = load(BUILDER_PATH, 'old_world_builder_residual')
    plan = json.loads(PLAN_PATH.read_text())
    zones = plan['zones']

    geo = json.loads((WORLD / 'regions.geo.json').read_text())
    meta_doc = json.loads((WORLD / 'regions.meta.json').read_text())
    resources = json.loads((WORLD / 'resources.initial.json').read_text())
    base_count = len(geo['features'])

    admin0 = builder.fast.fetch_json_retry(builder.map_v2.ADMIN0_URL, attempts=2, timeout=30)
    targets = builder.target_admin0_features(admin0, set(plan['targetContinents']))
    wanted_mask = builder.target_mask(targets)

    existing_geoms = [builder.map_v2.repair(shape(f['geometry'])) for f in geo['features']]
    existing_geoms = [g for g in existing_geoms if not g.is_empty]
    existing_tree = STRtree(existing_geoms)
    print(f'RESIDUAL existing={len(existing_geoms)} targets={len(targets)}', flush=True)

    phase = time.perf_counter()
    pieces = batch.build_source_units(builder, targets, existing_geoms, existing_tree)
    print(f'RESIDUAL source_pieces={len(pieces)} seconds={time.perf_counter()-phase:.2f}', flush=True)

    grouped = builder.assign_to_zones(pieces, zones)
    new_regions = []
    for zone in zones:
        source = grouped.get(zone['id'], [])
        if not source:
            continue
        # Residual pieces are already sparse. Preserve detail up to the zone's
        # intended density rather than forcing a second full zone rebuild.
        target = min(zone['targetRegions'], len(source))
        clusters = builder.fast.cluster_regions_fast(source, target)
        regions = builder.make_regions(zone, clusters)
        print(f"RESIDUAL_ZONE {zone['id']} pieces={len(source)} regions={len(regions)}", flush=True)
        new_regions.extend(regions)

    builder.map_v2.add_land_adjacency(geo['features'], meta_doc['regions'], new_regions)
    ids = {f['properties']['id'] for f in geo['features']}
    for region in new_regions:
        if region['id'] in ids:
            # A residual sharing the same stable display name as an existing
            # region is folded by skipping it; coverage validation below still
            # catches any meaningful missing land.
            print(f"RESIDUAL_DUPLICATE_SKIP {region['id']}", flush=True)
            continue
        ids.add(region['id'])
        geo['features'].append({
            'type': 'Feature',
            'properties': {
                'id': region['id'], 'name': region['name'],
                'sourceGroup': region['sourceGroup'],
                'navigationContinent': region['navigationContinent'],
                'navigationGroup': region['navigationGroup'],
            },
            'geometry': mapping(region['geometry']),
        })
        meta_doc['regions'].append({
            'id': region['id'], 'name': region['name'],
            'centroid': region['centroid'], 'areaSqKm': region['areaSqKm'],
            'neighbors': region['neighbors'],
        })
        resources[region['id']] = builder.endowment(region)

    # Use the same local coverage method as the batch runner, now against the
    # full intended target. This avoids a giant whole-world dissolve.
    covered_area, ratio = batch.local_coverage(builder, wanted_mask, existing_geoms, existing_tree, new_regions)
    target_area = builder.map_v2.area_sqkm(wanted_mask)
    print(f'RESIDUAL new={len(new_regions)} total={len(geo["features"])} coverage={ratio:.6f} seconds={time.perf_counter()-started:.2f}', flush=True)
    if ratio < 0.985:
        raise RuntimeError(f'Residual fill left target coverage at {ratio:.3%}')

    (WORLD / 'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    (WORLD / 'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    (WORLD / 'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))
    (WORLD / 'old-world-pacific-residual.json').write_text(json.dumps({
        'beforeRegions': base_count,
        'residualRegions': len(new_regions),
        'totalRegions': len(geo['features']),
        'targetAreaSqKm': round(target_area, 1),
        'coverageRatioAfterResidual': ratio,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
