#!/usr/bin/env python3
"""Reassign detached mainland polygons to physically adjacent region cores.

Generated administrative-source differences can leave a region owning hundreds
of disconnected mainland scraps. This pass never deletes geometry: detached
components that share a border (or a sub-kilometre source seam) with another
region are transferred to the best adjacent owner. Components with no adjacent
land owner remain with their existing region, preserving genuine islands and
archipelagos.
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
MAX_PASSES = 4


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
    return sorted((repair(p) for p in polygons(g)), key=geod_area_km2, reverse=True)


def combine(parts):
    parts = [p for p in parts if not p.is_empty]
    if not parts:
        return MultiPolygon([])
    return repair(parts[0] if len(parts) == 1 else unary_union(parts))


def total_area(geoms):
    return sum(geod_area_km2(g) for g in geoms)


def shared_boundary_length(a, b):
    """Return planar shared-boundary length, tolerating degenerate GEOS results."""
    try:
        intersection = a.boundary.intersection(b.boundary)
    except Exception:
        return 0.0
    if intersection is None or getattr(intersection, 'is_empty', True):
        return 0.0
    length = getattr(intersection, 'length', 0.0)
    return float(length or 0.0)


def transfer_pass(geoms, ids):
    tree = STRtree(geoms)
    decisions = []
    parts_cache = [parts_by_area(g) for g in geoms]

    for owner_idx, parts in enumerate(parts_cache):
        if len(parts) <= 1:
            continue
        core = parts[0]
        for part in parts[1:]:
            # A component close enough to its own core is a coherent local
            # island/split and should not be reassigned simply because another
            # region is also nearby.
            if part.distance(core) <= SEAM_TOL_DEG:
                continue
            candidates = tree.query(part.buffer(SEAM_TOL_DEG))
            best = None
            for raw_idx in candidates:
                idx = int(raw_idx)
                if idx == owner_idx:
                    continue
                other = geoms[idx]
                distance = part.distance(other)
                if distance > SEAM_TOL_DEG:
                    continue
                shared = shared_boundary_length(part, other) if distance <= 1e-7 else 0.0
                # Prefer a real shared land border. Tiny source seams are a
                # fallback and use nearest distance.
                score = (1 if shared > 1e-8 else 0, shared, -distance, geod_area_km2(other))
                if best is None or score > best[0]:
                    best = (score, idx)
            if best is not None:
                decisions.append((owner_idx, best[1], part))

    if not decisions:
        return geoms, 0

    removals = {i: [] for i in range(len(geoms))}
    additions = {i: [] for i in range(len(geoms))}
    for source, target, part in decisions:
        removals[source].append(part)
        additions[target].append(part)

    new_geoms = []
    for idx, parts in enumerate(parts_cache):
        remove_wkb = {p.wkb for p in removals[idx]}
        kept = [p for p in parts if p.wkb not in remove_wkb]
        kept.extend(additions[idx])
        if not kept:
            raise RuntimeError(f'ownership repair would empty region {ids[idx]}')
        new_geoms.append(combine(kept))
    return new_geoms, len(decisions)


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
        query_geom = geom.buffer(ADJ_TOL_DEG)
        for raw_j in tree.query(query_geom):
            j = int(raw_j)
            if j <= i:
                continue
            other = geoms[j]
            ominx, ominy, omaxx, omaxy = other.bounds
            if omaxx < minx-ADJ_TOL_DEG or ominx > maxx+ADJ_TOL_DEG or omaxy < miny-ADJ_TOL_DEG or ominy > maxy+ADJ_TOL_DEG:
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
    geoms = [repair(shape(f['geometry'])) for f in features]
    before_area = total_area(geoms)
    before_parts = sum(len(parts_by_area(g)) for g in geoms)

    moved_total = 0
    for pass_no in range(1, MAX_PASSES + 1):
        geoms, moved = transfer_pass(geoms, ids)
        moved_total += moved
        print(f'OWNERSHIP_PASS={pass_no} MOVED_COMPONENTS={moved}')
        if moved == 0:
            break

    after_area = total_area(geoms)
    loss = abs(after_area - before_area) / max(1.0, before_area)
    if loss > 1e-10:
        raise RuntimeError(f'ownership repair changed total land area fraction={loss:.3e}')

    rebuild_meta(features, geoms, meta)
    after_parts = sum(len(parts_by_area(g)) for g in geoms)
    out_geo = Path(args.output_geo or args.geo)
    out_meta = Path(args.output_meta or args.meta)
    out_geo.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    out_meta.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    print(f'REGIONS={len(features)}')
    print(f'MOVED_COMPONENTS_TOTAL={moved_total}')
    print(f'POLYGON_PARTS_BEFORE={before_parts}')
    print(f'POLYGON_PARTS_AFTER={after_parts}')
    print(f'LAND_AREA_BEFORE_KM2={before_area:.3f}')
    print(f'LAND_AREA_AFTER_KM2={after_area:.3f}')
    print(f'AREA_CHANGE_FRACTION={loss:.3e}')


if __name__ == '__main__':
    main()
