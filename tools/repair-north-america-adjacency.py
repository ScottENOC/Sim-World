#!/usr/bin/env python3
"""Repair North America land-neighbour seams after water regions are known.

Natural Earth admin-1 simplification can leave tiny gaps between pieces derived
from neighbouring source polygons. A North American gameplay region with no land
neighbour is legitimate if it is connected to a modelled water region. Otherwise
it must either be repaired across a very small source seam or rejected.
"""
import json
from pathlib import Path

from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data' / 'world' / 'regions.geo.json'
META_PATH = ROOT / 'data' / 'world' / 'regions.meta.json'
SEA_META_PATH = ROOT / 'data' / 'world' / 'seaRegions.meta.json'
REVIEW_PATH = ROOT / 'data' / 'world' / 'north-america-v1-review.json'
MAX_SEAM_DEGREES = 0.08


def main():
    geo = json.loads(GEO_PATH.read_text())
    meta_doc = json.loads(META_PATH.read_text())
    seas = json.loads(SEA_META_PATH.read_text()).get('seaRegions', [])
    review = json.loads(REVIEW_PATH.read_text()) if REVIEW_PATH.exists() else []
    review_by_id = {r['id']: r for r in review}
    features = geo.get('features', [])
    meta_by_id = {m['id']: m for m in meta_doc.get('regions', [])}
    feature_by_id = {f['properties']['id']: f for f in features}
    new_ids = {
        f['properties']['id'] for f in features
        if f.get('properties', {}).get('sourceGroup') == 'na_north_america_v1'
    }
    coastal = set()
    for sea in seas:
        coastal.update(sea.get('adjacentLand', []))

    ids = list(feature_by_id)
    geoms = [shape(feature_by_id[rid]['geometry']) for rid in ids]
    tree = STRtree(geoms)
    index_by_id = {rid: i for i, rid in enumerate(ids)}
    repaired = []

    for rid in sorted(new_ids):
        meta = meta_by_id[rid]
        if meta.get('neighbors') or rid in coastal:
            continue
        i = index_by_id[rid]
        geom = geoms[i]
        # Search only a small halo. Anything further apart is not a source seam
        # and must not be converted into a fictitious land crossing.
        candidates = tree.query(geom.buffer(MAX_SEAM_DEGREES))
        best = None
        for raw_j in candidates:
            j = int(raw_j)
            oid = ids[j]
            if oid == rid:
                continue
            distance = geom.distance(geoms[j])
            if distance <= 1e-9 or distance > MAX_SEAM_DEGREES:
                continue
            score = (distance, 0 if oid in new_ids else 1, oid)
            if best is None or score < best[0]:
                best = (score, oid, distance)
        if best is None:
            continue
        _, oid, distance = best
        meta.setdefault('neighbors', []).append(oid)
        meta_by_id[oid].setdefault('neighbors', []).append(rid)
        meta['neighbors'] = sorted(set(meta['neighbors']))
        meta_by_id[oid]['neighbors'] = sorted(set(meta_by_id[oid]['neighbors']))
        repaired.append((rid, oid, distance))

    still = []
    for rid in new_ids:
        meta = meta_by_id[rid]
        if not meta.get('neighbors') and rid not in coastal:
            still.append((rid, meta.get('name', rid)))

    if still:
        for rid, name in still:
            geom = geoms[index_by_id[rid]]
            nearest = []
            for oid, other in zip(ids, geoms):
                if oid == rid:
                    continue
                nearest.append((geom.distance(other), oid, meta_by_id.get(oid, {}).get('name', oid), oid in new_ids))
            nearest.sort(key=lambda item: (item[0], item[1]))
            source_units = review_by_id.get(rid, {}).get('sourceUnits', [])
            print(f'UNRESOLVED_INLAND_ORPHAN {rid} {name}')
            print('ORPHAN_SOURCE_UNITS=' + json.dumps(source_units, ensure_ascii=False))
            print('ORPHAN_BOUNDS=' + json.dumps([round(v, 6) for v in geom.bounds]))
            for distance, oid, other_name, is_new in nearest[:8]:
                print(f'ORPHAN_NEAREST distanceDegrees={distance:.6f} new={int(is_new)} id={oid} name={other_name}')
        raise RuntimeError(f'{len(still)} inland North America regions remain disconnected')

    META_PATH.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    print(f'REPAIRED_SOURCE_SEAMS={len(repaired)}')
    for rid, oid, distance in repaired:
        print(f'SEAM_REPAIR {meta_by_id[rid]["name"]} -> {meta_by_id[oid]["name"]} distanceDegrees={distance:.5f}')
    print(f'WATER_ONLY_REGIONS={sum(1 for rid in new_ids if not meta_by_id[rid].get("neighbors") and rid in coastal)}')


if __name__ == '__main__':
    main()
