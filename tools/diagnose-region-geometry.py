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

# Ring orientation is diagnostic only: RFC 7946 recommends outer rings CCW, but the
# renderer should not depend on winding. Signed area helps spot accidental complements.
def signed_area(coords):
    total = 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        total += x1 * y2 - x2 * y1
    return total / 2.0

polys = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
for i, poly in enumerate(polys[:20]):
    exterior = list(poly.exterior.coords)
    print('POLY', i, 'EXTERIOR_POINTS', len(exterior), 'SIGNED_AREA', round(signed_area(exterior), 6), 'HOLES', len(poly.interiors))
    for j, ring in enumerate(poly.interiors[:5]):
        coords = list(ring.coords)
        print('  HOLE', j, 'POINTS', len(coords), 'SIGNED_AREA', round(signed_area(coords), 6))

# This should never be a near-global region. Keep a permanent tripwire for the visual
# failure mode the player reported while allowing legitimate dateline-crossing islands.
if geom.bounds[2] - geom.bounds[0] > 300 and geom.area > 10000:
    raise SystemExit(f'{TARGET} looks like a world-sized/complement geometry')
