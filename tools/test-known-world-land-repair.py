#!/usr/bin/env python3
"""Regression checks for the Central Europe / Greenland ownership repair."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
BROKEN_KAL = 'r2_81f83805b72'
GOOD_KAL = 'r2_8d84d0f082a'
SERMERSOOQ = 'r2_a75df4701f6'
MAX_REPLACEMENT_COMPONENT_DISTANCE_DEG = 1.0
MIN_GROSS_COMPONENT_KM2 = 0.01
GEOD = Geod(ellps='WGS84')


def area_km2(g):
    if g.is_empty:
        return 0.0
    a, _ = GEOD.geometry_area_perimeter(g)
    return abs(a) / 1_000_000.0


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    out = []
    if hasattr(g, 'geoms'):
        for child in g.geoms:
            out.extend(polygons(child))
    return out


def code(feature):
    p = feature.get('properties') or {}
    return str(p.get('ADM0_A3') or p.get('adm0_a3') or p.get('ISO_A3') or p.get('iso_a3') or '?')


def main():
    geo = json.loads(GEO.read_text())
    features = geo['features']
    by_id = {f['properties']['id']: f for f in features}
    assert BROKEN_KAL not in by_id, 'malformed Kaliningrad owner remains'
    assert GOOD_KAL in by_id, 'real Kaliningrad disappeared'
    assert SERMERSOOQ in by_id, 'Sermersooq disappeared'

    kal = shape(by_id[GOOD_KAL]['geometry'])
    minx, miny, maxx, maxy = kal.bounds
    assert 18 <= minx and maxx <= 24 and 53 <= miny and maxy <= 56.5, kal.bounds

    replacements = [f for f in features if (f.get('properties') or {}).get('sourceGroup') == 'central_europe_repair_v1']
    assert 5 <= len(replacements) <= 9, len(replacements)
    gross_detached = []
    for feature in replacements:
        g = shape(feature['geometry'])
        assert g.bounds[0] > -10 and g.bounds[2] < 19, (feature['properties']['name'], g.bounds)
        parts = sorted(polygons(g), key=area_km2, reverse=True)
        assert parts, feature['properties']['name']
        core = parts[0]
        for part in parts[1:]:
            part_area = area_km2(part)
            distance = part.distance(core)
            if part_area >= MIN_GROSS_COMPONENT_KM2 and distance > MAX_REPLACEMENT_COMPONENT_DISTANCE_DEG:
                gross_detached.append((
                    feature['properties']['name'],
                    round(part_area, 3),
                    round(distance, 3),
                    tuple(round(x, 3) for x in part.bounds),
                ))
    assert not gross_detached, f'gross detached Central-Europe components remain: {gross_detached[:12]}'

    req = urllib.request.Request(ADMIN0_URL, headers={'User-Agent': 'Sim-World land repair test/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        admin = json.load(response)
    countries = [(code(f), shape(f['geometry'])) for f in admin['features']]

    serm = shape(by_id[SERMERSOOQ]['geometry'])
    assert area_km2(serm) > 680_000, f'Sermersooq lost too much land: {area_km2(serm):.1f} km2'
    foreign = []
    for part in polygons(serm):
        part_area = area_km2(part)
        if part_area < 1.0:
            continue
        best_code, best_overlap = '?', 0.0
        for iso, country in countries:
            if not part.intersects(country):
                continue
            overlap = area_km2(part.intersection(country))
            if overlap > best_overlap:
                best_code, best_overlap = iso, overlap
        if best_code not in {'GRL', '?'} and best_overlap >= part_area * 0.5:
            foreign.append((best_code, round(part_area, 1), round(best_overlap, 1), tuple(round(x, 3) for x in part.bounds)))
    assert not foreign, f'foreign-majority components remain in Sermersooq: {foreign[:12]}'

    assert len(features) >= 1842, len(features)
    print(f'LAND_REPAIR_REGIONS={len(features)}')
    print(f'CENTRAL_EUROPE_REPLACEMENTS={len(replacements)}')
    print(f'SERMERSOOQ_AREA_SQKM={area_km2(serm):.1f}')
    print('known world land repair regression passed')


if __name__ == '__main__':
    main()
