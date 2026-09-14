#!/usr/bin/env python3
import importlib.util
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon

path = Path('tools/repair-region-component-ownership.py')
spec = importlib.util.spec_from_file_location('repair_owner', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# A owns a core and a remote mainland scrap. B's core touches that scrap.
a_core = Polygon([(0,0),(1,0),(1,1),(0,1),(0,0)])
a_scrap = Polygon([(2,0),(3,0),(3,1),(2,1),(2,0)])
b_core = Polygon([(1,0),(2,0),(2,1),(1,1),(1,0)])
geoms = [MultiPolygon([a_core, a_scrap]), b_core]
fixed, moved = mod.transfer_pass(geoms, ['a','b'])
assert moved == 1, moved
assert len(mod.parts_by_area(fixed[0])) == 1
assert len(mod.parts_by_area(fixed[1])) == 1
assert abs(mod.total_area(fixed) - mod.total_area(geoms)) / mod.total_area(geoms) < 1e-12

# An isolated island with no adjacent land remains with its original owner.
island = Polygon([(10,10),(10.1,10),(10.1,10.1),(10,10.1),(10,10)])
geoms = [MultiPolygon([a_core, island]), b_core]
fixed, moved = mod.transfer_pass(geoms, ['a','b'])
assert moved == 0, moved
assert len(mod.parts_by_area(fixed[0])) == 2

print('region component ownership tests passed')
