#!/usr/bin/env python3
"""Build compact, static terrain composition for each gameplay land region.

Topographic hints come from Natural Earth's physical-region polygons. Forest
share comes from the game's existing static ecological endowment. The output is
read only when systems such as combat/movement need terrain; nothing here runs
inside the simulation tick.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
import urllib.request
import zipfile
from pathlib import Path

import shapefile
from shapely.geometry import shape as shapely_shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GEO = ROOT / 'data/world/regions.geo.json'
DEFAULT_RESOURCES = ROOT / 'data/world/resources.initial.json'
DEFAULT_OUTPUT = ROOT / 'data/world/terrain.initial.json'
PHYSICAL_URL = 'https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_geography_regions_polys.zip'

MOUNTAIN_WORDS = (
    'mountain', 'mountains', 'range', 'highland', 'highlands', 'alps', 'pyren',
    'caucas', 'carpath', 'apenn', 'zagros', 'taurus', 'atlas', 'rhaet', 'tirol',
    'tyrol', 'valais', 'massif', 'sierra',
)
HILL_WORDS = ('hill', 'hills', 'upland', 'plateau', 'foothill', 'foothills', 'tableland')
PLAIN_WORDS = ('plain', 'plains', 'lowland', 'lowlands', 'valley', 'basin', 'steppe', 'pannon', 'po valley')
WETLAND_WORDS = ('marsh', 'marshes', 'wetland', 'wetlands', 'fen', 'fens', 'delta', 'swamp', 'bog')
DRY_OPEN_WORDS = ('sahara', 'desert', 'arabia', 'najd', 'rub al khali', 'steppe')

REGION_OVERRIDES = {
    'Rhaetian Alps': (0.08, 0.25, 0.67),
    'Upper Rhône & Valais': (0.12, 0.33, 0.55),
    'Bernese Plateau & Alps': (0.30, 0.38, 0.32),
    'Southern Swiss Alps': (0.12, 0.34, 0.54),
    'Swiss Plateau & Upper Rhine': (0.52, 0.33, 0.15),
    'Lake Geneva & Western Plateau': (0.48, 0.36, 0.16),
}


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def normalise_three(plains, hills, mountains):
    vals = [max(0.0, plains), max(0.0, hills), max(0.0, mountains)]
    total = sum(vals) or 1.0
    return tuple(v / total for v in vals)


def feature_text(props):
    return ' '.join(str(v) for v in props.values() if v is not None).lower()


def classify_physical(props):
    text = feature_text(props)
    if any(word in text for word in MOUNTAIN_WORDS):
        return 'mountains'
    if any(word in text for word in HILL_WORDS):
        return 'hills'
    if any(word in text for word in WETLAND_WORDS):
        return 'wetland'
    if any(word in text for word in PLAIN_WORDS):
        return 'plains'
    return None


def fetch_physical_regions():
    req = urllib.request.Request(PHYSICAL_URL, headers={'User-Agent': 'Sim-World terrain builder'})
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        shp_name = next(n for n in zf.namelist() if n.endswith('.shp'))
        dbf_name = next(n for n in zf.namelist() if n.endswith('.dbf'))
        shx_name = next(n for n in zf.namelist() if n.endswith('.shx'))
        reader = shapefile.Reader(
            shp=io.BytesIO(zf.read(shp_name)),
            dbf=io.BytesIO(zf.read(dbf_name)),
            shx=io.BytesIO(zf.read(shx_name)),
        )
        fields = [field[0] for field in reader.fields[1:]]
        rows = []
        for sr in reader.iterShapeRecords():
            props = dict(zip(fields, sr.record))
            category = classify_physical(props)
            if not category:
                continue
            geom = shapely_shape(sr.shape.__geo_interface__)
            if geom.is_empty:
                continue
            rows.append((geom, category, props))
    print(f'PHYSICAL_TERRAIN_FEATURES={len(rows)}')
    return rows


def name_topography(name, resource):
    if name in REGION_OVERRIDES:
        return REGION_OVERRIDES[name]
    text = name.lower()
    plains, hills, mountains = 0.62, 0.28, 0.10
    quality = float(resource.get('landQuality', 1.0) or 1.0)
    if quality >= 1.2:
        plains += 0.10
        hills -= 0.06
        mountains -= 0.04
    if any(word in text for word in MOUNTAIN_WORDS):
        plains, hills, mountains = 0.12, 0.33, 0.55
    elif any(word in text for word in HILL_WORDS):
        plains, hills, mountains = 0.25, 0.58, 0.17
    elif any(word in text for word in PLAIN_WORDS):
        plains, hills, mountains = 0.82, 0.15, 0.03
    if any(word in text for word in DRY_OPEN_WORDS):
        plains, hills, mountains = max(plains, 0.73), min(hills, 0.22), min(mountains, 0.08)
    return normalise_three(plains, hills, mountains)


def wetland_hint(name, resource):
    text = name.lower()
    if any(word in text for word in WETLAND_WORDS):
        return 0.14
    if 'netherland' in text or 'fries' in text or 'flevoland' in text:
        return 0.10
    quality = float(resource.get('landQuality', 1.0) or 1.0)
    return 0.018 if quality >= 1.25 else 0.008


def build_region_terrain(feature, resource, physical_geoms, physical_categories, tree):
    region_geom = shapely_shape(feature['geometry'])
    name = feature.get('properties', {}).get('name', '')
    base_plains, base_hills, base_mountains = name_topography(name, resource)

    terrain_overlap = {'plains': 0.0, 'hills': 0.0, 'mountains': 0.0, 'wetland': 0.0}
    if not region_geom.is_empty and region_geom.area > 0:
        for idx in tree.query(region_geom):
            physical = physical_geoms[int(idx)]
            try:
                overlap = region_geom.intersection(physical).area / region_geom.area
            except Exception:
                continue
            if overlap <= 0:
                continue
            terrain_overlap[physical_categories[int(idx)]] += overlap

    # Natural Earth label polygons are deliberately broad/approximate. Use them
    # as a strong hint rather than allowing them to replace all local detail.
    mountain_hint = clamp(terrain_overlap['mountains'], 0, 0.75)
    hill_hint = clamp(terrain_overlap['hills'], 0, 0.75)
    plain_hint = clamp(terrain_overlap['plains'], 0, 0.85)
    hint_total = mountain_hint + hill_hint + plain_hint
    blend = clamp(hint_total, 0, 0.72)
    if hint_total > 0:
        hp, hh, hm = normalise_three(plain_hint, hill_hint, mountain_hint)
        plains = base_plains * (1 - blend) + hp * blend
        hills = base_hills * (1 - blend) + hh * blend
        mountains = base_mountains * (1 - blend) + hm * blend
    else:
        plains, hills, mountains = base_plains, base_hills, base_mountains
    plains, hills, mountains = normalise_three(plains, hills, mountains)

    forest_potential = clamp(float(resource.get('forestFraction', 0.25) or 0.0), 0, 0.75)
    start_coverage = clamp(float(resource.get('forestStartCoverage', 0.5) or 0.0))
    forest = clamp(forest_potential * start_coverage, 0, 0.62)
    wetland = max(wetland_hint(name, resource), clamp(terrain_overlap['wetland'], 0, 0.22))
    wetland = clamp(wetland, 0, 0.22)

    available = max(0.05, 1 - forest - wetland)
    # Forest tends to occupy both hills and plains; mountains are less readily
    # converted into the generic 'forest battle' category.
    underlying = {'plains': plains, 'hills': hills, 'mountains': mountains}
    mountain_final = mountains * available
    nonmount = max(1e-9, plains + hills)
    plains_final = (available - mountain_final) * plains / nonmount
    hills_final = (available - mountain_final) * hills / nonmount

    values = {
        'plains': plains_final,
        'hills': hills_final,
        'mountains': mountain_final,
        'forest': forest,
        'wetland': wetland,
    }
    total = sum(values.values()) or 1
    values = {k: round(v / total, 6) for k, v in values.items()}
    # Correct rounding drift on plains, which is always safe and present.
    values['plains'] = round(values['plains'] + (1 - sum(values.values())), 6)
    values['forestPotential'] = round(forest_potential, 6)
    values['ruggedness'] = round(clamp(mountains + hills * 0.55), 6)
    values['source'] = 'natural-earth-physical+simworld-forest-v1'
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geo', default=str(DEFAULT_GEO))
    parser.add_argument('--resources', default=str(DEFAULT_RESOURCES))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    geo = json.loads(Path(args.geo).read_text())
    resources = json.loads(Path(args.resources).read_text())
    physical = fetch_physical_regions()
    physical_geoms = [row[0] for row in physical]
    physical_categories = [row[1] for row in physical]
    tree = STRtree(physical_geoms)

    output = {}
    for feature in geo.get('features', []):
        rid = feature.get('properties', {}).get('id')
        if not rid or rid not in resources:
            raise RuntimeError(f'Missing resource endowment for {rid}')
        output[rid] = build_region_terrain(feature, resources[rid], physical_geoms, physical_categories, tree)

    if set(output) != {f['properties']['id'] for f in geo.get('features', [])}:
        raise RuntimeError('Terrain IDs differ from land-region IDs')
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'TERRAIN_REGIONS={len(output)}')

    # Useful calibration output for CI logs.
    by_name = {f['properties']['name']: output[f['properties']['id']] for f in geo.get('features', [])}
    for name in ('Rhaetian Alps', 'Upper Rhône & Valais', 'Swiss Plateau & Upper Rhine', 'Bahrain', 'Oslo'):
        if name in by_name:
            print(f'TERRAIN_SAMPLE {name}: {by_name[name]}')


if __name__ == '__main__':
    main()
