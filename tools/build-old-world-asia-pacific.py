#!/usr/bin/env python3
"""Fill the Old World, Asia-Pacific and Greenland with durable physical regions.

Natural Earth administrative polygons are used only as source pieces. Existing
Sim-World geometry always wins. Uncovered source pieces are regrouped across
modern frontiers inside persistent physical macro-zones such as basins,
highlands, coasts, steppe belts and island arcs.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
FAST_PATH = ROOT / 'tools' / 'build-map-expansion-v2-fast.py'
spec = importlib.util.spec_from_file_location('map_fast_old_world', FAST_PATH)
fast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fast)
map_v2 = fast.map_v2

PLAN = ROOT / 'tools' / 'map-region-plan-old-world-pacific.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'
PACIFIC_EXTRAS = [box(-162.5, 17.5, -153.5, 23.5)]  # Hawaii only; Oceania dependencies are selected normally.

ENVIRONMENTS = {
    'tundra': (0.18, 0.05, 0.75), 'boreal_tundra': (0.26, 0.42, 0.82),
    'boreal': (0.34, 0.66, 0.88), 'boreal_coast': (0.38, 0.62, 0.88),
    'temperate_boreal': (0.48, 0.58, 0.82), 'temperate': (0.62, 0.38, 0.78),
    'temperate_plain': (0.72, 0.24, 0.70), 'temperate_highland': (0.48, 0.46, 0.82),
    'temperate_coast': (0.62, 0.42, 0.80), 'temperate_island': (0.58, 0.52, 0.85),
    'mediterranean': (0.54, 0.28, 0.72), 'desert': (0.12, 0.025, 0.55),
    'desert_coast': (0.20, 0.05, 0.60), 'arid_interior': (0.22, 0.08, 0.62),
    'arid_coast': (0.28, 0.10, 0.66), 'arid_highland': (0.34, 0.16, 0.68),
    'highland_arid': (0.28, 0.12, 0.70), 'highland': (0.40, 0.34, 0.78),
    'steppe': (0.48, 0.10, 0.65), 'steppe_arid': (0.32, 0.06, 0.58),
    'steppe_highland': (0.38, 0.16, 0.70), 'sahel': (0.38, 0.12, 0.65),
    'savanna': (0.52, 0.22, 0.70), 'tropical_savanna': (0.48, 0.28, 0.72),
    'tropical_forest': (0.58, 0.78, 0.92), 'tropical_highland': (0.66, 0.62, 0.88),
    'tropical_coast': (0.70, 0.58, 0.88), 'tropical_island': (0.68, 0.64, 0.90),
    'subtropical_island': (0.64, 0.52, 0.86), 'subtropical_coast': (0.68, 0.46, 0.84),
    'monsoon_arid': (0.48, 0.12, 0.68), 'monsoon_plain': (0.82, 0.28, 0.78),
    'monsoon_delta': (0.90, 0.34, 0.80), 'monsoon_highland': (0.60, 0.56, 0.86),
    'monsoon_plateau': (0.64, 0.30, 0.80), 'monsoon_coast': (0.78, 0.46, 0.86),
}


def prop(feature, *keys):
    p = feature.get('properties') or {}
    for key in keys:
        value = p.get(key)
        if value not in (None, ''):
            return value
    return None


def stable_fraction(text):
    digest = hashlib.sha1(str(text).encode('utf-8')).hexdigest()[:12]
    return int(digest, 16) / float(0xFFFFFFFFFFFF)


def continent(feature):
    return str(prop(feature, 'CONTINENT', 'continent') or '').strip()


def is_greenland(feature):
    values = {str(prop(feature, key) or '').upper() for key in ('ADM0_A3','ISO_A3','SOV_A3','GU_A3','SU_A3')}
    name = str(prop(feature, 'NAME', 'NAME_EN', 'ADMIN', 'name') or '').lower()
    return 'GRL' in values or 'greenland' in name


def target_admin0_features(admin0, target_continents):
    out = []
    for feature in admin0.get('features', []):
        if continent(feature) in target_continents or is_greenland(feature):
            geom = map_v2.clean(shape(feature['geometry']))
            if not geom.is_empty:
                out.append((feature, geom))
    return out


def pacific_extra_geometry():
    return unary_union(PACIFIC_EXTRAS)


def source_units(admin0_targets, existing):
    adm1 = fast.natural_earth_admin1()
    adm1_items = []
    for feature in adm1.get('features', []):
        geom = map_v2.clean(shape(feature['geometry']))
        if not geom.is_empty:
            adm1_items.append((feature, geom))
    tree = STRtree([g for _, g in adm1_items])
    pieces = []

    def add_piece(geom, name, source):
        geom = map_v2.repair(geom.difference(existing))
        if geom.is_empty or map_v2.area_sqkm(geom) < 8:
            return
        area = map_v2.area_sqkm(geom)
        pieces.append({'geometry': geom, 'names': [name], 'anchor': name, 'anchorArea': area,
                       'mergeArea': geom.area, 'source': source})

    for feature, country_geom in admin0_targets:
        country_name = str(prop(feature, 'NAME_EN', 'ADMIN', 'NAME', 'name') or 'Unnamed land')
        covered_parts = []
        for raw_idx in tree.query(country_geom):
            adm_feature, adm_geom = adm1_items[int(raw_idx)]
            part = map_v2.repair(adm_geom.intersection(country_geom))
            if part.is_empty or map_v2.area_sqkm(part) < 8:
                continue
            name = map_v2.feature_name(adm_feature)
            add_piece(part, name, country_name)
            covered_parts.append(part)
        covered = map_v2.repair(unary_union(covered_parts)) if covered_parts else None
        remainder = country_geom if covered is None else map_v2.repair(country_geom.difference(covered))
        if not remainder.is_empty:
            add_piece(remainder, country_name, country_name)

    # Hawaii belongs in the Pacific pass even though its sovereign's continent does not.
    extra = pacific_extra_geometry()
    for raw_idx in tree.query(extra):
        adm_feature, adm_geom = adm1_items[int(raw_idx)]
        part = map_v2.repair(adm_geom.intersection(extra))
        if part.is_empty:
            continue
        add_piece(part, map_v2.feature_name(adm_feature), 'Pacific extra')
    return pieces


def lon_in_bbox(lon, minx, maxx):
    return (minx <= lon <= maxx) if minx <= maxx else (lon >= minx or lon <= maxx)


def lon_delta(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def zone_score(piece, zone):
    c = piece['geometry'].centroid
    minx, miny, maxx, maxy = zone['bbox']
    inside = lon_in_bbox(c.x, minx, maxx) and miny <= c.y <= maxy
    zx, zy = zone['centre']
    width = (maxx - minx) if minx <= maxx else (360 - minx + maxx)
    sx = max(2.0, width / 2)
    sy = max(2.0, (maxy - miny) / 2)
    distance = math.sqrt((lon_delta(c.x, zx) / sx) ** 2 + ((c.y - zy) / sy) ** 2)
    return (0 if inside else 1, distance)


def assign_to_zones(pieces, zones):
    grouped = {zone['id']: [] for zone in zones}
    for piece in pieces:
        zone = min(zones, key=lambda z: zone_score(piece, z))
        grouped[zone['id']].append(piece)
    return grouped


def navigation_continent(zone):
    key = zone['id']
    if key.startswith('af_'): return 'Africa'
    if key.startswith(('ar_','ca_','na_','sa_','se_','ea_','mi_')): return 'Asia'
    if key.startswith(('au_','nz_','pac_')): return 'Oceania'
    if key == 'ow_greenland': return 'Greenland'
    return 'Europe'


def make_regions(zone, clusters):
    out = []
    used = set()
    ordered = sorted(clusters, key=lambda x: (x['geometry'].centroid.y, x['geometry'].centroid.x), reverse=True)
    for cluster in ordered:
        anchor = cluster.get('anchor') or zone['name']
        name = zone['name'] if len(ordered) == 1 else f"{zone['name']} — {anchor}"
        base = name; n = 2
        while name in used:
            name = f'{base} {n}'; n += 1
        used.add(name)
        cen = cluster['geometry'].centroid
        out.append({
            'id': map_v2.stable_id(zone['id'], name), 'name': name,
            'sourceGroup': zone['id'], 'navigationContinent': navigation_continent(zone),
            'navigationGroup': zone['name'], 'sourceUnits': cluster.get('names', []),
            'geometry': cluster['geometry'], 'centroid': [cen.x, cen.y],
            'areaSqKm': map_v2.area_sqkm(cluster['geometry']), 'neighbors': [],
            'environment': zone['environment'],
        })
    return out


def magnitude(seed):
    x = stable_fraction(seed)
    if x > 0.985: return 'very_major'
    if x > 0.90: return 'major'
    if x > 0.56: return 'moderate'
    return 'minor'


def maybe_deposit(region, resource, probability, deposits):
    if stable_fraction(f"{region['id']}:{resource}:presence") < probability:
        deposits[resource] = map_v2.make_deposit(resource, magnitude(f"{region['id']}:{resource}:size"))


def endowment(region):
    env = region['environment']
    land, forest, coverage = ENVIRONMENTS.get(env, ENVIRONMENTS['temperate'])
    deposits = {}
    highland = any(token in env for token in ('highland','plateau'))
    arid = any(token in env for token in ('desert','arid','steppe','sahel'))
    tropical = 'tropical' in env or 'monsoon' in env
    island = 'island' in env or region['sourceGroup'].startswith(('mi_','pac_','ea_japan','ea_sakhalin'))
    zone = region['sourceGroup']
    maybe_deposit(region, 'stone', 0.78, deposits)
    maybe_deposit(region, 'ironOre', 0.46 + (0.12 if highland else 0), deposits)
    maybe_deposit(region, 'copper', 0.24 + (0.14 if highland else 0), deposits)
    maybe_deposit(region, 'tin', 0.055 + (0.18 if zone.startswith(('mi_','se_','sa_malabar')) else 0.05 if highland else 0), deposits)
    maybe_deposit(region, 'gold', 0.07 + (0.13 if zone.startswith(('af_upper_niger','af_highveld','au_','mi_new_guinea')) else 0.05 if highland else 0), deposits)
    maybe_deposit(region, 'silver', 0.07 + (0.08 if highland else 0), deposits)
    maybe_deposit(region, 'lead', 0.09 + (0.07 if highland else 0), deposits)
    maybe_deposit(region, 'salt', 0.09 + (0.25 if arid else 0.04 if island else 0), deposits)
    maybe_deposit(region, 'fineStone', 0.08 + (0.08 if highland else 0), deposits)
    maybe_deposit(region, 'saltpetre', 0.035 + (0.12 if arid else 0.02), deposits)
    maybe_deposit(region, 'sulfur', 0.025 + (0.18 if island and zone.startswith(('mi_','ea_japan','pac_')) else 0.06 if highland else 0), deposits)
    if tropical: land = min(0.92, land + stable_fraction(region['id']) * 0.05)
    return {'landQuality': land, 'forestFraction': forest, 'forestStartCoverage': coverage, 'deposits': deposits}


def target_mask(admin0_targets):
    geoms = [geom for _, geom in admin0_targets] + PACIFIC_EXTRAS
    return map_v2.repair(unary_union(geoms))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-old-world-pacific')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    geo = json.loads(BASE_GEO.read_text())
    meta_doc = json.loads(BASE_META.read_text())
    resources = json.loads(BASE_RESOURCES.read_text())
    base_count = len(geo.get('features', []))

    admin0 = fast.fetch_json_retry(map_v2.ADMIN0_URL)
    targets = target_admin0_features(admin0, set(plan['targetContinents']))
    wanted_mask = target_mask(targets)
    existing_before = map_v2.repair(unary_union([map_v2.repair(shape(f['geometry'])) for f in geo['features']]))
    fast.prepare_existing_index(geo['features'])
    pieces = source_units(targets, existing_before)
    print(f'SOURCE_PIECES={len(pieces)}')
    grouped = assign_to_zones(pieces, plan['zones'])

    new_regions = []
    for zone in plan['zones']:
        source = grouped.get(zone['id'], [])
        if not source:
            print(f"ZONE_SKIP {zone['id']} already covered or no source pieces")
            continue
        clusters = fast.cluster_regions_fast(source, zone['targetRegions'])
        regions = make_regions(zone, clusters)
        print(f"ZONE {zone['id']} pieces={len(source)} regions={len(regions)} area={sum(r['areaSqKm'] for r in regions):.0f}")
        new_regions.extend(regions)

    map_v2.add_land_adjacency(geo['features'], meta_doc['regions'], new_regions)
    ids = {f['properties']['id'] for f in geo['features']}
    for region in new_regions:
        if region['id'] in ids:
            raise RuntimeError(f"Duplicate generated region id {region['id']}")
        ids.add(region['id'])
        geo['features'].append({
            'type': 'Feature',
            'properties': {
                'id': region['id'], 'name': region['name'], 'sourceGroup': region['sourceGroup'],
                'navigationContinent': region['navigationContinent'], 'navigationGroup': region['navigationGroup'],
            },
            'geometry': mapping(region['geometry']),
        })
        meta_doc['regions'].append({'id': region['id'], 'name': region['name'], 'centroid': region['centroid'],
                                    'areaSqKm': region['areaSqKm'], 'neighbors': region['neighbors']})
        resources[region['id']] = endowment(region)

    final_coverage = map_v2.repair(unary_union([map_v2.repair(shape(f['geometry'])) for f in geo['features']]))
    target_area = map_v2.area_sqkm(wanted_mask)
    covered_area = map_v2.area_sqkm(map_v2.repair(wanted_mask.intersection(final_coverage)))
    coverage_ratio = covered_area / max(1, target_area)
    out = Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    (out/'regions.geo.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',',':')))
    (out/'regions.meta.json').write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',',':')))
    (out/'resources.initial.json').write_text(json.dumps(resources, ensure_ascii=False, separators=(',',':')))
    review = [{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup'],'sourceUnits':r['sourceUnits'],
               'areaSqKm':round(r['areaSqKm'],1),'neighbors':len(r['neighbors'])} for r in new_regions]
    (out/'old-world-pacific-region-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    report = {
        'baseRegions': base_count, 'newRegions': len(new_regions), 'totalRegions': len(geo['features']),
        'targetAreaSqKm': round(target_area,1), 'coveredTargetAreaSqKm': round(covered_area,1),
        'targetCoverageRatio': coverage_ratio,
        'regionsByZone': {zone['id']: sum(1 for r in new_regions if r['sourceGroup']==zone['id']) for zone in plan['zones']},
        'deliberatelyDeferred': ['continental North America','South America','Caribbean'],
    }
    (out/'old-world-pacific-coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(f'BASE_REGIONS={base_count}')
    print(f'NEW_REGIONS={len(new_regions)}')
    print(f"TOTAL_REGIONS={len(geo['features'])}")
    print(f'TARGET_COVERAGE_RATIO={coverage_ratio:.6f}')
    if coverage_ratio < 0.985:
        raise RuntimeError(f'Old World / Asia-Pacific target coverage only {coverage_ratio:.3%}')


if __name__ == '__main__':
    main()
