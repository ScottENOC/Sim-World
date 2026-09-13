#!/usr/bin/env python3
"""Run one geography-first Old World / Asia-Pacific land batch.

This wraps build-old-world-asia-pacific.py without changing its region-generation
rules. Each batch gets only the physical zones that belong to it, and source
country geometry is clipped to those zone envelopes before clustering. The
result is still additive against the current live map.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

from shapely.geometry import box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / 'tools' / 'build-old-world-asia-pacific.py'
FULL_PLAN = ROOT / 'tools' / 'map-region-plan-old-world-pacific.json'

BATCH_PREFIXES = {
    'europe-greenland': ('ow_',),
    'africa-arabia': ('af_', 'ar_'),
    'central-south-asia': ('ca_', 'na_', 'sa_'),
    'east-southeast-asia': ('ea_', 'se_'),
    'maritime-oceania': ('mi_', 'au_', 'nz_', 'pac_'),
}


def load_builder():
    spec = importlib.util.spec_from_file_location('old_world_builder_batch', BUILDER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bbox_geometry(spec):
    minx, miny, maxx, maxy = spec['bbox']
    if minx <= maxx:
        return box(minx, miny, maxx, maxy)
    # Dateline-spanning zone.
    return unary_union([box(minx, miny, 180, maxy), box(-180, miny, maxx, maxy)])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('batch', choices=tuple(BATCH_PREFIXES))
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()

    plan = json.loads(FULL_PLAN.read_text())
    prefixes = BATCH_PREFIXES[args.batch]
    zones = [z for z in plan['zones'] if z['id'].startswith(prefixes)]
    if not zones:
        raise RuntimeError(f'No zones selected for {args.batch}')

    runtime_plan = dict(plan)
    runtime_plan['zones'] = zones
    runtime_plan_path = Path(f'/tmp/simworld-{args.batch}-plan.json')
    runtime_plan_path.write_text(json.dumps(runtime_plan, ensure_ascii=False, indent=2) + '\n')

    builder = load_builder()
    builder.PLAN = runtime_plan_path

    # Only the Pacific/Oceania batch should inject the explicit Hawaii source.
    if args.batch != 'maritime-oceania':
        builder.PACIFIC_EXTRAS = []

    batch_mask = builder.map_v2.repair(unary_union([bbox_geometry(z) for z in zones]))
    original_targets = builder.target_admin0_features

    def batch_targets(admin0, target_continents):
        selected = []
        for feature, geom in original_targets(admin0, target_continents):
            clipped = builder.map_v2.repair(geom.intersection(batch_mask))
            if clipped.is_empty or builder.map_v2.area_sqkm(clipped) < 8:
                continue
            selected.append((feature, clipped))
        return selected

    builder.target_admin0_features = batch_targets

    # The original builder parses argv itself.
    sys.argv = [str(BUILDER_PATH), '--output-dir', args.output_dir]
    print(f'BATCH={args.batch}')
    print('BATCH_ZONES=' + ','.join(z['id'] for z in zones))
    builder.main()


if __name__ == '__main__':
    main()
