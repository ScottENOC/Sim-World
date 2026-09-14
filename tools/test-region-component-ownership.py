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
fixed, moved = mod.assign_atoms(geoms, ['a','b'])
assert moved == 1, moved
assert len(mod.parts_by_area(fixed[0])) == 1
assert len(mod.parts_by_area(fixed[1])) == 1
assert mod.conservation_fraction(geoms, fixed) < 1e-12

# Running the repair again must be stable: no oscillation or second-pass moves.
fixed_again, moved_again = mod.assign_atoms(fixed, ['a','b'])
assert moved_again == 0, moved_again
assert mod.conservation_fraction(fixed, fixed_again) < 1e-12

# An isolated island with no adjacent mainland core remains with its owner.
island = Polygon([(10,10),(10.1,10),(10.1,10.1),(10,10.1),(10,10)])
geoms = [MultiPolygon([a_core, island]), b_core]
fixed, moved = mod.assign_atoms(geoms, ['a','b'])
assert moved == 0, moved
assert len(mod.parts_by_area(fixed[0])) == 2
assert mod.conservation_fraction(geoms, fixed) < 1e-12

# A detached piece that merely touches another detached piece must not hop owners;
# only another region's stable core is allowed to claim it.
a_far = Polygon([(4,0),(5,0),(5,1),(4,1),(4,0)])
b_far = Polygon([(3,0),(4,0),(4,1),(3,1),(3,0)])
geoms = [MultiPolygon([a_core, a_far]), MultiPolygon([b_core, b_far])]
fixed, moved = mod.assign_atoms(geoms, ['a','b'])
assert moved == 0, moved
assert len(mod.parts_by_area(fixed[0])) == 2
assert len(mod.parts_by_area(fixed[1])) == 2
assert mod.conservation_fraction(geoms, fixed) < 1e-12

print('region component ownership tests passed')
