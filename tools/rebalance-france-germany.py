#!/usr/bin/env python3
"""Rebalance France and Germany to a comparable enduring-region scale.

France starts from the existing department-derived regions and is merged to 38.
Germany starts from GeoBoundaries ADM2 geometry, clipped to the existing Germany
footprint, and is clustered to 24. The target is comparable scale, not identical
region area: future sparse or difficult terrain may deliberately use larger regions.
New resource endowments are overlap-weighted from the old regions so total deposits
are approximately conserved.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data/world/regions.geo.json'
META_PATH = ROOT / 'data/world/regions.meta.json'
RES_PATH = ROOT / 'data/world/resources.initial.json'
GEOB_API = 'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/'
USER_AGENT = 'Sim-World region rebalance/1.0'
GEOD = Geod(ellps='WGS84')
ADJ_TOL = 0.025
TARGETS = {'FRA': 38, 'DEU': 24}


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def repair(g):
    if g.is_empty:
        return g
    return g if g.is_valid else g.buffer(0)


def area_sqkm(g):
    area, _ = GEOD.geometry_area_perimeter(g)
    return abs(area) / 1_000_000.0


def stable_id(iso: str, source_names: list[str]):
    key = '|'.join(sorted(source_names, key=str.casefold))
    digest = hashlib.sha1(f'rebalance-v1|{iso}|{key}'.encode()).hexdigest()[:11]
    return f'rg_{digest}'


def feature_name(feature):
    p = feature.get('properties') or {}
    for key in ('shapeName', 'name', 'NAME_2', 'name_en', 'gn_name'):
        if p.get(key):
            return str(p[key])
    return 'Unnamed'


def cluster(pieces, target):
    clusters = [dict(p) for p in pieces]
    while len(clusters) > target:
        best = None
        for i, a in enumerate(clusters):
            for j in range(i + 1, len(clusters)):
                b = clusters[j]
                d = a['geometry'].distance(b['geometry'])
                score = (0 if d <= 0.04 else 1, d, a['geometry'].area + b['geometry'].area)
                if best is None or score < best[0]:
                    best = (score, i, j)
        if best is None:
            break
        _, i, j = best
        a, b = clusters[i], clusters[j]
        g = repair(unary_union([a['geometry'], b['geometry']]))
        merged = {
            'geometry': g,
            'sourceNames': sorted(set(a['sourceNames'] + b['sourceNames']), key=str.casefold),
            'anchor': a['anchor'] if a['anchorArea'] >= b['anchorArea'] else b['anchor'],
            'anchorArea': max(a['anchorArea'], b['anchorArea']),
            'parent': a.get('parent') if a.get('parent') == b.get('parent') else None,
        }
        clusters.pop(j)
        clusters.pop(i)
        clusters.append(merged)
    return clusters


def allocate_counts(parent_rows, source_by_parent, target):
    """Allocate an exact target across parent regions without exceeding source capacity."""
    areas = {name: area_sqkm(g) for name, g in parent_rows}
    capacities = {name: max(1, len(source_by_parent.get(name, []))) for name in areas}
    if target < len(areas):
        raise RuntimeError(f'Germany target {target} is below parent-region count {len(areas)}')
    if target > sum(capacities.values()):
        raise RuntimeError(f'Germany target {target} exceeds available subdivision capacity {sum(capacities.values())}')

    counts = {name: 1 for name in areas}
    while sum(counts.values()) < target:
        choices = [name for name in areas if counts[name] < capacities[name]]
        if not choices:
            raise RuntimeError('Germany subdivision allocation exhausted available source pieces')
        # Add detail where each existing region still has the most land per allocated child.
        name = max(choices, key=lambda n: areas[n] / counts[n])
        counts[name] += 1
    return counts


def direction_name(parent, centroid, parent_geom, siblings):
    if siblings == 1:
        return parent
    minx, miny, maxx, maxy = parent_geom.bounds
    nx = (centroid.x - minx) / max(1e-9, maxx - minx)
    ny = (centroid.y - miny) / max(1e-9, maxy - miny)
    if siblings == 2:
        if (maxx - minx) >= (maxy - miny):
            return f"{'Western' if nx < 0.5 else 'Eastern'} {parent}"
        return f"{'Southern' if ny < 0.5 else 'Northern'} {parent}"
    if siblings == 3:
        if (maxx - minx) >= (maxy - miny):
            word = 'Western' if nx < 0.34 else 'Central' if nx < 0.67 else 'Eastern'
        else:
            word = 'Southern' if ny < 0.34 else 'Central' if ny < 0.67 else 'Northern'
        return f'{word} {parent}'
    angle = math.atan2(ny - 0.5, nx - 0.5)
    labels = ['Eastern', 'Northeastern', 'Northern', 'Northwestern', 'Western', 'Southwestern', 'Southern', 'Southeastern']
    idx = int(round(((angle % (2 * math.pi)) / (2 * math.pi)) * 8)) % 8
    return f'{labels[idx]} {parent}'


def scale_and_merge_resources(new_geom, old_rows, resources):
    overlaps = []
    for old_id, old_geom in old_rows:
        inter = repair(new_geom.intersection(old_geom))
        if inter.is_empty:
            continue
        a = area_sqkm(inter)
        if a > 0.5:
            overlaps.append((old_id, old_geom, a))
    if not overlaps:
        raise RuntimeError('new region has no old-resource overlap')

    total_overlap = sum(a for _, _, a in overlaps)
    out = {'landQuality': 1.0, 'forestFraction': 0.3, 'forestStartCoverage': 0.5, 'deposits': {}}
    for scalar in ('landQuality', 'forestFraction', 'forestStartCoverage'):
        out[scalar] = sum(resources[oid].get(scalar, out[scalar]) * a for oid, _, a in overlaps) / total_overlap

    tier_acc = {}
    for old_id, old_geom, overlap_area in overlaps:
        frac = overlap_area / max(1e-9, area_sqkm(old_geom))
        for resource, dep in resources[old_id].get('deposits', {}).items():
            for tier in dep.get('tiers', []):
                key = (resource, tier.get('id'))
                acc = tier_acc.setdefault(key, {'template': copy.deepcopy(tier), 'stock': 0.0, 'workers': 0.0})
                acc['stock'] += float(tier.get('initialStock', 0)) * frac
                acc['workers'] += float(tier.get('maxWorkers', 0)) * frac
    for (resource, _tier_id), acc in tier_acc.items():
        tier = acc['template']
        tier['initialStock'] = round(acc['stock'], 3)
        tier['maxWorkers'] = max(1, round(acc['workers']))
        out['deposits'].setdefault(resource, {'tiers': []})['tiers'].append(tier)
    return out


def germany_source(old_features):
    old_rows = [(f['properties']['id'], repair(shape(f['geometry'])), f['properties']['name']) for f in old_features]
    mask = repair(unary_union([g for _, g, _ in old_rows]))
    meta = fetch_json(GEOB_API.format(iso='DEU', level='ADM2'))
    url = meta.get('simplifiedGeometryGeoJSON') or meta.get('gjDownloadURL')
    if not url:
        raise RuntimeError('GeoBoundaries returned no Germany ADM2 geometry URL')
    source = fetch_json(url)
    by_parent = {name: [] for _, _, name in old_rows}
    parent_geom = {name: g for _, g, name in old_rows}
    for f in source.get('features', []):
        g = repair(shape(f['geometry']).intersection(mask))
        if g.is_empty or area_sqkm(g) < 15:
            continue
        overlaps = [(area_sqkm(g.intersection(pg)), pname) for _, pg, pname in old_rows]
        overlap, parent = max(overlaps)
        if overlap < 1:
            continue
        g = repair(g.intersection(parent_geom[parent]))
        if g.is_empty or area_sqkm(g) < 10:
            continue
        name = feature_name(f)
        by_parent[parent].append({'geometry': g, 'sourceNames': [name], 'anchor': name, 'anchorArea': area_sqkm(g), 'parent': parent})
    return by_parent, parent_geom


def main():
    geo = json.loads(GEO_PATH.read_text())
    meta_doc = json.loads(META_PATH.read_text())
    resources = json.loads(RES_PATH.read_text())
    features = geo['features']

    old_by_iso = {iso: [f for f in features if f.get('properties', {}).get('sourceGroup') == iso] for iso in TARGETS}
    if len(old_by_iso['FRA']) < TARGETS['FRA']:
        raise RuntimeError('France already has fewer than target regions')
    if not old_by_iso['DEU']:
        raise RuntimeError('Germany is missing from the working map')

    old_ids = {f['properties']['id'] for rows in old_by_iso.values() for f in rows}
    old_resource_rows = {
        iso: [(f['properties']['id'], repair(shape(f['geometry']))) for f in rows]
        for iso, rows in old_by_iso.items()
    }

    fra_pieces = []
    for f in old_by_iso['FRA']:
        g = repair(shape(f['geometry']))
        fra_pieces.append({'geometry': g, 'sourceNames': [f['properties']['name']], 'anchor': f['properties']['name'], 'anchorArea': area_sqkm(g)})
    fra_clusters = cluster(fra_pieces, TARGETS['FRA'])

    deu_by_parent, deu_parent_geom = germany_source(old_by_iso['DEU'])
    allocations = allocate_counts(list(deu_parent_geom.items()), deu_by_parent, TARGETS['DEU'])
    deu_clusters = []
    for parent, pg in deu_parent_geom.items():
        pieces = deu_by_parent.get(parent, [])
        wanted = allocations[parent]
        if not pieces:
            pieces = [{'geometry': pg, 'sourceNames': [parent], 'anchor': parent, 'anchorArea': area_sqkm(pg), 'parent': parent}]
        deu_clusters.extend(cluster(pieces, wanted))
    if len(deu_clusters) != TARGETS['DEU']:
        raise RuntimeError(f'Germany produced {len(deu_clusters)} regions, expected {TARGETS["DEU"]}')

    new_regions = []
    used_names = set()
    for iso, clusters in (('FRA', fra_clusters), ('DEU', deu_clusters)):
        sibling_counts = {}
        if iso == 'DEU':
            for c in clusters:
                sibling_counts[c['parent']] = sibling_counts.get(c['parent'], 0) + 1
        for c in clusters:
            if iso == 'FRA':
                name = c['anchor']
            else:
                parent = c['parent']
                name = direction_name(parent, c['geometry'].centroid, deu_parent_geom[parent], sibling_counts[parent])
            base = name
            n = 2
            while name in used_names:
                name = f'{base} {n}'
                n += 1
            used_names.add(name)
            rid = stable_id(iso, c['sourceNames'])
            cen = c['geometry'].centroid
            new_regions.append({
                'id': rid,
                'name': name,
                'sourceGroup': iso,
                'geometry': c['geometry'],
                'centroid': [cen.x, cen.y],
                'areaSqKm': area_sqkm(c['geometry']),
                'resources': scale_and_merge_resources(c['geometry'], old_resource_rows[iso], resources),
            })

    features[:] = [f for f in features if f['properties']['id'] not in old_ids]
    meta_doc['regions'][:] = [m for m in meta_doc['regions'] if m['id'] not in old_ids]
    for m in meta_doc['regions']:
        m['neighbors'] = [n for n in m.get('neighbors', []) if n not in old_ids]
    for oid in old_ids:
        resources.pop(oid, None)

    for r in new_regions:
        features.append({'type': 'Feature', 'properties': {'id': r['id'], 'name': r['name'], 'sourceGroup': r['sourceGroup']}, 'geometry': mapping(r['geometry'])})
        meta_doc['regions'].append({'id': r['id'], 'name': r['name'], 'centroid': r['centroid'], 'areaSqKm': r['areaSqKm'], 'neighbors': []})
        resources[r['id']] = r['resources']

    geom_by_id = {f['properties']['id']: repair(shape(f['geometry'])) for f in features}
    meta_by_id = {m['id']: m for m in meta_doc['regions']}
    new_ids = {r['id'] for r in new_regions}
    for rid in new_ids:
        rg = geom_by_id[rid]
        minx, miny, maxx, maxy = rg.bounds
        for oid, og in geom_by_id.items():
            if oid == rid:
                continue
            ominx, ominy, omaxx, omaxy = og.bounds
            if omaxx < minx - ADJ_TOL or ominx > maxx + ADJ_TOL or omaxy < miny - ADJ_TOL or ominy > maxy + ADJ_TOL:
                continue
            if rg.distance(og) <= ADJ_TOL:
                meta_by_id[rid]['neighbors'].append(oid)
                meta_by_id[oid].setdefault('neighbors', []).append(rid)
    for m in meta_doc['regions']:
        m['neighbors'] = sorted(set(m.get('neighbors', [])))

    GEO_PATH.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    META_PATH.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    RES_PATH.write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))

    for iso in TARGETS:
        rows = [r for r in new_regions if r['sourceGroup'] == iso]
        total = sum(r['areaSqKm'] for r in rows)
        print(f'{iso}_REBALANCED regions={len(rows)} area={total:.1f} avg={total/len(rows):.1f}')
        print(f'{iso}_NAMES=' + json.dumps([r['name'] for r in rows], ensure_ascii=False))


if __name__ == '__main__':
    main()
