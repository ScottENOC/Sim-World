#!/usr/bin/env python3
"""Repair two bounded geography defects found in the reconstructed world map.

1. Natural Earth's admin-0 country mask can omit the Crimean Peninsula even
   though the admin-1 source contains its physical coastline. Geography-first
   simulation needs the peninsula regardless of political ownership, so create
   one durable physical region from the admin-1 Crimea/Sevastopol geometries.
2. A tiny residual source fragment named "Fennoscandian Shield — Northern
   Ostrobothnia" was promoted to a standalone region despite being a scattered
   seam between already-existing Finnish regions. Reassign each component to
   the physically adjacent/nearest real region instead.

This script deliberately does not assign modern sovereignty. Region navigation
and scenario control are separate layers built after physical geography.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import urllib.request
from pathlib import Path

from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
MAP_V2_PATH = ROOT / 'tools' / 'build-map-expansion-v2.py'
ADMIN1_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
USER_AGENT = 'Sim-World physical geography repair/1.0'
CRIMEA_NAME = 'Crimean Peninsula'
CRIMEA_ID = 'r_fix_crimean_peninsula'
MALFORMED_FINLAND_NAME = 'Fennoscandian Shield — Northern Ostrobothnia'
ADJ_TOL = 0.025

spec = importlib.util.spec_from_file_location('map_v2_crimea_finland', MAP_V2_PATH)
map_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(map_v2)


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def feature_name(feature):
    props = feature.get('properties') or {}
    return str(props.get('name') or props.get('name_en') or props.get('gn_name') or props.get('NAME_1') or '').strip()


def crimea_source_geometry():
    admin1 = fetch_json(ADMIN1_URL)
    parts = []
    matched = []
    for feature in admin1.get('features', []):
        name = feature_name(feature)
        normal = name.casefold()
        # Crimea and the administratively separate Sevastopol source together
        # describe the physical peninsula. This is geometry, not sovereignty.
        if 'crimea' not in normal and 'krym' not in normal and 'sevastopol' not in normal:
            continue
        geom = map_v2.repair(shape(feature['geometry']))
        if geom.is_empty:
            continue
        # Guard against an unrelated namesake elsewhere in the source dataset.
        cx, cy = geom.centroid.x, geom.centroid.y
        if not (32.0 <= cx <= 37.0 and 44.0 <= cy <= 47.0):
            continue
        parts.append(geom)
        matched.append(name)
    if not parts:
        raise RuntimeError('Natural Earth ADM1 did not expose Crimea/Sevastopol geometry')
    geom = map_v2.repair(unary_union(parts))
    print('CRIMEA_SOURCE_FEATURES=' + ','.join(sorted(set(matched))), flush=True)
    print(f'CRIMEA_SOURCE_AREA_SQKM={map_v2.area_sqkm(geom):.1f}', flush=True)
    return geom


def polygons(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [geom]
    if hasattr(geom, 'geoms'):
        out = []
        for child in geom.geoms:
            out.extend(polygons(child))
        return out
    return []


def nearest_resource_template(resources, features, geoms, point):
    best_id = None
    best_distance = float('inf')
    for feature, geom in zip(features, geoms):
        rid = (feature.get('properties') or {}).get('id')
        if not rid or rid not in resources or geom.is_empty:
            continue
        distance = geom.distance(point)
        if distance < best_distance:
            best_distance = distance
            best_id = rid
    if best_id is None:
        return {'landQuality': 0.55, 'forestFraction': 0.18, 'forestStartCoverage': 0.60, 'deposits': {}}
    return copy.deepcopy(resources[best_id])


def absorb_malformed_finland(features, meta_by_id, resources):
    target_index = next((i for i, feature in enumerate(features)
                         if (feature.get('properties') or {}).get('name') == MALFORMED_FINLAND_NAME), None)
    if target_index is None:
        print('FINLAND_RESIDUAL=already_absent', flush=True)
        return []

    target = features[target_index]
    target_id = target['properties']['id']
    target_geom = map_v2.repair(shape(target['geometry']))
    components = polygons(target_geom)

    candidate_features = [feature for i, feature in enumerate(features) if i != target_index]
    candidate_geoms = [map_v2.repair(shape(feature['geometry'])) for feature in candidate_features]
    tree = STRtree(candidate_geoms)
    additions: dict[int, list] = {}
    transfers = []

    for component in components:
        search = component.buffer(0.5)
        indices = [int(i) for i in tree.query(search)]
        if not indices:
            indices = list(range(len(candidate_geoms)))
        best = None
        for idx in indices:
            geom = candidate_geoms[idx]
            if geom.is_empty:
                continue
            shared = component.boundary.intersection(geom.boundary).length
            distance = component.distance(geom)
            centroid_distance = component.centroid.distance(geom.centroid)
            score = (shared > 1e-10, shared, -distance, -centroid_distance)
            if best is None or score > best[0]:
                best = (score, idx)
        if best is None:
            raise RuntimeError('Could not find an owner for a malformed Finland residual component')
        idx = best[1]
        additions.setdefault(idx, []).append(component)
        owner = candidate_features[idx]
        transfers.append({
            'ownerId': owner['properties']['id'],
            'ownerName': owner['properties'].get('name', owner['properties']['id']),
            'areaSqKm': round(map_v2.area_sqkm(component), 3),
        })

    changed_ids = []
    for idx, extras in additions.items():
        merged = map_v2.repair(unary_union([candidate_geoms[idx], *extras]))
        candidate_geoms[idx] = merged
        owner = candidate_features[idx]
        owner['geometry'] = mapping(merged)
        rid = owner['properties']['id']
        changed_ids.append(rid)
        meta = meta_by_id[rid]
        cen = merged.centroid
        meta['centroid'] = [cen.x, cen.y]
        meta['areaSqKm'] = map_v2.area_sqkm(merged)

    features.pop(target_index)
    meta_by_id.pop(target_id, None)
    resources.pop(target_id, None)
    print(f'FINLAND_RESIDUAL_REMOVED={target_id}', flush=True)
    print('FINLAND_RESIDUAL_TRANSFERS=' + json.dumps(transfers, ensure_ascii=False, separators=(',', ':')), flush=True)
    return changed_ids


def add_crimea(features, meta_by_id, resources):
    if CRIMEA_ID in meta_by_id or any((f.get('properties') or {}).get('name') == CRIMEA_NAME for f in features):
        print('CRIMEA_REGION=already_present', flush=True)
        return CRIMEA_ID

    source = crimea_source_geometry()
    existing_geoms = [map_v2.repair(shape(feature['geometry'])) for feature in features]
    tree = STRtree(existing_geoms)
    overlaps = []
    for raw_idx in tree.query(source):
        geom = existing_geoms[int(raw_idx)]
        if geom.intersects(source):
            overlaps.append(geom)
    coverage = map_v2.repair(unary_union(overlaps)) if overlaps else None
    geom = source if coverage is None else map_v2.repair(source.difference(coverage))
    area = map_v2.area_sqkm(geom)
    if area < 10_000:
        raise RuntimeError(f'Crimean Peninsula uncovered geometry unexpectedly small: {area:.1f} km²')

    cen = geom.centroid
    features.append({
        'type': 'Feature',
        'properties': {
            'id': CRIMEA_ID,
            'name': CRIMEA_NAME,
            'sourceGroup': 'physical_crimea',
            'navigationContinent': 'Europe',
            'navigationGroup': CRIMEA_NAME,
        },
        'geometry': mapping(geom),
    })
    meta_by_id[CRIMEA_ID] = {
        'id': CRIMEA_ID,
        'name': CRIMEA_NAME,
        'centroid': [cen.x, cen.y],
        'areaSqKm': area,
        'neighbors': [],
    }
    resources[CRIMEA_ID] = nearest_resource_template(resources, features[:-1], existing_geoms, cen)
    print(f'CRIMEA_REGION_ADDED={CRIMEA_ID} areaSqKm={area:.1f}', flush=True)
    return CRIMEA_ID


def recompute_adjacency(features, meta_by_id):
    geoms = [map_v2.repair(shape(feature['geometry'])) for feature in features]
    tree = STRtree(geoms)
    neighbors = {feature['properties']['id']: set() for feature in features}
    for i, geom in enumerate(geoms):
        rid = features[i]['properties']['id']
        for raw_j in tree.query(geom.buffer(ADJ_TOL)):
            j = int(raw_j)
            if j <= i:
                continue
            other = geoms[j]
            if geom.distance(other) > ADJ_TOL:
                continue
            oid = features[j]['properties']['id']
            neighbors[rid].add(oid)
            neighbors[oid].add(rid)
    for rid, values in neighbors.items():
        meta_by_id[rid]['neighbors'] = sorted(values)


def assert_point_owner(features, label, lon, lat, expected_name=None):
    point = Point(lon, lat)
    hits = [feature for feature in features if shape(feature['geometry']).covers(point)]
    if len(hits) != 1:
        names = [(feature.get('properties') or {}).get('name') for feature in hits]
        raise RuntimeError(f'{label}: expected exactly one land owner, found {names}')
    name = hits[0]['properties'].get('name')
    if expected_name and name != expected_name:
        raise RuntimeError(f'{label}: expected {expected_name}, found {name}')
    print(f'POINT_OWNER {label}={name}', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--world-dir', default='data/world')
    args = parser.parse_args()
    world = (ROOT / args.world_dir).resolve()

    geo_path = world / 'regions.geo.json'
    meta_path = world / 'regions.meta.json'
    resources_path = world / 'resources.initial.json'
    geo = json.loads(geo_path.read_text())
    meta_doc = json.loads(meta_path.read_text())
    resources = json.loads(resources_path.read_text())
    features = geo['features']
    meta_by_id = {item['id']: item for item in meta_doc['regions']}

    before_count = len(features)
    changed_finland = absorb_malformed_finland(features, meta_by_id, resources)
    crimea_id = add_crimea(features, meta_by_id, resources)
    recompute_adjacency(features, meta_by_id)

    # Preserve feature order, and metadata order for existing regions; append the
    # new physical region at the end. Removed metadata is omitted.
    ordered_ids = [feature['properties']['id'] for feature in features]
    meta_doc['regions'] = [meta_by_id[rid] for rid in ordered_ids]

    assert_point_owner(features, 'Crimea centre', 34.1, 45.3, CRIMEA_NAME)
    assert_point_owner(features, 'Simferopol', 34.1003, 44.9521, CRIMEA_NAME)
    assert_point_owner(features, 'Sevastopol', 33.5224, 44.6167, CRIMEA_NAME)
    assert_point_owner(features, 'Turku', 22.2666, 60.4518)
    assert_point_owner(features, 'Oulu', 25.4651, 65.0121)
    if any((feature.get('properties') or {}).get('name') == MALFORMED_FINLAND_NAME for feature in features):
        raise RuntimeError('Malformed Finland residual still present after repair')

    geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    meta_path.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    resources_path.write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))
    report = {
        'beforeRegions': before_count,
        'afterRegions': len(features),
        'crimeaRegionId': crimea_id,
        'crimeaRegionName': CRIMEA_NAME,
        'removedMalformedFinlandRegion': MALFORMED_FINLAND_NAME,
        'changedFinlandRegionIds': changed_finland,
        'scope': 'physical geography only; modern navigation and scenario control are separate layers',
    }
    (world / 'crimea-finland-geography-repair.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'GEOGRAPHY_REPAIR_REGIONS={before_count}->{len(features)}', flush=True)


if __name__ == '__main__':
    main()
