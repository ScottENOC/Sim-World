#!/usr/bin/env python3
"""Add East Africa as durable physical gameplay regions.

Modern country/ADM2 data is used only as source geometry. Source pieces are
assigned to physical macro-zones and clustered across modern frontiers, so the
resulting simulation borders are geographic rather than 2026 political lines.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
FAST_PATH = ROOT / 'tools' / 'build-map-expansion-v2-fast.py'
spec = importlib.util.spec_from_file_location('map_fast_east_africa', FAST_PATH)
fast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fast)
map_v2 = fast.map_v2

PLAN = ROOT / 'tools' / 'map-region-plan-east-africa.json'
RESOURCE_PLAN = ROOT / 'tools' / 'map-resource-plan-east-africa.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'
MAX_SEAM_REPAIR_DEGREES = 0.20


def source_units(iso, mask, level, min_area):
    metadata = fast.fetch_json_retry(map_v2.GEOB_API.format(iso=iso, level=level))
    url = metadata.get('simplifiedGeometryGeoJSON') or metadata.get('gjDownloadURL')
    if not url:
        raise RuntimeError(f'{iso}: geoBoundaries returned no {level} geometry')
    geo = fast.fetch_json_retry(url)
    pieces = []
    for feature in geo.get('features', []):
        name = map_v2.feature_name(feature)
        geom = map_v2.clean(shape(feature['geometry']))
        if mask is not None:
            geom = map_v2.repair(geom.intersection(mask))
        if geom.is_empty:
            continue
        geom = fast.subtract_existing(geom)
        if geom.is_empty:
            continue
        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        pieces.append({
            'geometry': geom,
            'names': [name],
            'anchor': name,
            'anchorArea': area,
            'mergeArea': geom.area,
            'iso': iso,
        })
    print(f'SOURCE {iso} pieces={len(pieces)}')
    return pieces


def zone_score(piece, zone):
    c = piece['geometry'].centroid
    minx, miny, maxx, maxy = zone['bbox']
    inside = minx <= c.x <= maxx and miny <= c.y <= maxy
    zx, zy = zone['centre']
    sx = max(1.0, (maxx - minx) / 2)
    sy = max(1.0, (maxy - miny) / 2)
    distance = math.sqrt(((c.x - zx) / sx) ** 2 + ((c.y - zy) / sy) ** 2)
    return (0 if inside else 1, distance)


def assign_to_zones(pieces, zones):
    grouped = {z['id']: [] for z in zones}
    for piece in pieces:
        zone = min(zones, key=lambda z: zone_score(piece, z))
        grouped[zone['id']].append(piece)
    return grouped


def make_zone_regions(zone, clusters):
    if not clusters:
        return []
    used = set()
    out = []
    ordered = sorted(clusters, key=lambda x: (x['geometry'].centroid.y, x['geometry'].centroid.x), reverse=True)
    for idx, cluster in enumerate(ordered, start=1):
        anchor = cluster.get('anchor') or zone['name']
        if len(ordered) == 1:
            name = zone['name']
        elif len(cluster.get('names', [])) == 1:
            name = f"{zone['name']} — {anchor}"
        else:
            name = f"{zone['name']} — {anchor} hinterland"
        base = name
        n = 2
        while name in used:
            name = f'{base} {n}'
            n += 1
        used.add(name)
        cen = cluster['geometry'].centroid
        out.append({
            'id': map_v2.stable_id(zone['id'], name),
            'name': name,
            'sourceGroup': zone['id'],
            'sourceUnits': cluster.get('names', []),
            'geometry': cluster['geometry'],
            'centroid': [cen.x, cen.y],
            'areaSqKm': map_v2.area_sqkm(cluster['geometry']),
            'neighbors': [],
        })
    return out


def endowment(region, resource_plan):
    profile = resource_plan['defaultsByZone'].get(region['sourceGroup'])
    if profile is None:
        raise RuntimeError(f"Missing resource profile for {region['sourceGroup']}")
    result = {
        'landQuality': profile['landQuality'],
        'forestFraction': profile['forestFraction'],
        'forestStartCoverage': profile['forestStartCoverage'],
        'deposits': {key: map_v2.make_deposit(key, magnitude)
                     for key, magnitude in profile.get('deposits', {}).items()},
    }
    if profile.get('specialResources'):
        result['specialResources'] = profile['specialResources']
    return result


def repair_tiny_adjacency_seams(base_features, base_meta, new_regions):
    meta_by_id = {m['id']: m for m in base_meta}
    base_geoms = [(f['properties']['id'], f['properties'].get('name', ''), map_v2.repair(shape(f['geometry'])))
                  for f in base_features]
    new_by_id = {r['id']: r for r in new_regions}
    all_candidates = base_geoms + [(r['id'], r['name'], r['geometry']) for r in new_regions]
    for region in new_regions:
        if region['neighbors']:
            continue
        best = None
        for other_id, other_name, other_geom in all_candidates:
            if other_id == region['id']:
                continue
            distance = region['geometry'].distance(other_geom)
            if best is None or distance < best[0]:
                best = (distance, other_id, other_name)
        if best is None or best[0] > MAX_SEAM_REPAIR_DEGREES:
            print(f"SEAM_REPAIR_REFUSED {region['name']} nearest={best}")
            continue
        distance, other_id, other_name = best
        region['neighbors'] = sorted(set(region['neighbors'] + [other_id]))
        if other_id in new_by_id:
            other = new_by_id[other_id]
            other['neighbors'] = sorted(set(other['neighbors'] + [region['id']]))
        elif other_id in meta_by_id:
            meta = meta_by_id[other_id]
            meta['neighbors'] = sorted(set(meta.get('neighbors', []) + [region['id']]))
        print(f"SEAM_REPAIR {region['name']} -> {other_name} distance={distance:.5f}deg")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-east-africa')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    resource_plan = json.loads(RESOURCE_PLAN.read_text())
    geo = json.loads(BASE_GEO.read_text())
    meta_doc = json.loads(BASE_META.read_text())
    resources = json.loads(BASE_RESOURCES.read_text())
    expected = int(plan['targetExistingRegionCount'])
    if len(geo.get('features', [])) != expected:
        raise RuntimeError(f"Base map has {len(geo.get('features', []))}; expected {expected}")

    fast.prepare_existing_index(geo['features'])
    admin0 = fast.fetch_json_retry(map_v2.ADMIN0_URL)
    masks = fast.country_masks_with_hosts(admin0, set(plan['sourceCountries']))

    raw = []
    for iso in plan['sourceCountries']:
        raw.extend(source_units(iso, masks.get(iso), plan.get('sourceLevel', 'ADM2'),
                                float(plan.get('minSourceAreaSqKm', 120))))
    if not raw:
        raise RuntimeError('East Africa builder found no uncovered source geography')

    grouped = assign_to_zones(raw, plan['zones'])
    new_regions = []
    for zone in plan['zones']:
        pieces = grouped.get(zone['id'], [])
        if not pieces:
            print(f"ZONE_SKIP {zone['id']} no source pieces")
            continue
        clusters = fast.cluster_regions_fast(pieces, zone['targetRegions'])
        regions = make_zone_regions(zone, clusters)
        print(f"ZONE {zone['id']} pieces={len(pieces)} regions={len(regions)} area={sum(r['areaSqKm'] for r in regions):.0f}")
        new_regions.extend(regions)

    map_v2.add_land_adjacency(geo['features'], meta_doc['regions'], new_regions)
    repair_tiny_adjacency_seams(geo['features'], meta_doc['regions'], new_regions)

    ids = {f['properties']['id'] for f in geo['features']}
    for region in new_regions:
        if region['id'] in ids:
            raise RuntimeError(f"Duplicate generated region id {region['id']}")
        ids.add(region['id'])
        geo['features'].append({
            'type': 'Feature',
            'properties': {'id': region['id'], 'name': region['name'], 'sourceGroup': region['sourceGroup']},
            'geometry': map_v2.mapping(region['geometry']),
        })
        meta_doc['regions'].append({
            'id': region['id'], 'name': region['name'], 'centroid': region['centroid'],
            'areaSqKm': region['areaSqKm'], 'neighbors': region['neighbors'],
        })
        resources[region['id']] = endowment(region, resource_plan)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    (out / 'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    (out / 'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))
    review = [{
        'id': r['id'], 'name': r['name'], 'sourceGroup': r['sourceGroup'],
        'sourceUnits': r['sourceUnits'], 'areaSqKm': round(r['areaSqKm'], 1),
        'neighbors': len(r['neighbors']),
    } for r in new_regions]
    (out / 'east-africa-region-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
    isolated = [r['name'] for r in new_regions if not r['neighbors']]
    print(f'BASE_REGIONS={expected}')
    print(f'NEW_REGIONS={len(new_regions)}')
    print(f"TOTAL_REGIONS={len(geo['features'])}")
    print(f'ISOLATED_NEW_REGIONS={len(isolated)}')
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))


if __name__ == '__main__':
    main()
