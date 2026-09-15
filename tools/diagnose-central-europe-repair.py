#!/usr/bin/env python3
"""Report disconnected components of Central Europe repair regions.

Used to distinguish legitimate nearby islands/coastal fragments from grossly
misassigned land before relaxing any compactness regression.
"""
from __future__ import annotations

import json
from pathlib import Path
from pyproj import Geod
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
GEOD = Geod(ellps='WGS84')
FOCUS = {'r_fix_24ab08cc313', 'r_fix_d2fad79581a'}


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
        for c in g.geoms:
            out.extend(polygons(c))
    return out


def main():
    geo = json.loads(GEO.read_text())
    for feature in geo['features']:
        p = feature.get('properties') or {}
        if p.get('id') not in FOCUS:
            continue
        geom = shape(feature['geometry'])
        parts = sorted(polygons(geom), key=area_km2, reverse=True)
        core = parts[0]
        print(f"REGION {p['id']} {p.get('name')} total={area_km2(geom):.1f} parts={len(parts)} core={area_km2(core):.1f}")
        for i, part in enumerate(parts):
            a = area_km2(part)
            if i > 0 and a < 0.5:
                continue
            print('  PART', i,
                  f'area={a:.2f}',
                  f'distanceDeg={part.distance(core):.5f}',
                  'bounds=' + repr(tuple(round(x, 4) for x in part.bounds)))

if __name__ == '__main__':
    main()
