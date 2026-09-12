#!/usr/bin/env python3
"""Add the Central Asian Silk Road and China to the live world map."""
import argparse
import importlib.util
import json
from pathlib import Path

from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[1]
FAST_PATH = ROOT / 'tools' / 'build-map-expansion-v2-fast.py'
spec = importlib.util.spec_from_file_location('map_fast_silk', FAST_PATH)
fast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fast)
map_v2 = fast.map_v2

PLAN = ROOT / 'tools' / 'map-region-plan-silk-road.json'
RESOURCE_PLAN = ROOT / 'tools' / 'map-resource-plan-silk-road.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'


def detailed_source_features(country, mask):
    """Use real geoBoundaries ADM2 when the plan explicitly asks for it."""
    iso = country['iso']
    level = country.get('level', 'ADM1')
    metadata = fast.fetch_json_retry(map_v2.GEOB_API.format(iso=iso, level=level))
    url = metadata.get('simplifiedGeometryGeoJSON') or metadata.get('gjDownloadURL')
    if not url:
        raise RuntimeError(f'{iso}: geoBoundaries returned no {level} GeoJSON')
    geo = fast.fetch_json_retry(url)
    min_area = float(country.get('minAreaSqKm', 300))
    max_lon = country.get('maxCentroidLongitude')
    min_lon = country.get('minLongitude')
    lon_clip = None
    if min_lon is not None or max_lon is not None:
        lon_clip = box(float(min_lon if min_lon is not None else -180), -90,
                       float(max_lon if max_lon is not None else 180), 90)
    pieces = []
    for feature in geo.get('features', []):
        name = map_v2.feature_name(feature)
        geom = map_v2.clean(shape(feature['geometry']))
        if mask is not None:
            geom = map_v2.repair(geom.intersection(mask))
        if lon_clip is not None:
            geom = map_v2.repair(geom.intersection(lon_clip))
        if geom.is_empty:
            continue
        geom = fast.subtract_existing(geom)
        if geom.is_empty:
            continue
        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        pieces.append({'geometry': geom, 'names': [name], 'anchor': name,
                       'anchorArea': area, 'mergeArea': geom.area})
    print(f'DETAILED_SOURCE {iso} level={level} pieces={len(pieces)}')
    return pieces


def endowment(region, resource_plan):
    profile = resource_plan['defaultsByISO'].get(region['sourceGroup'])
    if profile is None:
        raise RuntimeError(f"Missing resource plan for {region['sourceGroup']}")
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-silk-road')
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
    masks = fast.country_masks_with_hosts(admin0, {c['iso'] for c in plan['countries']})
    new_regions = []
    for country in plan['countries']:
        mask = masks.get(country['iso'])
        if country.get('level') == 'ADM2':
            pieces = detailed_source_features(country, mask)
        else:
            pieces = fast.source_features_fast(country, mask, None)
        if not pieces:
            print(f"COUNTRY_SKIP {country['iso']} no uncovered geography")
            continue
        clusters = fast.cluster_regions_fast(pieces, country['targetRegions'])
        regions = fast.make_game_regions_fast(country, clusters)
        print(f"COUNTRY {country['iso']} sourcePieces={len(pieces)} gameRegions={len(regions)} area={sum(r['areaSqKm'] for r in regions):.0f}")
        new_regions.extend(regions)

    map_v2.add_land_adjacency(geo['features'], meta_doc['regions'], new_regions)
    ids = {f['properties']['id'] for f in geo['features']}
    accepted = []
    for region in new_regions:
        if region['id'] in ids:
            raise RuntimeError(f"Duplicate generated region id {region['id']}")
        ids.add(region['id'])
        accepted.append(region)
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
    } for r in accepted]
    (out / 'silk-road-region-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
    isolated = [r['name'] for r in accepted if not r['neighbors']]
    print(f'BASE_REGIONS={expected}')
    print(f'NEW_REGIONS={len(accepted)}')
    print(f"TOTAL_REGIONS={len(geo['features'])}")
    print(f'ISOLATED_NEW_REGIONS={len(isolated)}')
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))


if __name__ == '__main__':
    main()
