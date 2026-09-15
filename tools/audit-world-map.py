#!/usr/bin/env python3
"""Audit the checked-in world map for ocean voids and suspicious land regions.

This is diagnostic only: it never mutates map data. It compares the current sea
coverage with Natural Earth ocean geometry and reports large uncovered water
components, then inspects unusually large land regions and modern-country
memberships around Germany/Kaliningrad.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
LAND = ROOT / 'data/world/regions.geo.json'
SEA = ROOT / 'data/world/seaRegions.geo.json'
NAV = ROOT / 'data/world/region-navigation.json'
OCEAN_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_ocean.geojson'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD = Geod(ellps='WGS84')


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': 'Sim-World world-map-audit/1.0'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def area_sqkm(geom):
    if geom.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / 1_000_000.0


def feature_id(feature):
    return str((feature.get('properties') or {}).get('id') or '')


def feature_name(feature):
    p = feature.get('properties') or {}
    return str(p.get('name') or p.get('NAME') or p.get('id') or '?')


def main():
    land = json.loads(LAND.read_text())
    sea = json.loads(SEA.read_text())
    nav = json.loads(NAV.read_text()) if NAV.exists() else {'regions': {}}

    land_features = land.get('features', [])
    sea_features = sea.get('features', [])
    print(f'LAND_REGIONS={len(land_features)}')
    print(f'SEA_REGIONS={len(sea_features)}')

    # Large land regions are often legitimate in sparsely populated geography,
    # but the sorted report makes accidental continent-swallowing obvious.
    land_rows = []
    for f in land_features:
        geom = shape(f['geometry'])
        rid = feature_id(f)
        memberships = nav.get('regions', {}).get(rid, [])
        land_rows.append((area_sqkm(geom), rid, feature_name(f), geom.bounds, memberships))
    land_rows.sort(reverse=True)
    print('LARGEST_LAND_REGIONS')
    for area, rid, name, bounds, memberships in land_rows[:25]:
        print(json.dumps({'id': rid, 'name': name, 'areaSqKm': round(area), 'bounds': [round(x, 2) for x in bounds], 'navigation': memberships}, ensure_ascii=False))

    admin0 = fetch_json(ADMIN0_URL)
    country_geoms = {}
    for f in admin0.get('features', []):
        p = f.get('properties') or {}
        name = str(p.get('NAME_EN') or p.get('ADMIN') or p.get('NAME') or '')
        if name in {'Germany', 'Russia', 'Russian Federation'}:
            country_geoms[name] = shape(f['geometry'])
    germany = country_geoms.get('Germany')
    russia = country_geoms.get('Russia') or country_geoms.get('Russian Federation')
    if germany is not None:
        print('GERMANY_INTERSECTING_REGIONS')
        rows = []
        for area, rid, name, bounds, memberships in land_rows:
            geom = next(shape(f['geometry']) for f in land_features if feature_id(f) == rid)
            overlap = geom.intersection(germany)
            if overlap.is_empty:
                continue
            germany_km2 = area_sqkm(overlap)
            if germany_km2 < 10:
                continue
            russia_km2 = area_sqkm(geom.intersection(russia)) if russia is not None else 0
            rows.append((germany_km2, {'id': rid, 'name': name, 'regionAreaSqKm': round(area), 'germanyOverlapSqKm': round(germany_km2), 'russiaOverlapSqKm': round(russia_km2), 'bounds': [round(x, 2) for x in bounds], 'navigation': memberships}))
        for _, row in sorted(rows, reverse=True):
            print(json.dumps(row, ensure_ascii=False))

    # Compare explicit sea regions against real ocean geometry. Limit to the
    # playable globe (Antarctica is intentionally not simulated yet).
    ocean_doc = fetch_json(OCEAN_URL)
    ocean = unary_union([shape(f['geometry']) for f in ocean_doc.get('features', [])])
    playable = box(-180, -60, 180, 85)
    ocean = ocean.intersection(playable)
    sea_union = unary_union([shape(f['geometry']) for f in sea_features]) if sea_features else unary_union([])
    uncovered = ocean.difference(sea_union)
    components = list(uncovered.geoms) if hasattr(uncovered, 'geoms') else [uncovered]
    voids = []
    for geom in components:
        a = area_sqkm(geom)
        if a < 25_000:
            continue
        c = geom.representative_point()
        voids.append((a, {'areaSqKm': round(a), 'representativeLonLat': [round(c.x, 2), round(c.y, 2)], 'bounds': [round(x, 2) for x in geom.bounds]}))
    voids.sort(reverse=True)
    uncovered_area = sum(a for a, _ in voids)
    ocean_area = area_sqkm(ocean)
    print(f'LARGE_OCEAN_VOIDS={len(voids)}')
    print(f'LARGE_OCEAN_VOID_AREA_SQKM={round(uncovered_area)}')
    print(f'PLAYABLE_OCEAN_AREA_SQKM={round(ocean_area)}')
    print(f'LARGE_VOID_SHARE_PCT={uncovered_area / max(ocean_area, 1) * 100:.2f}')
    print('LARGEST_OCEAN_VOIDS')
    for _, row in voids[:40]:
        print(json.dumps(row))


if __name__ == '__main__':
    main()
