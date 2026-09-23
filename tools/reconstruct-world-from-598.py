#!/usr/bin/env python3
"""Reconstruct generated Sim-World geography from the known-good 598-region base."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'world'
TMP = Path('/tmp/simworld-reconstruction')
MIN_TARGET_COVERAGE = 0.995


def run(*args, dynamic_base=False):
    print('+', ' '.join(map(str, args)), flush=True)
    env = os.environ.copy()
    if dynamic_base:
        env['SIMWORLD_DYNAMIC_BASE'] = '1'
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True, env=env)


def copy_world(out: Path, names):
    for name in names:
        shutil.copy2(out / name, DATA / name)


def feature_count():
    return len(json.loads((DATA / 'regions.geo.json').read_text())['features'])


def announce(stage):
    print(f'RECONSTRUCTION_STAGE {stage} regions={feature_count()}', flush=True)


def require_target_coverage():
    report_path = DATA / 'old-world-pacific-coverage.json'
    report = json.loads(report_path.read_text())
    ratio = float(report.get('targetCoverageRatio', 0.0))
    print(f'RECONSTRUCTION_TARGET_COVERAGE={ratio:.6f}', flush=True)
    if ratio < MIN_TARGET_COVERAGE:
        raise RuntimeError(
            f'reconstructed target coverage {ratio:.3%} below required {MIN_TARGET_COVERAGE:.1%}'
        )


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    if feature_count() != 598:
        raise SystemExit(f'reconstruction must start from 598 regions, got {feature_count()}')
    announce('baseline')

    # Historical target counts become soft after geometry hardening: splitting
    # disconnected land can legitimately create more regions than the old build.
    out = TMP / 'broad'
    run('python', 'tools/build-map-expansion-v2-final.py', '--output-dir', out)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
    run('python', 'tools/cleanup-region-display-names.py')
    announce('broad')

    out = TMP / 'silk'
    run('python', 'tools/build-silk-road-expansion.py', '--output-dir', out, dynamic_base=True)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
    announce('silk-road')

    out = TMP / 'east-africa'
    run('python', 'tools/build-east-africa-expansion.py', '--output-dir', out, dynamic_base=True)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
    announce('east-africa')

    for batch in ('europe-greenland', 'africa-arabia', 'central-south-asia',
                  'east-southeast-asia', 'maritime-oceania'):
        out = TMP / batch
        run('python', 'tools/build-old-world-map-batch.py', batch, '--output-dir', out)
        copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
        announce(batch)

    # Bounded batch masks intentionally leave narrow seams and outlying pieces.
    # Fill those gaps by assigning each genuine residual source piece to the
    # nearest existing region in the same physical zone. This preserves the
    # intended region count instead of creating a second residual cohort.
    run('python', 'tools/absorb-old-world-map-residual.py')
    announce('residual-absorption')

    # Apply bounded physical-geography corrections that cannot safely be inferred
    # from the admin-0 mask: restore the Crimean Peninsula from ADM1 coastline
    # geometry and absorb the malformed Finnish residual seam into its neighbours.
    run('python', 'tools/repair-crimea-finland-geography.py', '--world-dir', 'data/world')
    announce('crimea-finland-repair')

    run('python', 'tools/finalize-old-world-map-report.py')
    require_target_coverage()

    # Reassign detached mainland scraps before canonicalisation. This preserves
    # every polygon but changes ownership to the physically adjacent region;
    # isolated islands remain with their existing owner.
    run('python', 'tools/repair-region-component-ownership.py',
        '--geo', DATA / 'regions.geo.json', '--meta', DATA / 'regions.meta.json')
    announce('ownership-repair')

    normal = TMP / 'regions.geo.normalized.json'
    run('python', 'tools/normalize-land-geojson.py', '--input', DATA / 'regions.geo.json', '--output', normal)
    run('node', 'tools/repair-d3-region-geometry.mjs', '--input', normal, '--output', DATA / 'regions.geo.json')
    run('python', 'tools/build-region-navigation.py')
    run('python', 'tools/build-terrain.py', '--geo', DATA / 'regions.geo.json', '--resources', DATA / 'resources.initial.json', '--output', DATA / 'terrain.initial.json')

    sea_code = (
        "import importlib.util,pathlib,sys; root=pathlib.Path('.').resolve(); "
        "p=root/'tools'/'build-sea-expansion-v2.py'; "
        "s=importlib.util.spec_from_file_location('sea_rebuild',p); "
        "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
        "m.PLAN=root/'tools'/'sea-region-plan-old-world-pacific.json'; "
        "sys.argv=[str(p),'--land-geo','data/world/regions.geo.json','--output-dir','/tmp/simworld-reconstruction/seas']; m.main()"
    )
    run('python', '-c', sea_code)
    copy_world(TMP / 'seas', ('seaRegions.geo.json', 'seaRegions.meta.json'))
    run('node', 'tools/generate-world-spatial-base.mjs')
    print(f'RECONSTRUCTED_LAND_REGIONS={feature_count()}')


if __name__ == '__main__':
    main()
