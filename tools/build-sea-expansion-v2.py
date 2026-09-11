#!/usr/bin/env python3
import argparse
import json
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'sea-region-expansion-plan-v2.json'
BASE_SEA_GEO = ROOT / 'data' / 'world' / 'seaRegions.geo.json'
BASE_SEA_META = ROOT / 'data' / 'world' / 'seaRegions.meta.json'
WORLD_LAND_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD = Geod(ellps='WGS84')
USER_AGENT = 'Sim-World sea expansion v2/1.1'


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def repair(g):
    if g.is_empty:
        return g
    return g if g.is_valid else g.buffer(0)


def area_sqkm(g):
    if g.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(g)
    return abs(area) / 1_000_000.0


def occupied_geometry(features):
    geoms = [repair(shape(f['geometry'])) for f in features]
    return repair(unary_union(geoms)) if geoms else None


def update_meta_geometry(meta, geom):
    c = geom.centroid
    meta['centroid'] = [c.x, c.y]
    meta['areaSqKm'] = area_sqkm(geom)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--land-geo', required=True)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    land_geo = json.loads(Path(args.land_geo).read_text())
    sea_geo = json.loads(BASE_SEA_GEO.read_text())
    sea_meta = json.loads(BASE_SEA_META.read_text())
    world_land = fetch_json(WORLD_LAND_URL)
    global_land = repair(unary_union([repair(shape(f['geometry'])) for f in world_land.get('features', [])]))
    simulated_land = occupied_geometry(land_geo.get('features', []))

    feature_by_id = {f['properties']['id']: f for f in sea_geo.get('features', [])}
    meta_by_id = {m['id']: m for m in sea_meta.get('seaRegions', [])}
    if simulated_land is not None:
        for sea_id, feature in feature_by_id.items():
            old_water = repair(shape(feature['geometry']))
            clipped = repair(old_water.difference(simulated_land))
            if clipped.is_empty or area_sqkm(clipped) < 100:
                raise RuntimeError(f'{sea_id}: simulated-land clipping consumed sea region')
            if not clipped.equals(old_water):
                feature['geometry'] = mapping(clipped)
                meta = meta_by_id.get(sea_id)
                if meta is not None:
                    update_meta_geometry(meta, clipped)
                removed = max(0.0, area_sqkm(old_water) - area_sqkm(clipped))
                print(f'SEA_RECLIP {sea_id} removedLandOverlap={removed:.1f} km²')
    existing_ids = set(feature_by_id)
    new_count = 0

    for spec in plan['regions']:
        if spec['id'] in existing_ids:
            print(f"SEA_SKIP {spec['id']} already exists")
            continue

        candidate = box(*spec['bbox'])
        candidate_water = repair(candidate.difference(global_land))
        if candidate_water.is_empty:
            print(f"SEA_SKIP {spec['id']} no water")
            continue

        carve_ids = list(spec.get('carveFromExisting') or [])
        if carve_ids:
            carved_parts = []
            for source_id in carve_ids:
                feature = feature_by_id.get(source_id)
                meta = meta_by_id.get(source_id)
                if feature is None or meta is None:
                    raise RuntimeError(f"{spec['id']}: carve source {source_id} not found")
                old = repair(shape(feature['geometry']))
                part = repair(old.intersection(candidate_water))
                if part.is_empty:
                    continue
                carved_parts.append(part)
                remainder = repair(old.difference(part))
                if remainder.is_empty or area_sqkm(remainder) < 100:
                    raise RuntimeError(f"{spec['id']}: carving would consume {source_id}")
                feature['geometry'] = mapping(remainder)
                update_meta_geometry(meta, remainder)
                print(f"SEA_CARVE {spec['id']} from {source_id}: {area_sqkm(part):.0f} km²")
            if not carved_parts:
                raise RuntimeError(f"{spec['id']}: requested carve produced no water")
            water = repair(unary_union(carved_parts))
        else:
            occupied = occupied_geometry(sea_geo.get('features', []))
            water = candidate_water if occupied is None else repair(candidate_water.difference(occupied))

        if water.is_empty or area_sqkm(water) < 100:
            print(f"SEA_SKIP {spec['id']} already covered or no substantial water")
            continue

        c = water.centroid
        feature = {
            'type': 'Feature',
            'properties': {'id': spec['id'], 'name': spec['name']},
            'geometry': mapping(water),
        }
        meta = {
            'id': spec['id'], 'name': spec['name'],
            'centroid': [c.x, c.y], 'areaSqKm': area_sqkm(water), 'adjacentLand': [],
        }
        sea_geo['features'].append(feature)
        sea_meta['seaRegions'].append(meta)
        feature_by_id[spec['id']] = feature
        meta_by_id[spec['id']] = meta
        existing_ids.add(spec['id'])
        new_count += 1
        print(f"SEA_ADD {spec['name']} area={area_sqkm(water):.0f}")

    # Recompute coastal links for every sea region so old Black Sea/Persian Gulf
    # polygons immediately recognise newly added Ukraine, Caucasus and Gulf land.
    tolerance = float(plan.get('coastalToleranceDegrees', 0.06))
    land = [(f['properties']['id'], f['properties'].get('name',''), repair(shape(f['geometry'])))
            for f in land_geo.get('features', [])]
    feature_by_id = {f['properties']['id']: f for f in sea_geo['features']}
    for meta in sea_meta['seaRegions']:
        feature = feature_by_id.get(meta['id'])
        if feature is None:
            continue
        water = repair(shape(feature['geometry']))
        update_meta_geometry(meta, water)
        minx, miny, maxx, maxy = water.bounds
        adjacent = []
        for land_id, land_name, g in land:
            gx1, gy1, gx2, gy2 = g.bounds
            if gx2 < minx-tolerance or gx1 > maxx+tolerance or gy2 < miny-tolerance or gy1 > maxy+tolerance:
                continue
            if g.distance(water) <= tolerance:
                adjacent.append(land_id)
        meta['adjacentLand'] = sorted(set(adjacent))
        if not meta['adjacentLand']:
            print(f"SEA_WARN no simulated coastals: {meta['name']}")

    ids = [f['properties']['id'] for f in sea_geo['features']]
    if len(ids) != len(set(ids)):
        raise RuntimeError('Duplicate sea-region IDs after v2 expansion')
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out/'seaRegions.geo.json').write_text(json.dumps(sea_geo, ensure_ascii=False, separators=(',',':')))
    (out/'seaRegions.meta.json').write_text(json.dumps(sea_meta, ensure_ascii=False, separators=(',',':')))
    review = [{'id':m['id'],'name':m['name'],'adjacentLandCount':len(m.get('adjacentLand',[])),
               'areaSqKm':round(m.get('areaSqKm',0),1)} for m in sea_meta['seaRegions']]
    (out/'v2-sea-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    print(f"NEW_SEAS={new_count}")
    print(f"TOTAL_SEAS={len(sea_geo['features'])}")


if __name__ == '__main__':
    main()
