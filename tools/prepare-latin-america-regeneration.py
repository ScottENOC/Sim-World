#!/usr/bin/env python3
"""Remove prior Latin America v1 generated output before regenerating it."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data/world/regions.geo.json'
META_PATH = ROOT / 'data/world/regions.meta.json'
RES_PATH = ROOT / 'data/world/resources.initial.json'
SEA_GEO_PATH = ROOT / 'data/world/seaRegions.geo.json'
SEA_META_PATH = ROOT / 'data/world/seaRegions.meta.json'
SEA_PLAN_PATH = ROOT / 'tools/latin-america-sea-plan-v1.json'
SOURCE_GROUP = 'latin_america_caribbean_v1'


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def main():
    geo = json.loads(GEO_PATH.read_text())
    meta = json.loads(META_PATH.read_text())
    resources = json.loads(RES_PATH.read_text())

    removed_land = {
        f.get('properties', {}).get('id')
        for f in geo.get('features', [])
        if f.get('properties', {}).get('sourceGroup') == SOURCE_GROUP
    }
    removed_land.discard(None)
    if removed_land:
        geo['features'] = [f for f in geo.get('features', []) if f.get('properties', {}).get('id') not in removed_land]
        meta['regions'] = [m for m in meta.get('regions', []) if m.get('id') not in removed_land]
        for m in meta.get('regions', []):
            m['neighbors'] = [rid for rid in m.get('neighbors', []) if rid not in removed_land]
        for rid in removed_land:
            resources.pop(rid, None)

    sea_plan = json.loads(SEA_PLAN_PATH.read_text())
    owned_seas = {spec['id'] for spec in sea_plan.get('regions', [])}
    sea_geo = json.loads(SEA_GEO_PATH.read_text())
    sea_meta = json.loads(SEA_META_PATH.read_text())
    present_seas = {
        f.get('properties', {}).get('id')
        for f in sea_geo.get('features', [])
        if f.get('properties', {}).get('id') in owned_seas
    }
    sea_geo['features'] = [f for f in sea_geo.get('features', []) if f.get('properties', {}).get('id') not in owned_seas]
    sea_meta['seaRegions'] = [m for m in sea_meta.get('seaRegions', []) if m.get('id') not in owned_seas]
    for m in sea_meta.get('seaRegions', []):
        m['adjacentLand'] = [rid for rid in m.get('adjacentLand', []) if rid not in removed_land]

    write_json(GEO_PATH, geo)
    write_json(META_PATH, meta)
    write_json(RES_PATH, resources)
    write_json(SEA_GEO_PATH, sea_geo)
    write_json(SEA_META_PATH, sea_meta)
    print(f'RESET_LATIN_AMERICA_LAND={len(removed_land)}')
    print(f'RESET_LATIN_AMERICA_SEAS={len(present_seas)}')


if __name__ == '__main__':
    main()
