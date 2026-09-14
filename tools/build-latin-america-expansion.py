#!/usr/bin/env python3
"""Build geography-first Central America, Caribbean and South America regions.

This reuses the proven North America clustering machinery but changes the source
plan, physical naming, resource defaults and small-island fallback behaviour.
Modern borders remain navigation metadata rather than simulation boundaries.
"""
from __future__ import annotations

import importlib.util
import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'latin-america-region-plan-v1.json'
NA_MODULE = ROOT / 'tools' / 'build-north-america-expansion.py'

spec = importlib.util.spec_from_file_location('na_builder', NA_MODULE)
na = importlib.util.module_from_spec(spec)
spec.loader.exec_module(na)

na.PLAN = PLAN
na.TARGET_REGION_COUNT = 150
na.TARGET_PIECE_AREA_SQKM = 90_000
na.MIN_COMPONENT_AREA_SQKM = 18
na.MAX_CLUSTER_GAP_DEGREES = 0.28
na.USER_AGENT = 'Sim-World Latin America expansion/1.0'

SOURCE_GROUP = 'latin_america_caribbean_v1'
ID_PREFIX = 'la_'


def stable_id(source_units, lon, lat):
    import hashlib
    token = '|'.join(sorted(source_units)) + f'|{lon:.3f}|{lat:.3f}'
    return ID_PREFIX + hashlib.sha1(token.encode('utf-8')).hexdigest()[:12]


def physiographic_zone(lon, lat):
    if lat > 15 and lon < -86:
        return 'Maya and Central American Highlands'
    if lat > 8 and lon < -77:
        return 'Central American Isthmus'
    if lat > 18 and lon < -73:
        return 'Greater Antilles'
    if lat > 18:
        return 'Northern Caribbean Islands'
    if lat > 10 and lon > -69:
        return 'Lesser Antilles'
    if lat > 7 and lon < -69:
        return 'Southern Caribbean Coast'
    if lat > 1 and lon < -75:
        return 'Northern Andes'
    if lat > -5 and lon < -65:
        return 'Upper Amazon and Andean Foothills'
    if lat > -5 and lon >= -65:
        return 'Guiana Shield and Equatorial Amazon'
    if lon < -76 and lat > -18:
        return 'Central Andes'
    if lon < -70 and lat <= -18:
        return 'Southern Andes'
    if lat > -18 and lon < -62:
        return 'Amazon Basin'
    if lat > -18 and lon < -48:
        return 'Brazilian Interior'
    if lat > -18:
        return 'Atlantic Brazil'
    if lat > -30 and lon < -63:
        return 'Gran Chaco and Interior Lowlands'
    if lat > -30 and lon < -50:
        return 'Brazilian Highlands'
    if lat > -38 and lon < -57:
        return 'Pampas and Rio de la Plata'
    if lat > -38:
        return 'Southern Brazilian and Uruguayan Highlands'
    if lon < -70:
        return 'Patagonian Andes'
    if lat > -50:
        return 'Patagonian Steppe'
    return 'Tierra del Fuego and Southern Patagonia'


def build_source_pieces(admin1, masks, existing):
    wanted = set(masks)
    plan = json.loads(PLAN.read_text())
    names = {item['iso']: item['name'] for item in plan['countries']}
    raw = []
    covered = defaultdict(list)

    for feature in admin1.get('features', []):
        codes = na.feature_codes(feature) & wanted
        if not codes:
            continue
        iso = sorted(codes)[0]
        geom = na.map_v2.clean(shape(feature['geometry']))
        geom = na.map_v2.repair(geom.intersection(masks[iso]))
        geom = na.map_v2.repair(geom.difference(existing))
        if geom.is_empty:
            continue
        covered[iso].append(geom)
        source_name = na.feature_name(feature)
        for component in na.polygons(geom):
            if na.map_v2.area_sqkm(component) < na.MIN_COMPONENT_AREA_SQKM:
                continue
            for piece in na.split_component_grid(component):
                raw.append({
                    'geometry': piece,
                    'sourceUnits': [f'{iso}:{source_name}'],
                    'anchor': source_name,
                    'anchorISO': iso,
                    'area': na.map_v2.area_sqkm(piece),
                })

    # Small Caribbean states can lack useful ADM1 coverage. Preserve their real
    # island geometry by falling back to the remaining ADM0 mask rather than
    # silently dropping them from the simulation.
    for iso, mask in masks.items():
        remaining = na.map_v2.repair(mask.difference(existing))
        if covered.get(iso):
            remaining = na.map_v2.repair(remaining.difference(unary_union(covered[iso])))
        if remaining.is_empty:
            continue
        for component in na.polygons(remaining):
            if na.map_v2.area_sqkm(component) < na.MIN_COMPONENT_AREA_SQKM:
                continue
            for piece in na.split_component_grid(component):
                raw.append({
                    'geometry': piece,
                    'sourceUnits': [f'{iso}:{names.get(iso, iso)}'],
                    'anchor': names.get(iso, iso),
                    'anchorISO': iso,
                    'area': na.map_v2.area_sqkm(piece),
                })
    return raw


