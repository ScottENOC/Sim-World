import json
from pathlib import Path

from shapely.geometry import shape
from shapely.validation import explain_validity

TARGET = 'r2_bff0592ed5d'

nav = json.loads(Path('data/world/region-navigation.json').read_text())
geo = json.loads(Path('data/world/regions.geo.json').read_text())
meta = json.loads(Path('data/world/regions.meta.json').read_text())


def region_id(obj):
    if not isinstance(obj, dict):
        return None
    props = obj.get('properties') if isinstance(obj.get('properties'), dict) else {}
    return obj.get('id') or props.get('id') or props.get('regionId') or props.get('region_id')


def find_in(value, target):
    if isinstance(value, dict):
        if value.get('id') == target or value.get('regionId') == target or value.get('region_id') == target:
            return value
        if target in value:
            return value[target]
        for child in value.values():
            found = find_in(child, target)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_in(child, target)
            if found is not None:
                return found
    return None


def signed_area(coords):
    total = 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        total += x1 * y2 - x2 * y1
    return total / 2.0


def polygons(geom):
    if geom.geom_type == 'Polygon':
        return [geom]
    if hasattr(geom, 'geoms'):
        found = []
        for child in geom.geoms:
            found.extend(polygons(child))
        return found
    return []

feature = next((f for f in geo.get('features', []) if region_id(f) == TARGET), None)
if feature is None:
    feature = find_in(geo, TARGET)
if not isinstance(feature, dict) or 'geometry' not in feature:
    raise SystemExit(f'Could not locate geometry for {TARGET}')

geom = shape(feature['geometry'])
nav_entry = find_in(nav, TARGET)
meta_entry = find_in(meta, TARGET)

print('TARGET', TARGET)
print('NAV', json.dumps(nav_entry, ensure_ascii=False, sort_keys=True))
print('META', json.dumps(meta_entry, ensure_ascii=False, sort_keys=True))
print('FEATURE_PROPERTIES', json.dumps(feature.get('properties', {}), ensure_ascii=False, sort_keys=True))
print('GEOMETRY_TYPE', geom.geom_type)
print('BOUNDS', tuple(round(v, 6) for v in geom.bounds))
print('AREA_DEG2', round(geom.area, 6))
print('VALID', geom.is_valid, explain_validity(geom))
print('PARTS', len(polygons(geom)))

for i, poly in enumerate(polygons(geom)):
    exterior = list(poly.exterior.coords)
    print('POLY', i, 'EXTERIOR_POINTS', len(exterior), 'SIGNED_AREA', round(signed_area(exterior), 9), 'HOLES', len(poly.interiors))
    for j, ring in enumerate(poly.interiors):
        coords = list(ring.coords)
        print('  HOLE', j, 'POINTS', len(coords), 'SIGNED_AREA', round(signed_area(coords), 9))

bad_hole_regions = []
hole_region_count = 0
hole_count = 0
bad_hole_count = 0
for candidate in geo.get('features', []):
    candidate_id = region_id(candidate)
    candidate_geom = shape(candidate['geometry'])
    candidate_bad = []
    has_hole = False
    for poly_index, poly in enumerate(polygons(candidate_geom)):
        exterior_area = signed_area(list(poly.exterior.coords))
        if exterior_area >= 0:
            candidate_bad.append({'kind': 'exterior', 'polygon': poly_index, 'signedArea': exterior_area})
        for hole_index, ring in enumerate(poly.interiors):
            has_hole = True
            hole_count += 1
            hole_area = signed_area(list(ring.coords))
            if hole_area <= 0:
                bad_hole_count += 1
                candidate_bad.append({'kind': 'hole', 'polygon': poly_index, 'hole': hole_index, 'signedArea': hole_area})
    if has_hole:
        hole_region_count += 1
    if candidate_bad:
        bad_hole_regions.append({'id': candidate_id, 'name': candidate.get('properties', {}).get('name'), 'issues': candidate_bad})

print('HOLE_REGION_COUNT', hole_region_count)
print('HOLE_COUNT', hole_count)
print('BAD_HOLE_COUNT', bad_hole_count)
print('BAD_ORIENTATION_REGION_COUNT', len(bad_hole_regions))
print('BAD_ORIENTATION_SAMPLE', json.dumps(bad_hole_regions[:100], ensure_ascii=False))
