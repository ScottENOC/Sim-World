#!/usr/bin/env python3
"""Build geography-first Central America, Caribbean and South America regions.

Natural Earth modern boundaries are source/navigation metadata only. Source pieces
are pooled and clustered by physical proximity so simulation regions can cross
modern borders. Small island states fall back to ADM0 geometry when ADM1 has no
useful coverage, preventing the Caribbean from silently disappearing. Remote
archipelagos are kept as coherent gameplay regions rather than one region per
islet.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'latin-america-region-plan-v1.json'
NA_MODULE = ROOT / 'tools' / 'build-north-america-expansion.py'

spec = importlib.util.spec_from_file_location('na_builder', NA_MODULE)
na = importlib.util.module_from_spec(spec)
spec.loader.exec_module(na)

SOURCE_GROUP = 'latin_america_caribbean_v1'
ID_PREFIX = 'la_'
TARGET_REGION_COUNT = 180
TARGET_PIECE_AREA_SQKM = 90_000
# Keep genuine tiny islands at source-piece stage. The later clustering and
# workflow sanity checks prevent sub-10 km² fragments from becoming gameplay
# regions, while this low threshold stops places such as Anguilla disappearing
# before they have a chance to merge into a sensible island-region cluster.
MIN_COMPONENT_AREA_SQKM = 1
MAX_CLUSTER_GAP_DEGREES = 0.32

na.PLAN = PLAN
na.TARGET_REGION_COUNT = TARGET_REGION_COUNT
na.TARGET_PIECE_AREA_SQKM = TARGET_PIECE_AREA_SQKM
na.MIN_COMPONENT_AREA_SQKM = MIN_COMPONENT_AREA_SQKM
na.MAX_CLUSTER_GAP_DEGREES = MAX_CLUSTER_GAP_DEGREES
na.USER_AGENT = 'Sim-World Latin America expansion/1.3'

SOUTH_AMERICA_CODES = {
    'COL','VEN','GUY','SUR','GUF','ECU','PER','BOL','BRA','PRY','URY','ARG','CHL','FLK'
}


def stable_id(source_units, lon, lat):
    token = '|'.join(sorted(source_units)) + f'|{lon:.3f}|{lat:.3f}'
    return ID_PREFIX + hashlib.sha1(token.encode('utf-8')).hexdigest()[:12]


def remote_archipelago(lon, lat):
    if -93.5 < lon < -88.0 and -3.0 < lat < 2.5:
        return ('galapagos', 'Galápagos Islands')
    if lon < -100.0 and -32.0 < lat < -20.0:
        return ('rapa_nui', 'Rapa Nui')
    if -35.0 < lon < -25.0 and -8.0 < lat < 3.5:
        return ('equatorial_atlantic', 'Equatorial Atlantic Islands')
    return None


def physiographic_zone(lon, lat):
    remote = remote_archipelago(lon, lat)
    if remote:
        return remote[1]
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


def collapse_remote_archipelagos(pieces):
    """Keep widely separated islands in a named archipelago as one gameplay region.

    Land geometry remains its true MultiPolygon; only the simulation-region grouping
    changes. This avoids five Galápagos regions or an isolated Rapa Nui islet while
    preserving those islands as physically separate land masses surrounded by sea.
    """
    grouped = defaultdict(list)
    ordinary = []
    for piece in pieces:
        c = piece['geometry'].centroid
        remote = remote_archipelago(c.x, c.y)
        if remote:
            grouped[remote].append(piece)
        else:
            ordinary.append(piece)
    for (_key, label), members in grouped.items():
        geom = na.map_v2.repair(unary_union([m['geometry'] for m in members]))
        source_units = sorted({u for m in members for u in m['sourceUnits']})
        ordinary.append({
            'geometry': geom,
            'sourceUnits': source_units,
            'anchor': label,
            'anchorISO': members[0]['anchorISO'],
            'area': na.map_v2.area_sqkm(geom),
        })
    return ordinary


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
            if na.map_v2.area_sqkm(component) < MIN_COMPONENT_AREA_SQKM:
                continue
            for piece in na.split_component_grid(component, TARGET_PIECE_AREA_SQKM):
                raw.append({
                    'geometry': piece,
                    'sourceUnits': [f'{iso}:{source_name}'],
                    'anchor': source_name,
                    'anchorISO': iso,
                    'area': na.map_v2.area_sqkm(piece),
                })

    # ADM1 is inconsistent for small islands and dependencies. Use the uncovered
    # ADM0 mask as a real-geometry fallback instead of inventing placeholder land.
    for iso, mask in masks.items():
        remaining = na.map_v2.repair(mask.difference(existing))
        if covered.get(iso):
            remaining = na.map_v2.repair(remaining.difference(unary_union(covered[iso])))
        if remaining.is_empty:
            continue
        for component in na.polygons(remaining):
            if na.map_v2.area_sqkm(component) < MIN_COMPONENT_AREA_SQKM:
                continue
            for piece in na.split_component_grid(component, TARGET_PIECE_AREA_SQKM):
                raw.append({
                    'geometry': piece,
                    'sourceUnits': [f'{iso}:{names.get(iso, iso)}'],
                    'anchor': names.get(iso, iso),
                    'anchorISO': iso,
                    'area': na.map_v2.area_sqkm(piece),
                })
    return collapse_remote_archipelagos(raw)


def make_regions(clusters):
    provisional = []
    for cluster in clusters:
        geom = na.map_v2.repair(cluster['geometry'])
        c = geom.centroid
        provisional.append({**cluster, 'centroid': [c.x, c.y], 'zone': physiographic_zone(c.x, c.y)})
    by_zone = defaultdict(list)
    for item in provisional:
        by_zone[item['zone']].append(item)
    used = set()
    out = []
    for item in sorted(provisional, key=lambda x: (-x['centroid'][1], x['centroid'][0])):
        lon, lat = item['centroid']
        remote = remote_archipelago(lon, lat)
        if remote:
            name = remote[1]
        else:
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
        source_codes = {unit.split(':', 1)[0] for unit in item['sourceUnits']}
        continent = 'South America' if source_codes and source_codes <= SOUTH_AMERICA_CODES else 'North America'
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
            'navigationContinent': continent,
        })
    return out


def resource_endowment(region):
    lon, _lat = region['centroid']
    zone = region['zone']
    forest, quality = 0.58, 0.90
    if 'Islands' in zone or zone == 'Rapa Nui':
        forest, quality = 0.34, 0.78
    elif 'Amazon' in zone:
        forest, quality = 0.86, 0.58
    elif 'Guiana' in zone:
        forest, quality = 0.82, 0.54
    elif 'Andes' in zone or 'Highlands' in zone:
        forest, quality = 0.30, 0.65
    elif 'Caribbean' in zone or 'Antilles' in zone:
        forest, quality = 0.62, 0.94
    elif 'Pampas' in zone:
        forest, quality = 0.18, 1.30
    elif 'Chaco' in zone:
        forest, quality = 0.42, 0.82
    elif 'Brazilian Highlands' in zone or 'Atlantic Brazil' in zone:
        forest, quality = 0.58, 1.03
    elif 'Patagon' in zone or 'Tierra' in zone:
        forest, quality = 0.16, 0.38

    seed = region['id']
    deposits = {'stone': na.map_v2.make_deposit('stone', 'major')}
    deposits['ironOre'] = na.map_v2.make_deposit(
        'ironOre', na.magnitude_for(seed, 'ironOre', [('major',0.22),('moderate',0.50),('minor',0.26)]) or 'minor')
    andean = 'Andes' in zone or (lon < -69 and zone not in {'Galápagos Islands', 'Rapa Nui'})
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-latin-america-v1')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    geo = json.loads(na.BASE_GEO.read_text())
    meta_doc = json.loads(na.BASE_META.read_text())
    resources = json.loads(na.BASE_RESOURCES.read_text())
    admin0 = na.fetch_json(na.ADMIN0_URL)
    admin1 = na.fetch_json(na.ADMIN1_URL)
    wanted = {c['iso'] for c in plan['countries']}
    masks = na.country_masks(admin0, wanted)
    missing = wanted - set(masks)
    if missing:
        raise RuntimeError(f'Missing Natural Earth country geometry: {sorted(missing)}')

    existing = na.map_v2.repair(unary_union([
        na.map_v2.repair(shape(f['geometry'])) for f in geo.get('features', [])
    ]))
    pieces = build_source_pieces(admin1, masks, existing)
    if len(pieces) < TARGET_REGION_COUNT:
        raise RuntimeError(f'Only {len(pieces)} source pieces for {TARGET_REGION_COUNT} target regions')
    clusters = na.cluster_pieces(pieces, TARGET_REGION_COUNT)
    regions = make_regions(clusters)
    na.add_adjacency(geo['features'], meta_doc['regions'], regions)

    existing_ids = {f['properties']['id'] for f in geo['features']}
    for region in regions:
        if region['id'] in existing_ids:
            raise RuntimeError(f'Duplicate region id {region["id"]}')
        existing_ids.add(region['id'])
        geo['features'].append({
            'type': 'Feature',
            'properties': {
                'id': region['id'], 'name': region['name'], 'sourceGroup': SOURCE_GROUP,
                'navigationContinent': region['navigationContinent'], 'sourceUnits': region['sourceUnits'],
            },
            'geometry': mapping(region['geometry']),
        })
        meta_doc['regions'].append({
            'id': region['id'], 'name': region['name'], 'centroid': region['centroid'],
            'areaSqKm': region['areaSqKm'], 'neighbors': region['neighbors'],
        })
        resources[region['id']] = resource_endowment(region)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    (out / 'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    (out / 'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))
    review = [{
        'id': r['id'], 'name': r['name'], 'zone': r['zone'],
        'navigationContinent': r['navigationContinent'], 'areaSqKm': round(r['areaSqKm'], 1),
        'sourceUnits': r['sourceUnits'], 'neighborCount': len(r['neighbors']),
    } for r in regions]
    (out / 'latin-america-v1-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')

    cross_border = sum(1 for r in regions if len({u.split(':', 1)[0] for u in r['sourceUnits']}) > 1)
    isolated = [r['name'] for r in regions if not r['neighbors']]
    areas = sorted(r['areaSqKm'] for r in regions)
    print(f'SOURCE_PIECES={len(pieces)}')
    print(f'NEW_LATIN_AMERICA_REGIONS={len(regions)}')
    print(f'CROSS_MODERN_BORDER_REGIONS={cross_border}')
    print(f'TOTAL_LAND_REGIONS={len(geo["features"])}')
    print(f'MEDIAN_NEW_REGION_AREA_SQKM={areas[len(areas)//2]:.0f}')
    print(f'MIN_NEW_REGION_AREA_SQKM={areas[0]:.0f}')
    print(f'MAX_NEW_REGION_AREA_SQKM={areas[-1]:.0f}')
    print(f'ISOLATED_NEW_REGIONS_PRE_SEA={len(isolated)}')
    if cross_border < 3:
        raise RuntimeError(f'Expected several cross-modern-border regions; only {cross_border} formed')
    if len(regions) < 170:
        raise RuntimeError(f'Latin America expansion unexpectedly coarse: {len(regions)} regions')


if __name__ == '__main__':
    main()
