#!/usr/bin/env python3
"""Move grossly detached components out of Central-Europe repair regions.

The seven replacement regions are broad physical zones and may legitimately contain
nearby coastal islands. This pass therefore does not try to make them single-part.
It only moves components more than one degree from the replacement region's main
landmass to the physically nearest pre-existing region. That threshold preserves
local North Sea/Baltic islands while removing the British/Welsh scraps diagnosed
in the malformed Kaliningrad source geometry.
"""
from __future__ import annotations

import json
from pathlib import Path

from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'data' / 'world'
GEO = WORLD / 'regions.geo.json'
META = WORLD / 'regions.meta.json'
SOURCE_GROUP = 'central_europe_repair_v1'
MAX_LOCAL_DISTANCE_DEG = 1.0
MIN_COMPONENT_KM2 = 0.01
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
    replacements = [
        f for f in features
        if (f.get('properties') or {}).get('sourceGroup') == SOURCE_GROUP
    ]
    if not replacements:
        raise RuntimeError('Central-Europe repair regions missing')

    replacement_ids = {f['properties']['id'] for f in replacements}
    recipients = [
        (rid, repair(shape(feature['geometry'])))
        for rid, feature in by_id.items()
        if rid not in replacement_ids
    ]

    moved_by_target = {}
    moved_count = 0
    moved_area = 0.0
    for feature in replacements:
        rid = feature['properties']['id']
        geom = repair(shape(feature['geometry']))
        parts = sorted(polygons(geom), key=area_km2, reverse=True)
        if not parts:
            raise RuntimeError(f'empty Central-Europe replacement {rid}')
        core = parts[0]
        keep = [core]
        for part in parts[1:]:
            part_area = area_km2(part)
            if part_area >= MIN_COMPONENT_KM2 and part.distance(core) > MAX_LOCAL_DISTANCE_DEG:
                target_id, _ = min(recipients, key=lambda row: part.distance(row[1]))
                moved_by_target.setdefault(target_id, []).append(part)
                moved_count += 1
                moved_area += part_area
            else:
                keep.append(part)
        cleaned = repair(unary_union(keep))
        feature['geometry'] = mapping(cleaned)
        set_meta(meta, rid, feature['properties']['name'], cleaned)

    for target_id, extras in moved_by_target.items():
        feature = by_id[target_id]
        merged = repair(unary_union([shape(feature['geometry']), *extras]))
        feature['geometry'] = mapping(merged)
        set_meta(meta, target_id, feature['properties']['name'], merged)

    GEO.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    META.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    print(f'CENTRAL_EUROPE_REMOTE_COMPONENTS_MOVED={moved_count}')
    print(f'CENTRAL_EUROPE_REMOTE_AREA_SQKM={moved_area:.3f}')
    print(f'CENTRAL_EUROPE_REMOTE_RECIPIENTS={len(moved_by_target)}')


if __name__ == '__main__':
    main()
