#!/usr/bin/env python3
"""Canonicalise land GeoJSON before D3-aware spherical repair.

Shapely overlay operations can leave GeometryCollections containing hundreds of
numerically degenerate polygon fragments and rings. This first pass removes only
floating-point debris and emits ordinary Polygon/MultiPolygon geometry. A second
D3-aware pass repairs any remaining polygon whose spherical winding represents
the complement of the intended landmass, so meaningful land is preserved rather
than deleted to make the renderer happy.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.polygon import orient

# Degree². This is deliberately tiny: only floating-point debris is discarded.
# Meaningful fragments are retained and, if D3 interprets their winding as a
# spherical complement, repaired by tools/repair-d3-region-geometry.mjs.
DEFAULT_MIN_PART_AREA_DEG2 = 1e-10


def polygon_parts(geom):
    if geom.geom_type == 'Polygon':
        yield geom
    elif hasattr(geom, 'geoms'):
        for child in geom.geoms:
            yield from polygon_parts(child)


def clean_polygon(poly: Polygon, min_area: float):
    if poly.is_empty or poly.area <= min_area:
        return None
    holes = []
    for ring in poly.interiors:
        ring_poly = Polygon(ring)
        if not ring_poly.is_empty and ring_poly.area > min_area:
            holes.append(list(ring.coords))
    cleaned = Polygon(list(poly.exterior.coords), holes)
    if cleaned.is_empty or cleaned.area <= min_area:
        return None
    return orient(cleaned, sign=-1.0)


def canonical_geometry(raw_geometry, min_area: float):
    geom = shape(raw_geometry)
    parts = []
    for poly in polygon_parts(geom):
        cleaned = clean_polygon(poly, min_area)
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
    parser.add_argument('--min-part-area-deg2', type=float, default=DEFAULT_MIN_PART_AREA_DEG2)
    args = parser.parse_args()

    src = Path(args.input)
    dst = Path(args.output)
    doc = json.loads(src.read_text())
    changed = 0
    collection_count = 0
    before_parts = 0
    after_parts = 0
    removed_parts = 0
    planar_area_before = 0.0
    planar_area_after = 0.0
    max_feature_loss = 0.0
    max_feature_loss_id = None

    for feature in doc.get('features', []):
        original = feature.get('geometry') or {}
        geom = shape(original)
        parts_before = list(polygon_parts(geom))
        area_before = sum(poly.area for poly in parts_before)
        before_parts += len(parts_before)
        planar_area_before += area_before
        if geom.geom_type == 'GeometryCollection':
            collection_count += 1
        canonical, count_after = canonical_geometry(original, args.min_part_area_deg2)
        canonical_shape = shape(canonical)
        area_after = canonical_shape.area
        planar_area_after += area_after
        loss = max(0.0, area_before - area_after)
        if loss > max_feature_loss:
            max_feature_loss = loss
            max_feature_loss_id = feature.get('id') or feature.get('properties', {}).get('id')
        after_parts += count_after
        removed_parts += max(0, len(parts_before) - count_after)
        if canonical != original:
            feature['geometry'] = canonical
            changed += 1

    absolute_loss = max(0.0, planar_area_before - planar_area_after)
    loss_fraction = absolute_loss / planar_area_before if planar_area_before else 0.0
    dst.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    print(f'FEATURES={len(doc.get("features", []))}')
    print(f'CHANGED_FEATURES={changed}')
    print(f'GEOMETRY_COLLECTIONS={collection_count}')
    print(f'POLYGON_PARTS_BEFORE={before_parts}')
    print(f'POLYGON_PARTS_AFTER={after_parts}')
    print(f'REMOVED_NUMERICAL_PARTS={removed_parts}')
    print(f'PLANAR_AREA_BEFORE={planar_area_before:.12f}')
    print(f'PLANAR_AREA_AFTER={planar_area_after:.12f}')
    print(f'PLANAR_AREA_LOSS={absolute_loss:.12f}')
    print(f'PLANAR_AREA_LOSS_FRACTION={loss_fraction:.12e}')
    print(f'MAX_FEATURE_AREA_LOSS={max_feature_loss:.12f}')
    print(f'MAX_FEATURE_AREA_LOSS_ID={max_feature_loss_id}')
    print(f'MIN_PART_AREA_DEG2={args.min_part_area_deg2:.12g}')
    print(f'OUTPUT={dst}')

    if loss_fraction > 1e-8:
        raise SystemExit(f'geometry cleanup removed too much land area: {loss_fraction:.3e}')


if __name__ == '__main__':
    main()
