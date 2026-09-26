#!/usr/bin/env python3
"""Fail on substantive world-spatial generator drift.

The spatial pipeline may remove numerically degenerate polygon holes whose area is
far below meaningful map precision. Treat that as semantically reproducible while
continuing to require every other generated file to be byte-for-byte clean.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
LAND_PATH = 'data/world/regions.geo.json'
MAX_SYMMETRIC_DIFFERENCE_DEG2 = 1e-12


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True)


def load_baseline():
    return json.loads(git('show', f'HEAD:{LAND_PATH}'))


def feature_id(feature):
    props = feature.get('properties') or {}
    return props.get('id') or feature.get('id')


def main():
    changed = [line.strip() for line in git('diff', '--name-only').splitlines() if line.strip()]
    unexpected = [path for path in changed if path != LAND_PATH]
    if unexpected:
        raise SystemExit('generated files are not reproducible: ' + ', '.join(unexpected))
    if LAND_PATH not in changed:
        print('WORLD_SPATIAL_REPRODUCIBILITY=byte_exact')
        return

    baseline = load_baseline()
    current = json.loads((ROOT / LAND_PATH).read_text())
    before = {feature_id(feature): feature for feature in baseline.get('features', [])}
    after = {feature_id(feature): feature for feature in current.get('features', [])}
    if before.keys() != after.keys():
        raise SystemExit('land feature set changed during spatial regeneration')

    total_difference = 0.0
    changed_features = []
    for rid, old_feature in before.items():
        new_feature = after[rid]
        if (old_feature.get('properties') or {}) != (new_feature.get('properties') or {}):
            raise SystemExit(f'land properties changed during spatial regeneration: {rid}')
        old_geom = shape(old_feature.get('geometry'))
        new_geom = shape(new_feature.get('geometry'))
        if old_geom.geom_type != new_geom.geom_type:
            raise SystemExit(f'land geometry type changed during spatial regeneration: {rid}')
        difference = old_geom.symmetric_difference(new_geom).area
        total_difference += difference
        if difference > 0:
            changed_features.append((rid, difference))
        if difference > MAX_SYMMETRIC_DIFFERENCE_DEG2:
            raise SystemExit(
                f'substantive land geometry drift for {rid}: '
                f'{difference:.12e} deg^2 > {MAX_SYMMETRIC_DIFFERENCE_DEG2:.1e}'
            )

    print(f'WORLD_SPATIAL_REPRODUCIBILITY=semantic_equivalent')
    print(f'CHANGED_FEATURES={len(changed_features)}')
    print(f'TOTAL_SYMMETRIC_DIFFERENCE_DEG2={total_difference:.12e}')
    for rid, difference in changed_features:
        print(f'NUMERICAL_CLEANUP={rid}:{difference:.12e}')


if __name__ == '__main__':
    main()
