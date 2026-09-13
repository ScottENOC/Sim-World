#!/usr/bin/env python3
"""Canonicalise land GeoJSON for D3 rendering.

Shapely overlay operations can leave GeometryCollections containing hundreds of
microscopic polygon fragments and numerically degenerate rings. They are valid
planar geometries, but D3's spherical GeoJSON implementation can interpret a
near-zero closed ring as the complement of the intended polygon (effectively a
whole globe). This script keeps all meaningful polygon area, removes only
numerical debris, and emits canonical Polygon/MultiPolygon geometries with the
ring winding expected by the game's D3 renderer: clockwise exteriors and
counter-clockwise holes.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.polygon import orient

# Degrees squared. At the equator this is far below one square metre, so this
# only catches floating-point debris, not playable islands or enclaves.
MIN_RING_AREA_DEG2 = 1e-10


def polygon_parts(geom):
    if geom.geom_type == 'Polygon':
        yield geom
    elif hasattr(geom, 'geoms'):
        for child in geom.geoms:
            yield from polygon_parts(child)


def clean_polygon(poly: Polygon):
    if poly.is_empty or poly.area <= MIN_RING_AREA_DEG2:
        return None
    holes = []
    for ring in poly.interiors:
        ring_poly = Polygon(ring)
        if not ring_poly.is_empty and ring_poly.area > MIN_RING_AREA_DEG2:
            holes.append(list(ring.coords))
    cleaned = Polygon(list(poly.exterior.coords), holes)
    if cleaned.is_empty or cleaned.area <= MIN_RING_AREA_DEG2:
        return None
    # D3 spherical polygons use clockwise exteriors for ordinary (< hemisphere)
    # regions and counter-clockwise holes. Shapely's sign=-1 gives that layout.
    return orient(cleaned, sign=-1.0)


def canonical_geometry(raw_geometry):
    geom = shape(raw_geometry)
    parts = []
    for poly in polygon_parts(geom):
        cleaned = clean_polygon(poly)
        if cleaned is not None:
            parts.append(cleaned)
    if not parts:
        raise ValueError('land feature contains no non-degenerate polygon area')
    if len(parts) == 1:
        return mapping(parts[0]), 1
    return mapping(MultiPolygon(parts)), len(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='data/world/regions.geo.json')
    parser.add_argument('--output', default='data/world/regions.geo.normalized.json')
    args = parser.parse_args()

    src = Path(args.input)
    dst = Path(args.output)
    doc = json.loads(src.read_text())
    changed = 0
    collection_count = 0
    before_parts = 0
    after_parts = 0
    removed_parts = 0

    for feature in doc.get('features', []):
        original = feature.get('geometry') or {}
        geom = shape(original)
        parts_before = list(polygon_parts(geom))
        before_parts += len(parts_before)
        if geom.geom_type == 'GeometryCollection':
            collection_count += 1
        canonical, count_after = canonical_geometry(original)
        after_parts += count_after
        removed_parts += max(0, len(parts_before) - count_after)
        if canonical != original:
            feature['geometry'] = canonical
            changed += 1

    dst.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    print(f'FEATURES={len(doc.get("features", []))}')
    print(f'CHANGED_FEATURES={changed}')
    print(f'GEOMETRY_COLLECTIONS={collection_count}')
    print(f'POLYGON_PARTS_BEFORE={before_parts}')
    print(f'POLYGON_PARTS_AFTER={after_parts}')
    print(f'REMOVED_NUMERICAL_PARTS={removed_parts}')
    print(f'OUTPUT={dst}')


if __name__ == '__main__':
    main()
