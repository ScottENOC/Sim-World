#!/usr/bin/env python3
"""Absorb uncovered Old World / Asia-Pacific land into existing physical regions.

Unlike the legacy residual builder, this pass never creates a second cohort of
regions. It finds genuine uncovered source pieces, assigns each to its physical
zone, and unions it into the nearest existing region in that same zone.
"""
import importlib.util
import json
import time
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union
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
    batch = load(BATCH_PATH, 'old_world_batch_absorb')
    builder = load(BUILDER_PATH, 'old_world_builder_absorb')
    plan = json.loads(PLAN_PATH.read_text())
    zones = plan['zones']

    geo = json.loads((WORLD / 'regions.geo.json').read_text())
    meta_doc = json.loads((WORLD / 'regions.meta.json').read_text())
    features = geo['features']
    before_count = len(features)

    admin0 = builder.fast.fetch_json_retry(builder.map_v2.ADMIN0_URL, attempts=2, timeout=30)
    targets = builder.target_admin0_features(admin0, set(plan['targetContinents']))
    wanted_mask = builder.target_mask(targets)

    geoms = [builder.map_v2.repair(shape(f['geometry'])) for f in features]
    tree = STRtree(geoms)
    pieces = batch.build_source_units(builder, targets, geoms, tree)
    grouped = builder.assign_to_zones(pieces, zones)

    by_zone = {}
    for idx, feature in enumerate(features):
        zone_id = (feature.get('properties') or {}).get('sourceGroup')
        if zone_id:
            by_zone.setdefault(zone_id, []).append(idx)

    additions = {idx: [] for idx in range(len(features))}
    absorbed_pieces = 0
    absorbed_area = 0.0
    for zone in zones:
        source = grouped.get(zone['id'], [])
        if not source:
            continue
        candidates = by_zone.get(zone['id'], [])
        if not candidates:
            raise RuntimeError(f"No existing region available for residual zone {zone['id']}")
        for piece in source:
            geom = piece['geometry']
            best_idx = min(
                candidates,
                key=lambda idx: (
                    geom.distance(geoms[idx]),
                    geom.centroid.distance(geoms[idx].centroid),
                ),
            )
            additions[best_idx].append(geom)
            absorbed_pieces += 1
            absorbed_area += builder.map_v2.area_sqkm(geom)
        print(f"ABSORB_ZONE {zone['id']} pieces={len(source)} owners={len(candidates)}", flush=True)

    meta_by_id = {m['id']: m for m in meta_doc.get('regions', [])}
    changed_regions = 0
    for idx, extra in additions.items():
        if not extra:
            continue
        merged = builder.map_v2.repair(unary_union([geoms[idx], *extra]))
        geoms[idx] = merged
        features[idx]['geometry'] = mapping(merged)
        rid = features[idx]['properties']['id']
        meta = meta_by_id.get(rid)
        if meta is None:
            raise RuntimeError(f'Missing metadata for {rid}')
        cen = merged.centroid
        meta['centroid'] = [cen.x, cen.y]
        meta['areaSqKm'] = builder.map_v2.area_sqkm(merged)
        changed_regions += 1

    coverage_tree = STRtree(geoms)
    covered_area, ratio = batch.local_coverage(builder, wanted_mask, geoms, coverage_tree, [])
    target_area = builder.map_v2.area_sqkm(wanted_mask)
    print(f'ABSORB_PIECES={absorbed_pieces}', flush=True)
    print(f'ABSORB_CHANGED_REGIONS={changed_regions}', flush=True)
    print(f'ABSORB_AREA_SQKM={absorbed_area:.1f}', flush=True)
    print(f'ABSORB_COVERAGE_RATIO={ratio:.6f}', flush=True)
    print(f'ABSORB_SECONDS={time.perf_counter()-started:.2f}', flush=True)
    if len(features) != before_count:
        raise RuntimeError('Residual absorption changed region count')
    if ratio < 0.995:
        raise RuntimeError(f'Residual absorption left target coverage at {ratio:.3%}')

    (WORLD / 'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    (WORLD / 'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    (WORLD / 'old-world-pacific-residual.json').write_text(json.dumps({
        'beforeRegions': before_count,
        'absorbedResidualPieces': absorbed_pieces,
        'changedRegions': changed_regions,
        'absorbedAreaSqKm': round(absorbed_area, 1),
        'totalRegions': len(features),
        'targetAreaSqKm': round(target_area, 1),
        'coverageRatioAfterAbsorption': ratio,
        'strategy': 'absorb-into-existing-regions',
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
