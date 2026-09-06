#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / 'tools' / 'map-source-inventory.json'
PLAN = ROOT / 'tools' / 'map-region-plan.json'


def fail(message, errors):
    errors.append(message)
    print('ERROR: ' + message, file=sys.stderr)


def main():
    inventory = json.loads(INVENTORY.read_text())
    plan = json.loads(PLAN.read_text())
    by_iso = {c['iso']: c for c in inventory['countries']}
    errors = []
    new_region_count = 0

    for country in plan['countries']:
        iso = country['iso']
        source = by_iso.get(iso)
        if not source:
            fail(f'{iso}: missing from source inventory', errors)
            continue
        source_units = source.get('units') or []
        source_set = set(source_units)
        if len(source_units) != len(source_set):
            duplicates = sorted({u for u in source_units if source_units.count(u) > 1})
            if country.get('requireAllSourceUnits', True):
                fail(f'{iso}: duplicate source-unit names: {duplicates}', errors)
            else:
                print(f'WARN {iso}: source contains duplicate names {duplicates}; partial plan allowed')

        mode = country['mode']
        if mode == 'one-per-source':
            new_region_count += len(source_units)
            rename = country.get('rename') or {}
            missing_renames = sorted(set(rename) - source_set)
            if missing_renames:
                fail(f'{iso}: rename keys not found in source: {missing_renames}', errors)
            print(f'{iso}: {len(source_units)} one-per-source regions')
            continue

        if mode != 'merge':
            fail(f'{iso}: unknown mode {mode!r}', errors)
            continue

        seen = []
        names = set()
        for region in country.get('regions', []):
            name = region['name']
            if name in names:
                fail(f'{iso}: duplicate game-region name {name!r}', errors)
            names.add(name)
            units = region.get('units') or []
            if not units:
                fail(f'{iso}/{name}: no source units', errors)
            unknown = sorted(set(units) - source_set)
            if unknown:
                fail(f'{iso}/{name}: unknown source units {unknown}', errors)
            seen.extend(units)

        duplicates = sorted({u for u in seen if seen.count(u) > 1})
        if duplicates:
            fail(f'{iso}: source units assigned to multiple game regions: {duplicates}', errors)

        used = set(seen)
        if country.get('requireAllSourceUnits', True):
            omitted = sorted(source_set - used)
            if omitted:
                fail(f'{iso}: unassigned source units {omitted}', errors)

        new_region_count += len(country.get('regions', []))
        print(f'{iso}: {len(country.get("regions", []))} game regions from {len(used)}/{len(source_set)} source units')

    existing = int(plan.get('targetExistingRegionCount', 0))
    print(f'NEW_GAME_REGIONS={new_region_count}')
    print(f'EXPECTED_TOTAL_LAND_REGIONS={existing + new_region_count}')
    if errors:
        print(f'Validation failed with {len(errors)} error(s)', file=sys.stderr)
        sys.exit(1)
    print('Map region plan valid')


if __name__ == '__main__':
    main()
