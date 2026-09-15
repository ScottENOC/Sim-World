#!/usr/bin/env python3
"""Move any remaining foreign-majority components out of Sermersooq.

This is an idempotent safety pass. Modern country geometry is used only to prove
that a disconnected component belongs overwhelmingly to another physical country;
unknown/oceanic pieces stay untouched rather than being guessed away.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'data' / 'world'
GEO = WORLD / 'regions.geo.json'
META = WORLD / 'regions.meta.json'
SERMERSOOQ = 'r2_a75df4701f6'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD = Geod(ellps='WGS84')


def repair(g):
    return g if g.is_empty or g.is_valid else g.buffer(0)


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


def set_meta(meta, rid, name, geom):
    c = geom.representative_point()
    row = meta[rid]
    row['name'] = name
    row['centroid'] = [c.x, c.y]
    row['areaSqKm'] = area_km2(geom)


def main():
    geo = json.loads(GEO.read_text())
    meta_doc = json.loads(META.read_text())
    features = geo['features']
    by_id = {f['properties']['id']: f for f in features}
    meta = {m['id']: m for m in meta_doc['regions']}
    if SERMERSOOQ not in by_id:
        raise RuntimeError('Sermersooq region missing')

    req = urllib.request.Request(ADMIN0_URL, headers={'User-Agent': 'Sim-World Sermersooq cleanup/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        admin = json.load(response)
    countries = [(code(f), repair(shape(f['geometry']))) for f in admin['features']]

    serm_feature = by_id[SERMERSOOQ]
    serm_geom = repair(shape(serm_feature['geometry']))
    keep, detached = [], []
    for part in polygons(serm_geom):
        part_area = area_km2(part)
        best_code, best_overlap = '?', 0.0
        for iso, country in countries:
            if not part.intersects(country):
                continue
            overlap = area_km2(part.intersection(country))
            if overlap > best_overlap:
                best_code, best_overlap = iso, overlap
        foreign_majority = best_code not in {'GRL', '?'} and best_overlap >= part_area * 0.5
        (detached if foreign_majority else keep).append(part)

    if not detached:
        print('SERMERSOOQ_FOREIGN_COMPONENTS_MOVED=0')
        return

    new_serm = repair(unary_union(keep))
    recipients = [(rid, repair(shape(feature['geometry']))) for rid, feature in by_id.items() if rid != SERMERSOOQ]
    moved = {}
    for part in detached:
        target_id, _ = min(recipients, key=lambda row: part.distance(row[1]))
        moved.setdefault(target_id, []).append(part)

    serm_feature['geometry'] = mapping(new_serm)
    set_meta(meta, SERMERSOOQ, serm_feature['properties']['name'], new_serm)
    for target_id, extras in moved.items():
        feature = by_id[target_id]
        merged = repair(unary_union([shape(feature['geometry']), *extras]))
        feature['geometry'] = mapping(merged)
        set_meta(meta, target_id, feature['properties']['name'], merged)

    GEO.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    META.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    print(f'SERMERSOOQ_FOREIGN_COMPONENTS_MOVED={len(detached)}')
    print(f'SERMERSOOQ_RECIPIENT_REGIONS={len(moved)}')


if __name__ == '__main__':
    main()
