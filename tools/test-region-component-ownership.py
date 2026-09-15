#!/usr/bin/env python3
import importlib.util
from pathlib import Path
from shapely.geometry import MultiPolygon, Polygon

path=Path('tools/repair-region-component-ownership.py');spec=importlib.util.spec_from_file_location('repair_owner',path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

# A genuinely tiny detached mainland scrap may move to a touching stable core.
a_core=Polygon([(0,0),(3,0),(3,3),(0,3),(0,0)])
a_scrap=Polygon([(4,0),(4.1,0),(4.1,0.1),(4,0.1),(4,0)])
b_core=Polygon([(3,0),(4,0),(4,1),(3,1),(3,0)])
geoms=[MultiPolygon([a_core,a_scrap]),b_core]
fixed,moved=mod.assign_atoms(geoms,['a','b']);assert moved==1,moved;assert len(mod.parts_by_area(fixed[0]))==1;assert mod.conservation_fraction(geoms,fixed)<1e-12
fixed2,moved2=mod.assign_atoms(fixed,['a','b']);assert moved2==0,moved2

# A substantial detached component must never be donated merely because another
# region's core touches it. This is the regression that prevents the old
# Kaliningrad region from swallowing large parts of Germany during reconstruction.
large_scrap=Polygon([(4,0),(6,0),(6,2),(4,2),(4,0)])
geoms=[MultiPolygon([a_core,large_scrap]),b_core]
fixed,moved=mod.assign_atoms(geoms,['a','b']);assert moved==0,moved;assert len(mod.parts_by_area(fixed[0]))==2;assert mod.assign_atoms.last_protected_count>=1;assert mod.conservation_fraction(geoms,fixed)<1e-12

# An isolated island stays with its owner.
island=Polygon([(10,10),(10.1,10),(10.1,10.1),(10,10.1),(10,10)])
geoms=[MultiPolygon([a_core,island]),b_core]
fixed,moved=mod.assign_atoms(geoms,['a','b']);assert moved==0,moved;assert len(mod.parts_by_area(fixed[0]))==2

# Detached pieces may not hop via another detached piece; only a stable core can claim them.
a_far=Polygon([(7,0),(7.1,0),(7.1,0.1),(7,0.1),(7,0)])
b_far=Polygon([(6.9,0),(7,0),(7,0.1),(6.9,0.1),(6.9,0)])
geoms=[MultiPolygon([a_core,a_far]),MultiPolygon([b_core,b_far])]
fixed,moved=mod.assign_atoms(geoms,['a','b']);assert moved==0,moved;assert len(mod.parts_by_area(fixed[0]))==2;assert len(mod.parts_by_area(fixed[1]))==2
print('region component ownership tests passed')
