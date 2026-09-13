import json
from pathlib import Path

from shapely.geometry import shape
from shapely.validation import explain_validity

TARGET = 'r2_42b2f278324'

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
print('LON_SPAN', round(geom.bounds[2] - geom.bounds[0], 6))
print('LAT_SPAN', round(geom.bounds[3] - geom.bounds[1], 6))
print('AREA_DEG2', round(geom.area, 6))
print('VALID', geom.is_valid, explain_validity(geom))
print('EMPTY', geom.is_empty)
print('PARTS', len(getattr(geom, 'geoms', [geom])))

polys = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
for i, poly in enumerate(polys[:20]):
    exterior = list(poly.exterior.coords)
    print('POLY', i, 'EXTERIOR_POINTS', len(exterior), 'SIGNED_AREA', round(signed_area(exterior), 6), 'HOLES', len(poly.interiors))
    for j, ring in enumerate(poly.interiors[:5]):
        coords = list(ring.coords)
        print('  HOLE', j, 'POINTS', len(coords), 'SIGNED_AREA', round(signed_area(coords), 6))

clockwise_regions = []
counterclockwise_regions = []
mixed_regions = []
for candidate in geo.get('features', []):
    candidate_id = region_id(candidate)
    candidate_geom = shape(candidate['geometry'])
    candidate_polys = list(candidate_geom.geoms) if candidate_geom.geom_type == 'MultiPolygon' else [candidate_geom]
    signs = []
    for poly in candidate_polys:
        area = signed_area(list(poly.exterior.coords))
        if abs(area) > 1e-12:
            signs.append(area > 0)
    if signs and all(signs):
        counterclockwise_regions.append(candidate_id)
    elif signs and not any(signs):
        clockwise_regions.append(candidate_id)
    elif signs:
        mixed_regions.append(candidate_id)

print('WINDING_COUNTS', json.dumps({
    'counterclockwise': len(counterclockwise_regions),
    'clockwise': len(clockwise_regions),
    'mixed': len(mixed_regions),
}, sort_keys=True))
print('CLOCKWISE_SAMPLE', json.dumps(clockwise_regions[:30]))
print('MIXED_SAMPLE', json.dumps(mixed_regions[:30]))

# This should never be a near-global region. Keep a permanent tripwire for the visual
# failure mode the player reported while allowing legitimate dateline-crossing islands.
if geom.bounds[2] - geom.bounds[0] > 300 and geom.area > 10000:
    raise SystemExit(f'{TARGET} looks like a world-sized/complement geometry')
