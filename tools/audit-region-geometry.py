#!/usr/bin/env python3
"""Audit canonical land-region geometry for implausibly complex boundaries.

The audit intentionally does not modify geometry. It calculates several shape
metrics for every feature in data/world/oldworld.geojson, with emphasis on the
scale-normalised perimeter/sqrt(area) ratio (equivalently inverse
Polsby-Popper compactness). High values are candidates for manual inspection,
not automatic smoothing: coastlines, islands and narrow physical corridors can
be legitimate outliers.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a, b):
    lon1, lat1 = map(math.radians, a[:2])
    lon2, lat2 = map(math.radians, b[:2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def ring_perimeter_km(ring):
    if len(ring) < 2:
        return 0.0
    total = sum(haversine_km(a, b) for a, b in zip(ring, ring[1:]))
    if ring[0][:2] != ring[-1][:2]:
        total += haversine_km(ring[-1], ring[0])
    return total


def ring_area_km2(ring):
    """Signed spherical polygon area using the Chamberlain-Duquette form."""
    if len(ring) < 3:
        return 0.0
    coords = ring if ring[0][:2] == ring[-1][:2] else [*ring, ring[0]]
    total = 0.0
    for a, b in zip(coords, coords[1:]):
        lon1, lat1 = map(math.radians, a[:2])
        lon2, lat2 = map(math.radians, b[:2])
        dlon = lon2 - lon1
        while dlon > math.pi:
            dlon -= 2 * math.pi
        while dlon < -math.pi:
            dlon += 2 * math.pi
        total += dlon * (2 + math.sin(lat1) + math.sin(lat2))
    return -total * EARTH_RADIUS_KM ** 2 / 2


def polygon_metrics(poly):
    if not poly:
        return 0.0, 0.0, 0
    ring_areas = [abs(ring_area_km2(r)) for r in poly]
    area = ring_areas[0] - sum(ring_areas[1:]) if ring_areas else 0.0
    perimeter = sum(ring_perimeter_km(r) for r in poly)
    return max(0.0, area), perimeter, len(poly)


def geometry_metrics(geometry):
    gtype = geometry.get('type')
    coords = geometry.get('coordinates') or []
    if gtype == 'Polygon':
        area, perimeter, rings = polygon_metrics(coords)
        return area, perimeter, 1, rings
    if gtype == 'MultiPolygon':
        parts = [polygon_metrics(poly) for poly in coords]
        return (
            sum(x[0] for x in parts),
            sum(x[1] for x in parts),
            len(coords),
            sum(x[2] for x in parts),
        )
    return 0.0, 0.0, 0, 0


def label_for(feature):
    props = feature.get('properties') or {}
    for key in ('name', 'label', 'displayName', 'regionName', 'NAME_1', 'NAME', 'title'):
        if props.get(key):
            return str(props[key])
    return str(feature.get('id') or props.get('id') or '<unnamed>')


def feature_id(feature):
    props = feature.get('properties') or {}
    return str(feature.get('id') or props.get('id') or props.get('regionId') or '')


def robust_z(values):
    median = statistics.median(values)
    deviations = [abs(v - median) for v in values]
    mad = statistics.median(deviations) or 1e-9
    return median, mad, [0.67448975 * (v - median) / mad for v in values]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geojson', default='data/world/oldworld.geojson')
    parser.add_argument('--top', type=int, default=60)
    parser.add_argument('--focus', default='Kursk')
    parser.add_argument('--json', dest='json_path')
    args = parser.parse_args()

    data = json.loads(Path(args.geojson).read_text(encoding='utf-8'))
    rows = []
    for feature in data.get('features', []):
        area, perimeter, components, rings = geometry_metrics(feature.get('geometry') or {})
        if area <= 0 or perimeter <= 0:
            compactness = 0.0
            norm_ratio = float('inf')
            pp_inverse = float('inf')
        else:
            norm_ratio = perimeter / math.sqrt(area)
            compactness = 4 * math.pi * area / (perimeter * perimeter)
            pp_inverse = 1 / compactness if compactness > 0 else float('inf')
        props = feature.get('properties') or {}
        rows.append({
            'id': feature_id(feature),
            'name': label_for(feature),
            'area_km2': area,
            'perimeter_km': perimeter,
            'perimeter_per_area': perimeter / area if area else float('inf'),
            'perimeter_per_sqrt_area': norm_ratio,
            'polsby_popper': compactness,
            'inverse_polsby_popper': pp_inverse,
            'components': components,
            'rings': rings,
            'properties': props,
        })

    finite = [r['perimeter_per_sqrt_area'] for r in rows if math.isfinite(r['perimeter_per_sqrt_area'])]
    median, mad, zs = robust_z(finite)
    zi = iter(zs)
    for row in rows:
        row['robust_z'] = next(zi) if math.isfinite(row['perimeter_per_sqrt_area']) else float('inf')
        row['flag'] = (
            row['robust_z'] >= 5.0
            or row['polsby_popper'] < 0.08
            or row['components'] > 4
            or row['area_km2'] <= 0
        )

    focus = args.focus.casefold()
    focus_rows = [r for r in rows if focus in r['name'].casefold() or focus in r['id'].casefold() or any(focus in str(v).casefold() for v in r['properties'].values())]
    ranked = sorted(rows, key=lambda r: (r['perimeter_per_sqrt_area'], r['components']), reverse=True)

    print(f'Region geometry audit: {len(rows)} land features')
    print(f'perimeter/sqrt(area) median={median:.3f}, MAD={mad:.3f}')
    print(f'flagged for manual review: {sum(r["flag"] for r in rows)}')
    print()
    print(f'FOCUS: {args.focus} ({len(focus_rows)} matches)')
    for r in focus_rows:
        print(json.dumps(r, ensure_ascii=False, default=str))
    print()
    print(f'TOP {args.top} BY perimeter/sqrt(area)')
    print('rank\tid\tname\tarea_km2\tperimeter_km\tP/sqrt(A)\tPP\trobust_z\tcomponents\trings\tflag')
    for idx, r in enumerate(ranked[:args.top], 1):
        print(f'{idx}\t{r["id"]}\t{r["name"]}\t{r["area_km2"]:.1f}\t{r["perimeter_km"]:.1f}\t{r["perimeter_per_sqrt_area"]:.3f}\t{r["polsby_popper"]:.4f}\t{r["robust_z"]:.2f}\t{r["components"]}\t{r["rings"]}\t{r["flag"]}')

    if args.json_path:
        clean_rows = []
        for r in rows:
            c = dict(r)
            c.pop('properties', None)
            for key, value in list(c.items()):
                if isinstance(value, float) and not math.isfinite(value):
                    c[key] = None
            clean_rows.append(c)
        Path(args.json_path).write_text(json.dumps({
            'feature_count': len(rows),
            'median_perimeter_per_sqrt_area': median,
            'mad_perimeter_per_sqrt_area': mad,
            'focus': focus_rows,
            'regions': clean_rows,
        }, indent=2, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
