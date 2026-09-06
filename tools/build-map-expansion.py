#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import math
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'tools' / 'map-source-inventory.json'
PLAN = ROOT / 'tools' / 'map-region-plan.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'
GEOD = Geod(ellps='WGS84')
USER_AGENT = 'Sim-World Bronze Age map builder/1.1'
ADJACENCY_TOLERANCE_DEG = 0.025
SIGNIFICANT_OVERLAP_SQKM = 20.0
COUNTRY_CODE_KEYS = ('ADM0_A3', 'ISO_A3', 'SOV_A3', 'SU_A3', 'GU_A3', 'BRK_A3', 'ADM0_A3_IS')
COUNTRY_CODE_ALIASES = {'PSE': {'PSE', 'PSX'}}


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def clean_geom(geom):
    if geom.is_empty:
        return geom
    if not geom.is_valid:
        geom = geom.buffer(0)
    return geom.simplify(0.01, preserve_topology=True)


def area_sqkm(geom):
    if geom.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / 1_000_000.0


def stable_id(iso, name):
    digest = hashlib.sha1(f'expansion-v1|{iso}|{name}'.encode('utf-8')).hexdigest()[:10]
    return f'r_{digest}'


def haversine_km(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def load_country_masks(plan):
    mask_spec = plan.get('borderMask') or {}
    url = mask_spec.get('url')
    if not url:
        return {}
    geo = fetch_json(url)
    requested = {c['iso'] for c in plan['countries']}
    masks = {iso: [] for iso in requested}
    for feature in geo.get('features', []):
        props = feature.get('properties') or {}
        codes = {str(props.get(key, '')).upper() for key in COUNTRY_CODE_KEYS if props.get(key)}
        geom = clean_geom(shape(feature['geometry']))
        for iso in requested:
            accepted = {iso} | COUNTRY_CODE_ALIASES.get(iso, set())
            if codes & accepted:
                masks[iso].append(geom)
    result = {}
    for iso, parts in masks.items():
        if not parts:
            raise RuntimeError(f'{iso}: no country mask found in common border dataset')
        result[iso] = clean_geom(unary_union(parts))
    return result


def source_features(country, inventory_row, country_mask=None):
    url = inventory_row.get('simplifiedGeojsonURL') or inventory_row.get('geojsonURL')
    if not url:
        raise RuntimeError(f"{country['iso']}: source inventory has no GeoJSON URL")
    geo = fetch_json(url)
    by_name = {}
    for feature in geo.get('features', []):
        props = feature.get('properties') or {}
        name = props.get('shapeName') or props.get('name') or props.get('NAME_1')
        if not name:
            continue
        geom = clean_geom(shape(feature['geometry']))
        if country_mask is not None:
            geom = clean_geom(geom.intersection(country_mask))
        by_name.setdefault(str(name), []).append(geom)
    return by_name


def merged_from_units(unit_names, by_name, iso, region_name):
    parts = []
    for unit in unit_names:
        matches = [g for g in (by_name.get(unit) or []) if not g.is_empty]
        if not matches:
            raise RuntimeError(f'{iso}/{region_name}: source unit not found after border clipping: {unit}')
        parts.extend(matches)
    geom = clean_geom(unary_union(parts))
    if geom.is_empty:
        raise RuntimeError(f'{iso}/{region_name}: merged geometry is empty')
    return geom


def partition_internal_overlaps(regions):
    occupied = None
    removed_sqkm = 0.0
    for region in regions:
        geom = region['geometry']
        if occupied is not None and geom.intersects(occupied):
            overlap = geom.intersection(occupied)
            removed_sqkm += area_sqkm(overlap)
            geom = clean_geom(geom.difference(occupied))
            if geom.is_empty:
                raise RuntimeError(f"{region['sourceGroup']}/{region['name']}: empty after internal-overlap cleanup")
            region['geometry'] = geom
            centroid = geom.centroid
            region['centroid'] = [centroid.x, centroid.y]
            region['areaSqKm'] = area_sqkm(geom)
        occupied = geom if occupied is None else clean_geom(unary_union([occupied, geom]))
    return removed_sqkm


def build_new_regions(plan, inventory):
    inventory_by_iso = {row['iso']: row for row in inventory['countries']}
    masks = load_country_masks(plan)
    output = []
    for country in plan['countries']:
        iso = country['iso']
        row = inventory_by_iso[iso]
        by_name = source_features(country, row, masks.get(iso))
        excluded = set(country.get('excludedSourceUnits') or [])
        mode = country['mode']
        country_regions = []
        if mode == 'one-per-source':
            rename = country.get('rename') or {}
            for source_name in row.get('units', []):
                if source_name in excluded:
                    continue
                geom = merged_from_units([source_name], by_name, iso, source_name)
                country_regions.append(make_region(iso, rename.get(source_name, source_name), geom, [source_name]))
        elif mode == 'merge':
            for spec in country.get('regions', []):
                geom = merged_from_units(spec['units'], by_name, iso, spec['name'])
                country_regions.append(make_region(iso, spec['name'], geom, spec['units']))
        else:
            raise RuntimeError(f'{iso}: unsupported mode {mode!r}')
        removed = partition_internal_overlaps(country_regions)
        if removed > 0.1:
            print(f'INTERNAL_OVERLAP_REMOVED {iso}={removed:.1f} km²')
        output.extend(country_regions)
    return output


def make_region(iso, name, geom, source_units):
    centroid = geom.centroid
    return {
        'id': stable_id(iso, name),
        'name': name,
        'sourceGroup': iso,
        'sourceUnits': list(source_units),
        'geometry': geom,
        'centroid': [centroid.x, centroid.y],
        'areaSqKm': area_sqkm(geom),
        'neighbors': [],
    }


def pairwise_overlap_warnings(regions):
    warnings = []
    geoms = [r['geometry'] for r in regions]
    tree = STRtree(geoms)
    index = {id(g): i for i, g in enumerate(geoms)}
    checked = set()
    for i, geom in enumerate(geoms):
        for hit in tree.query(geom):
            j = int(hit) if hasattr(hit, 'item') or isinstance(hit, int) else index[id(hit)]
            if j <= i or (i, j) in checked:
                continue
            checked.add((i, j))
            other = geoms[j]
            if not geom.intersects(other):
                continue
            overlap = area_sqkm(geom.intersection(other))
            if overlap > SIGNIFICANT_OVERLAP_SQKM:
                a = f"{regions[i]['sourceGroup']}:{regions[i]['name']}"
                b = f"{regions[j]['sourceGroup']}:{regions[j]['name']}"
                warnings.append((overlap, a, b))
    return sorted(warnings, reverse=True)


def add_land_adjacency(base_features, base_meta, new_regions):
    base_geom_by_id = {f['properties']['id']: clean_geom(shape(f['geometry'])) for f in base_features}
    meta_by_id = {m['id']: m for m in base_meta}
    new_geoms = [r['geometry'] for r in new_regions]
    for i, region in enumerate(new_regions):
        geom = new_geoms[i]
        for j in range(i + 1, len(new_regions)):
            other = new_geoms[j]
            if geom.distance(other) < ADJACENCY_TOLERANCE_DEG:
                region['neighbors'].append(new_regions[j]['id'])
                new_regions[j]['neighbors'].append(region['id'])
        minx, miny, maxx, maxy = geom.bounds
        for old_id, old_geom in base_geom_by_id.items():
            ominx, ominy, omaxx, omaxy = old_geom.bounds
            if omaxx < minx - ADJACENCY_TOLERANCE_DEG or ominx > maxx + ADJACENCY_TOLERANCE_DEG or omaxy < miny - ADJACENCY_TOLERANCE_DEG or ominy > maxy + ADJACENCY_TOLERANCE_DEG:
                continue
            if geom.distance(old_geom) < ADJACENCY_TOLERANCE_DEG:
                region['neighbors'].append(old_id)
                old_neighbors = meta_by_id[old_id].setdefault('neighbors', [])
                if region['id'] not in old_neighbors:
                    old_neighbors.append(region['id'])
    for region in new_regions:
        region['neighbors'] = sorted(set(region['neighbors']))
    for meta in base_meta:
        meta['neighbors'] = sorted(set(meta.get('neighbors', [])))


def nearest_resource_template(centroid, base_meta, base_resources):
    best = None
    best_distance = float('inf')
    for m in base_meta:
        if m['id'] not in base_resources:
            continue
        d = haversine_km(centroid, m['centroid'])
        if d < best_distance:
            best_distance = d
            best = base_resources[m['id']]
    if best is None:
        raise RuntimeError('No existing resource templates available')
    return copy.deepcopy(best)


def write_outputs(out_dir, base_geo, base_meta_doc, base_resources, new_regions):
    out_dir.mkdir(parents=True, exist_ok=True)
    base_ids = {f['properties']['id'] for f in base_geo['features']}
    new_ids = {r['id'] for r in new_regions}
    collision = base_ids & new_ids
    if collision:
        raise RuntimeError(f'Generated IDs collide with existing map: {sorted(collision)}')
    for r in new_regions:
        base_geo['features'].append({'type':'Feature','properties':{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup']},'geometry':mapping(r['geometry'])})
        base_meta_doc['regions'].append({'id':r['id'],'name':r['name'],'centroid':r['centroid'],'areaSqKm':r['areaSqKm'],'neighbors':r['neighbors']})
        base_resources[r['id']] = nearest_resource_template(r['centroid'], base_meta_doc['regions'][:-1], base_resources)
    (out_dir / 'regions.geo.json').write_text(json.dumps(base_geo, ensure_ascii=False, separators=(',', ':')))
    (out_dir / 'regions.meta.json').write_text(json.dumps(base_meta_doc, ensure_ascii=False, separators=(',', ':')))
    (out_dir / 'resources.initial.json').write_text(json.dumps(base_resources, ensure_ascii=False, separators=(',', ':')))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-map-expansion')
    parser.add_argument('--fail-on-overlap', action='store_true')
    args = parser.parse_args()
    inventory = json.loads(INVENTORY.read_text())
    plan = json.loads(PLAN.read_text())
    base_geo = json.loads(BASE_GEO.read_text())
    base_meta_doc = json.loads(BASE_META.read_text())
    base_resources = json.loads(BASE_RESOURCES.read_text())
    if len(base_geo.get('features', [])) != plan.get('targetExistingRegionCount'):
        raise RuntimeError(f"Base map has {len(base_geo.get('features', []))} regions; plan expected {plan.get('targetExistingRegionCount')}")
    new_regions = build_new_regions(plan, inventory)
    warnings = pairwise_overlap_warnings(new_regions)
    for overlap, a, b in warnings[:30]:
        print(f'OVERLAP {overlap:.1f} km²: {a} / {b}')
    if args.fail_on_overlap and warnings:
        raise RuntimeError(f'{len(warnings)} significant overlaps among new game regions')
    add_land_adjacency(base_geo['features'], base_meta_doc['regions'], new_regions)
    write_outputs(Path(args.output_dir), base_geo, base_meta_doc, base_resources, new_regions)
    isolated = [r['name'] for r in new_regions if not r['neighbors']]
    print(f'BASE_REGIONS={plan.get("targetExistingRegionCount")}')
    print(f'NEW_REGIONS={len(new_regions)}')
    print(f'TOTAL_REGIONS={len(base_geo["features"])}')
    print(f'SIGNIFICANT_OVERLAPS={len(warnings)}')
    print(f'ISOLATED_NEW_REGIONS={len(isolated)}')
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))
    print(f'OUTPUT_DIR={args.output_dir}')


if __name__ == '__main__':
    main()
