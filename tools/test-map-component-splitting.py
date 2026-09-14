#!/usr/bin/env python3
import importlib.util
from pathlib import Path

from shapely.geometry import MultiPolygon, box

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'tools' / 'build-old-world-asia-pacific.py'
spec = importlib.util.spec_from_file_location('old_world_component_test', path)
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)

# Two materially sized disconnected land pieces must cease to be one indivisible
# source unit. A tiny fragment is retained with its nearest material component.
a = box(30.0, 50.0, 30.20, 50.20)
b = box(32.0, 50.0, 32.20, 50.20)
tiny = box(30.21, 50.0, 30.215, 50.005)
raw = MultiPolygon([a, b, tiny])
parts = builder.split_material_components(raw, 8)
assert len(parts) == 2, f'expected two material source pieces, got {len(parts)}'
assert all(builder.map_v2.area_sqkm(p) >= 8 for p in parts)
assert sum(builder.map_v2.area_sqkm(p) for p in parts) >= builder.map_v2.area_sqkm(raw) * 0.999999
assert any(len(getattr(p, 'geoms', [p])) >= 2 for p in parts), 'tiny fragment should be preserved with nearest material land'

# A genuine group of small islands must still be preserved rather than deleted.
small = MultiPolygon([
    box(10.0, 40.0, 10.02, 40.02),
    box(10.2, 40.0, 10.22, 40.02),
    box(10.4, 40.0, 10.42, 40.02),
])
small_parts = builder.split_material_components(small, 8)
assert len(small_parts) == 1, 'all-small island group should remain a coverage-preserving source unit'

batch = (ROOT / 'tools' / 'build-old-world-map-batch.py').read_text()
assert 'builder.split_material_components(geom, 8)' in batch, 'batch builder does not split material disconnected components'
print('Map component splitting regression passed')
