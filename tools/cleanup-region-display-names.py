#!/usr/bin/env python3
"""Replace source-admin labels that are too generic to work as gameplay place names.

Stable region IDs and geometry are unchanged. This only changes display names in
both the generated geometry properties and metadata so a region name remains
meaningful when shown without its modern-country picker context.
"""
import argparse
import json
from pathlib import Path

RENAMES = {
    'r2_98742764342': ('Northeastern Region', 'Northeast Iceland'),
    'r2_cf0af96f157': ('Northwestern Region hinterland', 'Northwest Iceland'),
    'r2_2a07fc0aced': ('Eastern Region', 'East Iceland'),
    'r2_bc0184dac1b': ('Southern Region', 'South Iceland'),
    'r2_0e02a37ad4f': ('Eastern Region', 'Eastern Arabia'),
    'r2_08ca63d0d59': ('Northern Borders Region', 'Northern Arabia'),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geo', default='data/world/regions.geo.json')
    parser.add_argument('--meta', default='data/world/regions.meta.json')
    args = parser.parse_args()

    geo_path = Path(args.geo)
    meta_path = Path(args.meta)
    geo = json.loads(geo_path.read_text())
    meta = json.loads(meta_path.read_text())

    geo_by_id = {f.get('properties', {}).get('id'): f for f in geo.get('features', [])}
    meta_by_id = {m.get('id'): m for m in meta.get('regions', [])}

    changed = 0
    for region_id, (expected_old, new_name) in RENAMES.items():
        feature = geo_by_id.get(region_id)
        entry = meta_by_id.get(region_id)
        if feature is None or entry is None:
            raise RuntimeError(f'Missing region {region_id} while applying display-name cleanup')
        geo_old = feature['properties'].get('name')
        meta_old = entry.get('name')
        if geo_old not in (expected_old, new_name) or meta_old not in (expected_old, new_name):
            raise RuntimeError(
                f'Unexpected existing name for {region_id}: geo={geo_old!r} meta={meta_old!r}; '
                f'expected {expected_old!r}'
            )
        if geo_old != new_name or meta_old != new_name:
            feature['properties']['name'] = new_name
            entry['name'] = new_name
            changed += 1
            print(f'REGION_RENAME {expected_old} -> {new_name} id={region_id}')

    geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    print(f'REGION_RENAMES_CHANGED={changed}')


if __name__ == '__main__':
    main()
