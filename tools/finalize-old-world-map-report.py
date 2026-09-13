#!/usr/bin/env python3
"""Create one aggregate coverage report after all land batches finish."""
import importlib.util
import json
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'data' / 'world'
BUILDER_PATH = ROOT / 'tools' / 'build-old-world-asia-pacific.py'
PLAN_PATH = ROOT / 'tools' / 'map-region-plan-old-world-pacific.json'

spec = importlib.util.spec_from_file_location('old_world_builder_finalize', BUILDER_PATH)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

plan = json.loads(PLAN_PATH.read_text())
geo = json.loads((WORLD / 'regions.geo.json').read_text())
features = geo['features']
admin0 = builder.fast.fetch_json_retry(builder.map_v2.ADMIN0_URL)
targets = builder.target_admin0_features(admin0, set(plan['targetContinents']))
wanted_mask = builder.target_mask(targets)
coverage = builder.map_v2.repair(unary_union([
    builder.map_v2.repair(shape(f['geometry'])) for f in features
]))
target_area = builder.map_v2.area_sqkm(wanted_mask)
covered_area = builder.map_v2.area_sqkm(builder.map_v2.repair(wanted_mask.intersection(coverage)))
ratio = covered_area / max(1, target_area)
physical = [f for f in features if f.get('properties', {}).get('navigationContinent') and f.get('properties', {}).get('navigationGroup')]
regions_by_zone = {}
for feature in physical:
    group = feature.get('properties', {}).get('sourceGroup')
    regions_by_zone[group] = regions_by_zone.get(group, 0) + 1
report = {
    'baseRegions': len(features) - len(physical),
    'newRegions': len(physical),
    'totalRegions': len(features),
    'targetAreaSqKm': round(target_area, 1),
    'coveredTargetAreaSqKm': round(covered_area, 1),
    'targetCoverageRatio': ratio,
    'regionsByZone': regions_by_zone,
    'deliberatelyDeferred': ['continental North America', 'South America', 'Caribbean'],
    'buildStrategy': 'split geographic batches',
}
(WORLD / 'old-world-pacific-coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, indent=2))
if ratio < 0.985:
    raise RuntimeError(f'Old World / Asia-Pacific target coverage only {ratio:.3%}')
