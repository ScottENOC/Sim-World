#!/usr/bin/env python3
import argparse
import json
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'sea-region-expansion-plan.json'
BASE_SEA_GEO = ROOT / 'data' / 'world' / 'seaRegions.geo.json'
BASE_SEA_META = ROOT / 'data' / 'world' / 'seaRegions.meta.json'
WORLD_LAND_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD = Geod(ellps='WGS84')
USER_AGENT = 'Sim-World sea map builder/1.1'


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def repair(geom):
    if geom.is_empty:
        return geom
    return geom if geom.is_valid else geom.buffer(0)


def area_sqkm(geom):
    if geom.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / 1_000_000.0


def candidate_geometry(spec):
    if spec.get('polygon'):
        return repair(Polygon(spec['polygon']))
    return box(*spec['bbox'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--land-geo', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()

    plan = json.loads(PLAN.read_text())
    land_geo = json.loads(Path(args.land_geo).read_text())
    base_geo = json.loads(BASE_SEA_GEO.read_text())
    base_meta = json.loads(BASE_SEA_META.read_text())
    world_land = fetch_json(WORLD_LAND_URL)

    global_land = repair(unary_union([repair(shape(f['geometry'])) for f in world_land.get('features', [])]))
    simulated_land = []
    by_key = {}
    for f in land_geo.get('features', []):
        props = f['properties']
        item = (props['id'], props.get('name', ''), props.get('sourceGroup', ''), repair(shape(f['geometry'])))
        simulated_land.append(item)
        by_key[(item[2], item[1])] = item

    occupied_sea = repair(unary_union([repair(shape(f['geometry'])) for f in base_geo.get('features', [])]))
    tolerance = float(plan.get('coastalToleranceDegrees', 0.06))
    new_features = []
    new_meta = []

    for spec in plan['regions']:
        candidate = candidate_geometry(spec)
        water = repair(candidate.difference(global_land))
        if not occupied_sea.is_empty:
            water = repair(water.difference(occupied_sea))
        if water.is_empty or area_sqkm(water) < 100:
            print(f"SKIP {spec['id']}: no substantial unclaimed water")
            continue

        centroid = water.centroid
        adjacent = []
        adjacent_names = []
        curated = spec.get('coastalRegions')
        if curated:
            for ref in curated:
                key = (ref['sourceGroup'], ref['name'])
                item = by_key.get(key)
                if item is None:
                    raise RuntimeError(f"{spec['id']}: curated coastal region not found: {key[0]}:{key[1]}")
                adjacent.append(item[0])
                adjacent_names.append(f"{item[2]}:{item[1]}")
        else:
            for land_id, land_name, source_group, geom in simulated_land:
                if geom.distance(water) <= tolerance:
                    adjacent.append(land_id)
                    adjacent_names.append(f"{source_group}:{land_name}")
        adjacent = sorted(set(adjacent))
        adjacent_names = sorted(set(adjacent_names), key=str.casefold)

        new_features.append({
            'type': 'Feature',
            'properties': {'id': spec['id'], 'name': spec['name']},
            'geometry': mapping(water),
        })
        new_meta.append({
            'id': spec['id'], 'name': spec['name'],
            'centroid': [centroid.x, centroid.y],
            'areaSqKm': area_sqkm(water),
            'adjacentLand': adjacent,
        })
        occupied_sea = repair(unary_union([occupied_sea, water]))
        print(f"SEA {spec['name']}: area={area_sqkm(water):.0f} km² coastals={len(adjacent)}")
        print('  COASTALS=' + ', '.join(adjacent_names))

    ids = [f['properties']['id'] for f in base_geo['features']] + [f['properties']['id'] for f in new_features]
    if len(ids) != len(set(ids)):
        raise RuntimeError('Duplicate sea-region IDs')
    if any(not m['adjacentLand'] for m in new_meta):
        empty = [m['name'] for m in new_meta if not m['adjacentLand']]
        raise RuntimeError('New sea regions without mapped coastal land: ' + ', '.join(empty))

    base_geo['features'].extend(new_features)
    base_meta['seaRegions'].extend(new_meta)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'seaRegions.geo.json').write_text(json.dumps(base_geo, ensure_ascii=False, separators=(',', ':')))
    (out / 'seaRegions.meta.json').write_text(json.dumps(base_meta, ensure_ascii=False, separators=(',', ':')))
    (out / 'sea-coastal-review.json').write_text(json.dumps(new_meta, ensure_ascii=False, indent=2) + '\n')
    print(f'BASE_SEAS={len(base_geo["features"])-len(new_features)}')
    print(f'NEW_SEAS={len(new_features)}')
    print(f'TOTAL_SEAS={len(base_geo["features"])}')


if __name__ == '__main__':
    main()
