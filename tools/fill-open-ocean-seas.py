#!/usr/bin/env python3
"""Fill otherwise-unmodelled ocean with broad fallback sea regions.

Named/strategic seas always win. Existing fallback regions (``sea_open_*``) are
removed and rebuilt, so this script can safely be rerun after later geography
tranches add more meaningful seas. The fallback layer exists to eliminate map
voids and provide traversable ocean, not to replace strategic water geography.
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
BASE_SEA_GEO = ROOT / 'data/world/seaRegions.geo.json'
BASE_SEA_META = ROOT / 'data/world/seaRegions.meta.json'
WORLD_LAND_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD = Geod(ellps='WGS84')
USER_AGENT = 'Sim-World open-ocean fill/1.0'
PREFIX = 'sea_open_'
MIN_SEA_AREA_SQKM = 20_000
COASTAL_TOLERANCE = 0.06


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def repair(geom):
    if geom.is_empty:
        return geom
    return geom if geom.is_valid else geom.buffer(0)


def area_sqkm(geom):
    if geom.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / 1_000_000.0


def union_geoms(features):
    geoms = [repair(shape(feature['geometry'])) for feature in features]
    return repair(unary_union(geoms)) if geoms else None


def slug(value):
    return re.sub(r'[^a-z0-9]+', '_', value.casefold()).strip('_')


def longitude_label(west, east):
    mid = (west + east) / 2
    if abs(mid) < 7.5:
        return 'Central'
    if mid < 0:
        return f'{abs(round(mid))}°W'
    return f'{round(mid)}°E'


def latitude_label(south, north):
    mid = (south + north) / 2
    if mid >= 45:
        return 'Far North'
    if mid >= 20:
        return 'North'
    if mid >= 5:
        return 'Tropical North'
    if mid > -5:
        return 'Equatorial'
    if mid > -20:
        return 'Tropical South'
    if mid > -45:
        return 'South'
    return 'Far South'


def sectors():
    """Yield broad non-overlapping fallback ocean sectors.

    Sector boundaries are deliberately coarse. Fine strategic seas are already
    represented separately and are subtracted before fallback water is emitted.
    """
    bands = [(-60, -40), (-40, -20), (-20, 0), (0, 20), (20, 40), (40, 66)]
    basins = [
        ('Pacific', [(-180, -150), (-150, -120), (-120, -90), (-90, -70), (120, 150), (150, 180)]),
        ('Atlantic', [(-70, -40), (-40, -10), (-10, 20)]),
        ('Indian', [(20, 50), (50, 80), (80, 100), (100, 120)]),
    ]
    for basin, longitude_ranges in basins:
        for west, east in longitude_ranges:
            for south, north in bands:
                label = f'{latitude_label(south, north)} {basin} — {longitude_label(west, east)}'
                yield label, (west, south, east, north)
    for west, east in [(-180, -120), (-120, -60), (-60, 0), (0, 60), (60, 120), (120, 180)]:
        yield f'Arctic Ocean — {longitude_label(west, east)}', (west, 66, east, 85)


def rebuild_adjacency(sea_geo, sea_meta, land_geo):
    land = [(f['properties']['id'], repair(shape(f['geometry']))) for f in land_geo.get('features', [])]
    feature_by_id = {f['properties']['id']: f for f in sea_geo['features']}
    for meta in sea_meta['seaRegions']:
        feature = feature_by_id.get(meta['id'])
        if feature is None:
            continue
        water = repair(shape(feature['geometry']))
        point = water.representative_point()
        meta['centroid'] = [point.x, point.y]
        meta['areaSqKm'] = area_sqkm(water)
        minx, miny, maxx, maxy = water.bounds
        adjacent = []
        for land_id, geom in land:
            gx1, gy1, gx2, gy2 = geom.bounds
            if gx2 < minx-COASTAL_TOLERANCE or gx1 > maxx+COASTAL_TOLERANCE or gy2 < miny-COASTAL_TOLERANCE or gy1 > maxy+COASTAL_TOLERANCE:
                continue
            if geom.distance(water) <= COASTAL_TOLERANCE:
                adjacent.append(land_id)
        meta['adjacentLand'] = sorted(set(adjacent))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--land-geo', default='data/world/regions.geo.json')
    parser.add_argument('--sea-geo', default=str(BASE_SEA_GEO))
    parser.add_argument('--sea-meta', default=str(BASE_SEA_META))
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()

    land_geo = json.loads(Path(args.land_geo).read_text())
    sea_geo = json.loads(Path(args.sea_geo).read_text())
    sea_meta = json.loads(Path(args.sea_meta).read_text())

    # Rebuild fallback from scratch so named seas added by future tranches can
    # reclaim their water without bespoke carve rules.
    named_features = [f for f in sea_geo.get('features', []) if not str((f.get('properties') or {}).get('id', '')).startswith(PREFIX)]
    named_ids = {f['properties']['id'] for f in named_features}
    named_meta = [m for m in sea_meta.get('seaRegions', []) if m.get('id') in named_ids]
    sea_geo['features'] = named_features
    sea_meta['seaRegions'] = named_meta

    world_land_doc = fetch_json(WORLD_LAND_URL)
    global_land = repair(unary_union([repair(shape(f['geometry'])) for f in world_land_doc.get('features', [])]))
    occupied = union_geoms(named_features)
    fallback = []

    for label, bounds in sectors():
        candidate = repair(box(*bounds).difference(global_land))
        if occupied is not None:
            candidate = repair(candidate.difference(occupied))
        if candidate.is_empty or area_sqkm(candidate) < MIN_SEA_AREA_SQKM:
            continue
        sid = PREFIX + slug(label)
        point = candidate.representative_point()
        sea_geo['features'].append({
            'type': 'Feature',
            'properties': {'id': sid, 'name': label, 'fallback': True},
            'geometry': mapping(candidate),
        })
        sea_meta['seaRegions'].append({
            'id': sid,
            'name': label,
            'centroid': [point.x, point.y],
            'areaSqKm': area_sqkm(candidate),
            'adjacentLand': [],
            'fallback': True,
        })
        fallback.append((sid, label, area_sqkm(candidate)))
        occupied = candidate if occupied is None else repair(unary_union([occupied, candidate]))

    rebuild_adjacency(sea_geo, sea_meta, land_geo)
    ids = [f['properties']['id'] for f in sea_geo['features']]
    if len(ids) != len(set(ids)):
        raise RuntimeError('duplicate sea region ids after fallback fill')

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'seaRegions.geo.json').write_text(json.dumps(sea_geo, ensure_ascii=False, separators=(',', ':')))
    (out / 'seaRegions.meta.json').write_text(json.dumps(sea_meta, ensure_ascii=False, separators=(',', ':')))
    (out / 'open-ocean-review.json').write_text(json.dumps([
        {'id': sid, 'name': label, 'areaSqKm': round(area, 1)} for sid, label, area in fallback
    ], ensure_ascii=False, indent=2) + '\n')
    print(f'NAMED_SEAS={len(named_features)}')
    print(f'FALLBACK_SEAS={len(fallback)}')
    print(f'TOTAL_SEAS={len(sea_geo["features"])}')
    print(f'FALLBACK_AREA_SQKM={sum(area for _, _, area in fallback):.0f}')


if __name__ == '__main__':
    main()