def make_regions(clusters):
    provisional = []
    for cluster in clusters:
        geom = na.map_v2.repair(cluster['geometry'])
        c = geom.centroid
        provisional.append({**cluster, 'centroid':[c.x, c.y], 'zone':physiographic_zone(c.x, c.y)})
    by_zone = defaultdict(list)
    for item in provisional:
        by_zone[item['zone']].append(item)
    used = set()
    out = []
    for item in sorted(provisional, key=lambda x: (-x['centroid'][1], x['centroid'][0])):
        lon, lat = item['centroid']
        qualifier = na.directional_qualifier(lon, lat, by_zone[item['zone']])
        name = f'{qualifier} {item["zone"]}'.strip()
        if name in used:
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
            'sourceGroup': SOURCE_GROUP,
            'sourceUnits': item['sourceUnits'],
            'geometry': item['geometry'],
            'centroid': item['centroid'],
            'areaSqKm': na.map_v2.area_sqkm(item['geometry']),
            'neighbors': [],
            'zone': item['zone'],
        })
    return out


def resource_endowment(region):
    lon, lat = region['centroid']
    zone = region['zone']
    forest, quality = 0.58, 0.90
    if 'Amazon' in zone: forest, quality = 0.86, 0.58
    elif 'Guiana' in zone: forest, quality = 0.82, 0.54
    elif 'Andes' in zone or 'Highlands' in zone: forest, quality = 0.30, 0.65
    elif 'Caribbean' in zone or 'Antilles' in zone: forest, quality = 0.62, 0.94
    elif 'Pampas' in zone: forest, quality = 0.18, 1.30
    elif 'Chaco' in zone: forest, quality = 0.42, 0.82
    elif 'Brazilian Highlands' in zone or 'Atlantic Brazil' in zone: forest, quality = 0.58, 1.03
    elif 'Patagon' in zone or 'Tierra' in zone: forest, quality = 0.16, 0.38

    seed = region['id']
    deposits = {'stone': na.map_v2.make_deposit('stone', 'major')}
    deposits['ironOre'] = na.map_v2.make_deposit('ironOre', na.magnitude_for(seed, 'ironOre', [('major',0.22),('moderate',0.50),('minor',0.26)]) or 'minor')
    andean = 'Andes' in zone or lon < -69
    brazilian = 'Brazil' in zone or 'Guiana' in zone
    if mag := na.magnitude_for(seed, 'copper', [('major',0.22 if andean else 0.04),('moderate',0.30 if andean else 0.12),('minor',0.22)]):
        deposits['copper'] = na.map_v2.make_deposit('copper', mag)
    if mag := na.magnitude_for(seed, 'gold', [('major',0.08 if andean or brazilian else 0.02),('moderate',0.18),('minor',0.24)]):
        deposits['gold'] = na.map_v2.make_deposit('gold', mag)
    if mag := na.magnitude_for(seed, 'tin', [('major',0.08 if andean else 0.005),('moderate',0.12 if andean else 0.02),('minor',0.10)]):
        deposits['tin'] = na.map_v2.make_deposit('tin', mag)
    if ('Chaco' in zone or 'Pampas' in zone or 'Brazilian Interior' in zone) and (mag := na.magnitude_for(seed, 'salt', [('major',0.12),('moderate',0.24),('minor',0.20)])):
        deposits['salt'] = na.map_v2.make_deposit('salt', mag)
    return {
        'landQuality': quality,
        'forestFraction': forest,
        'forestStartCoverage': 0.86 if forest > 0.55 else 0.72,
        'deposits': deposits,
    }


na.stable_id = stable_id
na.physiographic_zone = physiographic_zone
na.build_source_pieces = build_source_pieces
na.make_regions = make_regions
na.resource_endowment = resource_endowment

if __name__ == '__main__':
    na.main()
