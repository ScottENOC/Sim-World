#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

# Keep generated cluster labels useful when seen outside the country picker.
cleanup=ROOT/'tools'/'cleanup-region-display-names.py'
s=cleanup.read_text()
anchor="""RENAMES = {\n    'r2_98742764342': ('Northeastern Region', 'Northeast Iceland'),\n"""
assert anchor in s
s=s.replace(anchor,"""GROUP_RENAMES = {\n    ('DEU', 'Brandenburg hinterland'): 'Brandenburg',\n    ('DEU', 'Rheinland-Pfalz hinterland'): 'Rhineland-Palatinate',\n    ('DEU', 'Schleswig-Holstein hinterland'): 'Schleswig-Holstein',\n    ('NLD', 'Friesland hinterland'): 'Friesland',\n    ('NLD', 'Gelderland hinterland'): 'Gelderland',\n    ('NLD', 'Noord-Brabant hinterland'): 'North Brabant',\n    ('NLD', 'Overijssel hinterland'): 'Overijssel',\n    ('BEL', 'Hainaut hinterland'): 'Hainaut',\n    ('BEL', 'Luxembourg hinterland'): 'Belgian Luxembourg',\n    ('BEL', 'Namur hinterland'): 'Namur',\n}\n\nRENAMES = {\n    'r2_98742764342': ('Northeastern Region', 'Northeast Iceland'),\n""",1)
anchor="""    geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))\n    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))\n"""
assert anchor in s
s=s.replace(anchor,"""    for region_id, feature in geo_by_id.items():\n        entry = meta_by_id.get(region_id)\n        if entry is None:\n            continue\n        group = feature.get('properties', {}).get('sourceGroup')\n        old_name = feature.get('properties', {}).get('name')\n        new_name = GROUP_RENAMES.get((group, old_name))\n        if new_name:\n            feature['properties']['name'] = new_name\n            entry['name'] = new_name\n            changed += 1\n            print(f'GROUP_REGION_RENAME {group}: {old_name} -> {new_name} id={region_id}')\n\n    geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))\n    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))\n""",1)
cleanup.write_text(s)

# Make the permanent broad-map job understand the new baseline and keep derived
# terrain/spatial data in sync on future geography expansions.
wf=ROOT/'.github/workflows/build-broad-map-expansion.yml'
w=wf.read_text()
w=w.replace("branches: [broad-europe-middle-east-expansion, cleanup-alpine-swiss-geography, cleanup-map-slivers-v1, fix-north-atlantic-seas-region-names]",
            "branches: [broad-europe-middle-east-expansion, cleanup-alpine-swiss-geography, cleanup-map-slivers-v1, fix-north-atlantic-seas-region-names, expand-germany-low-countries-fix-pinch]")
w=w.replace("python -m pip install --disable-pip-version-check shapely==2.1.1 pyproj==3.7.2",
            "python -m pip install --disable-pip-version-check shapely==2.1.1 pyproj==3.7.2 pyshp==2.3.1")
w=w.replace("          cp /tmp/simworld-v2-sea/seaRegions.meta.json data/world/seaRegions.meta.json\n      - name: Sanity check generated world",
            "          cp /tmp/simworld-v2-sea/seaRegions.meta.json data/world/seaRegions.meta.json\n      - name: Refresh terrain and immutable spatial geography\n        run: |\n          python tools/build-terrain.py\n          node tools/generate-world-spatial-base.mjs\n      - name: Sanity check generated world")
w=w.replace("assert len(ids)==626, f'expected polished 626-region map, got {len(ids)}'",
            "assert len(ids)==646, f'expected polished 646-region map, got {len(ids)}'")
w=w.replace("          assert idset==set(mids)==set(res), 'land/meta/resource ids differ'",
            "          assert idset==set(mids)==set(res), 'land/meta/resource ids differ'\n          source_counts={iso:sum(1 for f in geo['features'] if f.get('properties',{}).get('sourceGroup')==iso) for iso in ('DEU','NLD','BEL','LUX')}\n          assert source_counts=={'DEU':12,'NLD':4,'BEL':3,'LUX':1}, f'unexpected Western Europe counts {source_counts}'")
w=w.replace("data/world/regions.geo.json data/world/regions.meta.json data/world/resources.initial.json data/world/seaRegions.geo.json data/world/seaRegions.meta.json",
            "data/world/regions.geo.json data/world/regions.meta.json data/world/resources.initial.json data/world/seaRegions.geo.json data/world/seaRegions.meta.json data/world/terrain.initial.json data/world/spatial.base.json")
wf.write_text(w)
print('Prepared durable Western Europe display names and future map-build baseline')
