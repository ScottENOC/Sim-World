#!/usr/bin/env python3
"""Reassign detached mainland polygons without changing the world footprint.

Generated administrative-source differences can leave a region owning many
remote mainland scraps. Treat every original polygon component as an immutable
atom, choose the largest atom of each region as its core, and change only the
owner id of detached atoms that physically meet another region's core. Genuine
islands and archipelagos therefore stay with their original owner, while the
world land union is exactly conserved by construction.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from pyproj import Geod
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

GEOD = Geod(ellps='WGS84')
SEAM_TOL_DEG = 0.003
ADJ_TOL_DEG = 0.025
CONSERVATION_TOL = 1e-10


def repair(g):
    if g.is_empty:
        return g
    return g if g.is_valid else g.buffer(0)


def polygons(g):
    if g.is_empty:
        return
    if g.geom_type == 'Polygon':
        yield g
    elif hasattr(g, 'geoms'):
        for child in g.geoms:
            yield from polygons(child)


def geod_area_km2(g):
    if g.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(g)
    return abs(area) / 1_000_000.0


def parts_by_area(g):
    return sorted((repair(p) for p in polygons(g) if not p.is_empty), key=geod_area_km2, reverse=True)


def combine(parts):
    parts = [p for p in parts if not p.is_empty]
    if not parts:
        return MultiPolygon([])
    return repair(parts[0] if len(parts) == 1 else unary_union(parts))


def total_area(geoms):
    """Legacy/reporting metric: sum of per-region geodetic areas."""
    return sum(geod_area_km2(g) for g in geoms)


def global_union(geoms):
    parts = [g for g in geoms if not g.is_empty]
    return repair(unary_union(parts)) if parts else MultiPolygon([])


def shared_boundary_length(a, b):
    try:
        intersection = a.boundary.intersection(b.boundary)
    except Exception:
        return 0.0
    if intersection is None or getattr(intersection, 'is_empty', True):
        return 0.0
    return float(getattr(intersection, 'length', 0.0) or 0.0)


def assign_atoms(geoms, ids):
    """Return rebuilt geometries after one deterministic immutable-atom pass."""
    parts_cache = [parts_by_area(g) for g in geoms]
    cores = [parts[0] if parts else MultiPolygon([]) for parts in parts_cache]
    core_tree = STRtree(cores)
    core_areas = [geod_area_km2(core) for core in cores]

    owned_parts = [[] for _ in geoms]
    moved = 0

    for owner_idx, parts in enumerate(parts_cache):
        if not parts:
            raise RuntimeError(f'ownership repair found empty region {ids[owner_idx]}')

        # The largest component is the stable core and can never be transferred.
        owned_parts[owner_idx].append(parts[0])

        for part in parts[1:]:
            own_core = cores[owner_idx]
            if part.distance(own_core) <= SEAM_TOL_DEG:
                owned_parts[owner_idx].append(part)
                continue

            best = None
            for raw_idx in core_tree.query(part.buffer(SEAM_TOL_DEG)):
                idx = int(raw_idx)
                if idx == owner_idx or cores[idx].is_empty:
                    continue
                distance = part.distance(cores[idx])
                if distance > SEAM_TOL_DEG:
                    continue
                shared = shared_boundary_length(part, cores[idx]) if distance <= 1e-7 else 0.0
                score = (
                    1 if shared > 1e-8 else 0,
                    shared,
                    -distance,
                    core_areas[idx],
                    ids[idx],
                )
                if best is None or score > best[0]:
                    best = (score, idx)

            if best is None:
                # No mainland core physically claims this component: preserve a
                # genuine island/archipelago or isolated source component.
                owned_parts[owner_idx].append(part)
            else:
                owned_parts[best[1]].append(part)
                moved += 1

    rebuilt = []
    for idx, parts in enumerate(owned_parts):
        if not parts:
            raise RuntimeError(f'ownership repair would empty region {ids[idx]}')
        rebuilt.append(combine(parts))
    return rebuilt, moved


def transfer_pass(geoms, ids):
    """Compatibility wrapper retained for regression tests and callers."""
    return assign_atoms(geoms, ids)


def conservation_fraction(before_geoms, after_geoms):
    """Measure change in the global world footprint, ignoring ownership only."""
    before = global_union(before_geoms)
    after = global_union(after_geoms)
    base_area = max(1.0, geod_area_km2(before))
    delta = repair(before.symmetric_difference(after))
    return geod_area_km2(delta) / base_area


def rebuild_meta(features, geoms, meta_doc):
    by_id = {m['id']: m for m in meta_doc.get('regions', [])}
    ids = [f['properties']['id'] for f in features]
    for idx, (feature, geom) in enumerate(zip(features, geoms)):
        rid = ids[idx]
        feature['geometry'] = mapping(geom)
        meta = by_id.get(rid)
        if meta is None:
            meta = {'id': rid, 'name': feature['properties'].get('name', rid)}
            meta_doc.setdefault('regions', []).append(meta)
            by_id[rid] = meta
        point = geom.representative_point()
        meta['centroid'] = [point.x, point.y]
        meta['areaSqKm'] = geod_area_km2(geom)
        meta['neighbors'] = []

    tree = STRtree(geoms)
    for i, geom in enumerate(geoms):
        minx, miny, maxx, maxy = geom.bounds
        for raw_j in tree.query(geom.buffer(ADJ_TOL_DEG)):
            j = int(raw_j)
            if j <= i:
                continue
            other = geoms[j]
            ominx, ominy, omaxx, omaxy = other.bounds
            if (
                omaxx < minx - ADJ_TOL_DEG
                or ominx > maxx + ADJ_TOL_DEG
                or omaxy < miny - ADJ_TOL_DEG
                or ominy > maxy + ADJ_TOL_DEG
            ):
                continue
            if geom.distance(other) <= ADJ_TOL_DEG:
                by_id[ids[i]]['neighbors'].append(ids[j])
                by_id[ids[j]]['neighbors'].append(ids[i])
    for meta in meta_doc.get('regions', []):
        meta['neighbors'] = sorted(set(meta.get('neighbors', [])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geo', default='data/world/regions.geo.json')
    parser.add_argument('--meta', default='data/world/regions.meta.json')
    parser.add_argument('--output-geo')
    parser.add_argument('--output-meta')
    args = parser.parse_args()

    geo_path = Path(args.geo)
    meta_path = Path(args.meta)
    geo = json.loads(geo_path.read_text())
    meta = json.loads(meta_path.read_text())
    features = geo.get('features', [])
    ids = [f['properties']['id'] for f in features]
    before_geoms = [repair(shape(f['geometry'])) for f in features]
    before_area = total_area(before_geoms)
    before_parts = sum(len(parts_by_area(g)) for g in before_geoms)

    geoms, moved = assign_atoms(before_geoms, ids)
    print(f'OWNERSHIP_ATOM_PASS MOVED_COMPONENTS={moved}')

    footprint_change = conservation_fraction(before_geoms, geoms)
    if footprint_change > CONSERVATION_TOL:
        raise RuntimeError(
            f'ownership repair changed global land footprint fraction={footprint_change:.3e}'
        )

    rebuild_meta(features, geoms, meta)
    after_area = total_area(geoms)
    after_parts = sum(len(parts_by_area(g)) for g in geoms)
    sum_area_change = abs(after_area - before_area) / max(1.0, before_area)

    out_geo = Path(args.output_geo or args.geo)
    out_meta = Path(args.output_meta or args.meta)
    out_geo.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    out_meta.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))

    print(f'REGIONS={len(features)}')
    print(f'MOVED_COMPONENTS_TOTAL={moved}')
    print(f'POLYGON_PARTS_BEFORE={before_parts}')
    print(f'POLYGON_PARTS_AFTER={after_parts}')
    print(f'LAND_AREA_SUM_BEFORE_KM2={before_area:.3f}')
    print(f'LAND_AREA_SUM_AFTER_KM2={after_area:.3f}')
    print(f'SUM_AREA_CHANGE_FRACTION={sum_area_change:.3e}')
    print(f'GLOBAL_FOOTPRINT_CHANGE_FRACTION={footprint_change:.3e}')


if __name__ == '__main__':
    main()
