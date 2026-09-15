#!/usr/bin/env python3
"""Build the first Sim-World North America tranche.

Natural Earth 2026-era administrative geometry is used only as source material.
Large ADM1 units are split, all resulting pieces from Canada/USA/Mexico are pooled,
and clustering is allowed across modern national borders. The resulting simulation
regions are therefore geography-first rather than future-state/province replicas.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'north-america-region-plan-v1.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
ADMIN1_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
USER_AGENT = 'Sim-World North America expansion/1.0'
TARGET_REGION_COUNT = 160
TARGET_PIECE_AREA_SQKM = 105_000
MIN_COMPONENT_AREA_SQKM = 120
MAX_CLUSTER_GAP_DEGREES = 0.30
ADJ_TOL = 0.025

spec = importlib.util.spec_from_file_location('map_v2', ROOT / 'tools' / 'build-map-expansion-v2.py')
map_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(map_v2)


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def feature_codes(feature):
    p = feature.get('properties') or {}
    return {str(p.get(k) or '').upper() for k in ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3','iso_a3','ISO_A3') if p.get(k)}


def feature_name(feature):
    p = feature.get('properties') or {}
    return str(p.get('name') or p.get('name_en') or p.get('gn_name') or p.get('shapeName') or 'Unnamed')


def polygons(geom):
    if geom.is_empty:
        return
    if geom.geom_type == 'Polygon':
        yield geom
    elif hasattr(geom, 'geoms'):
        for child in geom.geoms:
            yield from polygons(child)


def split_component_grid(geom, target_area=TARGET_PIECE_AREA_SQKM):
    """Split oversized modern administrative units into compact rectangular slices.

    This deliberately destroys the assumption that a future state/province must be
    one simulation region. The later clustering pass can then recombine slices with
    neighbouring source units, including across modern international borders.
    """
    area = map_v2.area_sqkm(geom)
    pieces_needed = max(1, int(math.ceil(area / target_area)))
    if pieces_needed <= 1:
        return [geom]
    minx, miny, maxx, maxy = geom.bounds
    width = maxx - minx
    height = maxy - miny
    cols = max(1, int(round(math.sqrt(pieces_needed * max(width, 0.1) / max(height, 0.1)))))
    rows = max(1, int(math.ceil(pieces_needed / cols)))
    dx = width / cols
    dy = height / rows
    out = []
    for row in range(rows):
        for col in range(cols):
            cell = box(minx + col * dx, miny + row * dy,
                       maxx if col == cols - 1 else minx + (col + 1) * dx,
                       maxy if row == rows - 1 else miny + (row + 1) * dy)
            part = map_v2.repair(geom.intersection(cell))
            if part.is_empty:
                continue
            for poly in polygons(part):
                if map_v2.area_sqkm(poly) >= MIN_COMPONENT_AREA_SQKM:
                    out.append(map_v2.repair(poly))
    return out or [geom]


def country_masks(admin0, wanted):
    parts = {iso: [] for iso in wanted}
    for feature in admin0.get('features', []):
        codes = feature_codes(feature)
        geom = map_v2.repair(shape(feature['geometry']))
        for iso in wanted:
            if iso in codes:
                parts[iso].append(geom)
    return {iso: map_v2.repair(unary_union(gs)) for iso, gs in parts.items() if gs}


def build_source_pieces(admin1, masks, existing):
    wanted = set(masks)
    raw = []
    for feature in admin1.get('features', []):
        codes = feature_codes(feature) & wanted
        if not codes:
            continue
        iso = sorted(codes)[0]
        geom = map_v2.clean(shape(feature['geometry']))
        geom = map_v2.repair(geom.intersection(masks[iso]))
        geom = map_v2.repair(geom.difference(existing))
        if geom.is_empty:
            continue
        name = feature_name(feature)
        for component in polygons(geom):
            if map_v2.area_sqkm(component) < MIN_COMPONENT_AREA_SQKM:
                continue
            for piece in split_component_grid(component):
                raw.append({
                    'geometry': piece,
                    'sourceUnits': [f'{iso}:{name}'],
                    'anchor': name,
                    'anchorISO': iso,
                    'area': map_v2.area_sqkm(piece),
                })
    return raw


def merge_cluster(a, b):
    geom = map_v2.repair(unary_union([a['geometry'], b['geometry']]))
    anchor = a if a['area'] >= b['area'] else b
    return {
        'geometry': geom,
        'sourceUnits': sorted(set(a['sourceUnits'] + b['sourceUnits']), key=str.casefold),
        'anchor': anchor['anchor'],
        'anchorISO': anchor['anchorISO'],
        'area': a['area'] + b['area'],
    }


def cluster_pieces(pieces, target=TARGET_REGION_COUNT):
    clusters = list(pieces)
    while len(clusters) > target:
        geoms = [c['geometry'] for c in clusters]
        tree = STRtree(geoms)
        order = sorted(range(len(clusters)), key=lambda i: clusters[i]['area'])
        chosen = None
        for i in order:
            a = clusters[i]
            candidates = tree.query(a['geometry'].buffer(0.12))
            best = None
            for raw_j in candidates:
                j = int(raw_j)
                if i == j:
                    continue
                b = clusters[j]
                distance = a['geometry'].distance(b['geometry'])
                if distance > MAX_CLUSTER_GAP_DEGREES:
                    continue
                shared = a['geometry'].boundary.intersection(b['geometry'].boundary).length if distance <= 0.03 else 0
                # Strongly prefer touching pieces and similar-sized mergers. No
                # country-code term appears here: modern borders are intentionally inert.
                score = (0 if shared > 0 else 1, distance, abs(a['area'] - b['area']), a['area'] + b['area'])
                if best is None or score < best[0]:
                    best = (score, j)
            if best is not None:
                chosen = (i, best[1])
                break
        if chosen is None:
            print(f'CLUSTER_STOP disconnected={len(clusters)} target={target}')
            break
        i, j = chosen
        if j < i:
            i, j = j, i
        merged = merge_cluster(clusters[i], clusters[j])
        clusters.pop(j)
        clusters.pop(i)
        clusters.append(merged)
    return clusters


def physiographic_zone(lon, lat):
    # Coarse labels are deliberately geographic rather than political. They are
    # only display anchors; the simulation itself derives economy/politics later.
    if lat > 66:
        return 'Arctic North America'
    if lon < -140:
        return 'Alaska and Beringia'
    if lat > 58 and lon < -115:
        return 'Northwestern Boreal Interior'
    if lat > 58:
        return 'Canadian Shield North'
    if lon < -126 and lat > 47:
        return 'Pacific Northwest Coast'
    if lon < -123 and lat <= 47:
        return 'Pacific Coast'
    if lon < -116 and lat > 49:
        return 'Interior Cordillera'
    if lon < -114 and lat > 32:
        return 'Great Basin and Plateau'
    if lon < -106 and lat > 48:
        return 'Northern Rockies'
    if lon < -104 and lat > 34:
        return 'Rocky Mountain Interior'
    if lon < -112 and lat <= 34:
        return 'Sonoran and Baja Lands'
    if lat > 53 and lon < -95:
        return 'Northern Prairies'
    if lat > 50 and lon >= -95:
        return 'Canadian Shield'
    if -104 <= lon < -96 and lat > 36:
        return 'Great Plains'
    if -104 <= lon < -94 and lat <= 36:
        return 'Southern Plains'
    if lat > 41 and -96 <= lon < -82:
        return 'Great Lakes and Upper Mississippi'
    if lat > 45 and lon >= -82:
        return 'St Lawrence and Laurentian Lands'
    if lat > 44 and lon >= -70:
        return 'Atlantic Canada'
    if -94 <= lon < -84 and lat <= 41:
        return 'Mississippi Basin'
    if lon >= -84 and lat > 35 and lat <= 44:
        return 'Appalachian Highlands'
    if lon >= -78 and lat > 39:
        return 'Northeastern Seaboard'
    if lon >= -84 and lat <= 35:
        return 'Southeastern Lowlands'
    if -97 <= lon < -84 and lat <= 31:
        return 'Gulf Coast'
    if lat < 32 and lon < -106:
        return 'Northwestern Mexico'
    if lat < 30 and lon < -97:
        return 'Northern Mexican Plateau'
    if lat < 24 and lon > -91:
        return 'Yucatan and Maya Lowlands'
    if lat < 25 and lon >= -101:
        return 'Gulf Mexican Lowlands'
    if lat < 24 and lon < -101:
        return 'Pacific Mexican Highlands'
    if lat < 20:
        return 'Southern Mexican Highlands'
    return 'Central North American Interior'


def directional_qualifier(lon, lat, zone_members):
    if len(zone_members) == 1:
        return ''
    xs = [c['centroid'][0] for c in zone_members]
    ys = [c['centroid'][1] for c in zone_members]
    xmid = (min(xs) + max(xs)) / 2
    ymid = (min(ys) + max(ys)) / 2
    dx = lon - xmid
    dy = lat - ymid
    xr = max(0.1, max(xs) - min(xs))
    yr = max(0.1, max(ys) - min(ys))
    horizontal = abs(dx) / xr
    vertical = abs(dy) / yr
    if horizontal > vertical * 1.35:
        return 'Western' if dx < 0 else 'Eastern'
    if vertical > horizontal * 1.35:
        return 'Southern' if dy < 0 else 'Northern'
    return ('Southwestern' if dx < 0 and dy < 0 else
            'Northwestern' if dx < 0 else
            'Southeastern' if dy < 0 else 'Northeastern')


def stable_id(source_units, lon, lat):
    token = '|'.join(sorted(source_units)) + f'|{lon:.3f}|{lat:.3f}'
    return 'na_' + hashlib.sha1(token.encode('utf-8')).hexdigest()[:12]


def make_regions(clusters):
    provisional = []
    for cluster in clusters:
        geom = map_v2.repair(cluster['geometry'])
        c = geom.centroid
        provisional.append({**cluster, 'centroid':[c.x, c.y], 'zone':physiographic_zone(c.x, c.y)})
    by_zone = defaultdict(list)
    for item in provisional:
        by_zone[item['zone']].append(item)
    used = set()
    out = []
    for item in sorted(provisional, key=lambda x: (-x['centroid'][1], x['centroid'][0])):
        lon, lat = item['centroid']
        qualifier = directional_qualifier(lon, lat, by_zone[item['zone']])
        name = f'{qualifier} {item["zone"]}'.strip()
        if name in used:
            # Keep a recognisable source anchor only as a disambiguator; it does
            # not define the region border and may be a future state/province name.
            name = f'{name} — {item["anchor"]}'
        suffix = 2
        base = name
        while name in used:
            name = f'{base} {suffix}'
            suffix += 1
        used.add(name)
        out.append({
            'id': stable_id(item['sourceUnits'], lon, lat),
            'name': name,
            'sourceGroup': 'na_north_america_v1',
            'sourceUnits': item['sourceUnits'],
            'geometry': item['geometry'],
            'centroid': item['centroid'],
            'areaSqKm': map_v2.area_sqkm(item['geometry']),
            'neighbors': [],
            'zone': item['zone'],
        })
    return out


def magnitude_for(seed, resource, chances):
    digest = hashlib.sha1(f'{seed}|{resource}'.encode('utf-8')).digest()
    roll = int.from_bytes(digest[:4], 'big') / 2**32
    cumulative = 0
    for magnitude, probability in chances:
        cumulative += probability
        if roll < cumulative:
            return magnitude
    return None


def resource_endowment(region):
    lon, lat = region['centroid']
    zone = region['zone']
    # Broad environmental defaults, not claims about a historical polity.
    forest = 0.48
    quality = 0.90
    if 'Arctic' in zone: forest, quality = 0.06, 0.18
    elif 'Boreal' in zone or 'Shield' in zone: forest, quality = 0.68, 0.46
    elif 'Prairies' in zone or 'Great Plains' in zone: forest, quality = 0.22, 1.22
    elif 'Mississippi' in zone or 'Great Lakes' in zone or 'St Lawrence' in zone: forest, quality = 0.55, 1.18
    elif 'Southeastern' in zone or 'Gulf Coast' in zone: forest, quality = 0.63, 1.12
    elif 'Appalachian' in zone or 'Northeastern' in zone or 'Atlantic Canada' in zone: forest, quality = 0.72, 0.92
    elif 'Pacific Coast' in zone or 'Pacific Northwest' in zone: forest, quality = 0.72, 0.88
    elif 'Rock' in zone or 'Cordillera' in zone or 'Plateau' in zone or 'Great Basin' in zone: forest, quality = 0.34, 0.55
    elif 'Sonoran' in zone or 'Baja' in zone: forest, quality = 0.08, 0.30
    elif 'Mexico' in zone or 'Mexican' in zone or 'Yucatan' in zone: forest, quality = 0.42, 0.82
    seed = region['id']
    deposits = {'stone': map_v2.make_deposit('stone', 'major')}
    # Iron is broad; copper/gold favour western cordillera and Canadian Shield.
    iron_mag = magnitude_for(seed, 'ironOre', [('major',0.18),('moderate',0.48),('minor',0.30)]) or 'minor'
    deposits['ironOre'] = map_v2.make_deposit('ironOre', iron_mag)
    west_or_shield = lon < -103 or 'Shield' in zone or 'Cordillera' in zone
    if magnitude := magnitude_for(seed, 'copper', [('major',0.10 if west_or_shield else 0.02),('moderate',0.22 if west_or_shield else 0.08),('minor',0.24)]):
        deposits['copper'] = map_v2.make_deposit('copper', magnitude)
    if magnitude := magnitude_for(seed, 'gold', [('moderate',0.08 if west_or_shield else 0.02),('minor',0.20 if west_or_shield else 0.06)]):
        deposits['gold'] = map_v2.make_deposit('gold', magnitude)
    # Tin deliberately remains sparse so Bronze Age interdependence survives.
    if magnitude := magnitude_for(seed, 'tin', [('moderate',0.012),('minor',0.045)]):
        deposits['tin'] = map_v2.make_deposit('tin', magnitude)
    if ('Plains' in zone or 'Gulf' in zone or 'Basin' in zone) and (magnitude := magnitude_for(seed, 'salt', [('major',0.14),('moderate',0.24),('minor',0.18)])):
        deposits['salt'] = map_v2.make_deposit('salt', magnitude)
    return {
        'landQuality': quality,
        'forestFraction': forest,
        'forestStartCoverage': 0.82 if forest > 0.3 else 0.70,
        'deposits': deposits,
    }


def add_adjacency(base_features, base_meta, regions):
    base_geoms = [(f['properties']['id'], map_v2.repair(shape(f['geometry']))) for f in base_features]
    meta_by_id = {m['id']: m for m in base_meta}
    new_geoms = [r['geometry'] for r in regions]
    tree = STRtree(new_geoms)
    for i, region in enumerate(regions):
        g = region['geometry']
        for raw_j in tree.query(g.buffer(ADJ_TOL)):
            j = int(raw_j)
            if j == i:
                continue
            if g.distance(new_geoms[j]) <= ADJ_TOL:
                region['neighbors'].append(regions[j]['id'])
        minx, miny, maxx, maxy = g.bounds
        for oid, og in base_geoms:
            ominx, ominy, omaxx, omaxy = og.bounds
            if omaxx < minx-ADJ_TOL or ominx > maxx+ADJ_TOL or omaxy < miny-ADJ_TOL or ominy > maxy+ADJ_TOL:
                continue
            if g.distance(og) <= ADJ_TOL:
                region['neighbors'].append(oid)
                if oid in meta_by_id:
                    meta_by_id[oid].setdefault('neighbors', []).append(region['id'])
        region['neighbors'] = sorted(set(region['neighbors']))
    for meta in base_meta:
        meta['neighbors'] = sorted(set(meta.get('neighbors', [])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-north-america-v1')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    geo = json.loads(BASE_GEO.read_text())
    meta_doc = json.loads(BASE_META.read_text())
    resources = json.loads(BASE_RESOURCES.read_text())
    admin0 = fetch_json(ADMIN0_URL)
    admin1 = fetch_json(ADMIN1_URL)
    wanted = {c['iso'] for c in plan['countries']}
    masks = country_masks(admin0, wanted)
    missing = wanted - set(masks)
    if missing:
        raise RuntimeError(f'Missing Natural Earth country geometry: {sorted(missing)}')
    existing = map_v2.repair(unary_union([map_v2.repair(shape(f['geometry'])) for f in geo.get('features', [])]))
    pieces = build_source_pieces(admin1, masks, existing)
    if len(pieces) < TARGET_REGION_COUNT:
        raise RuntimeError(f'Only {len(pieces)} source pieces for {TARGET_REGION_COUNT} target regions')
    clusters = cluster_pieces(pieces, TARGET_REGION_COUNT)
    regions = make_regions(clusters)
    add_adjacency(geo['features'], meta_doc['regions'], regions)
    existing_ids = {f['properties']['id'] for f in geo['features']}
    for region in regions:
        if region['id'] in existing_ids:
            raise RuntimeError(f'Duplicate region id {region["id"]}')
        existing_ids.add(region['id'])
        geo['features'].append({
            'type':'Feature',
            'properties':{
                'id':region['id'], 'name':region['name'], 'sourceGroup':region['sourceGroup'],
                'navigationContinent':'North America', 'sourceUnits':region['sourceUnits'],
            },
            'geometry':mapping(region['geometry']),
        })
        meta_doc['regions'].append({
            'id':region['id'], 'name':region['name'], 'centroid':region['centroid'],
            'areaSqKm':region['areaSqKm'], 'neighbors':region['neighbors'],
        })
        resources[region['id']] = resource_endowment(region)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out/'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',',':')))
    (out/'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',',':')))
    (out/'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',',':')))
    review = [{
        'id':r['id'], 'name':r['name'], 'zone':r['zone'], 'areaSqKm':round(r['areaSqKm'],1),
        'sourceUnits':r['sourceUnits'], 'neighborCount':len(r['neighbors'])
    } for r in regions]
    (out/'north-america-v1-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    cross_border = sum(1 for r in regions if len({u.split(':',1)[0] for u in r['sourceUnits']}) > 1)
    isolated = [r['name'] for r in regions if not r['neighbors']]
    areas = sorted(r['areaSqKm'] for r in regions)
    print(f'SOURCE_PIECES={len(pieces)}')
    print(f'NEW_NORTH_AMERICA_REGIONS={len(regions)}')
    print(f'CROSS_MODERN_BORDER_REGIONS={cross_border}')
    print(f'TOTAL_LAND_REGIONS={len(geo["features"])}')
    print(f'MEDIAN_NEW_REGION_AREA_SQKM={areas[len(areas)//2]:.0f}')
    print(f'MIN_NEW_REGION_AREA_SQKM={areas[0]:.0f}')
    print(f'MAX_NEW_REGION_AREA_SQKM={areas[-1]:.0f}')
    print(f'ISOLATED_NEW_REGIONS={len(isolated)}')
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))
    if cross_border < 3:
        raise RuntimeError(f'Expected modern borders to be dissolved in several places; only {cross_border} cross-border regions formed')
    if len(regions) < 145:
        raise RuntimeError(f'North America expansion unexpectedly coarse: {len(regions)} regions')


if __name__ == '__main__':
    main()
