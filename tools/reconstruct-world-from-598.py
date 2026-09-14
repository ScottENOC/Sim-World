#!/usr/bin/env python3
"""Reconstruct generated Sim-World geography from the known-good 598-region base."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'world'
TMP = Path('/tmp/simworld-reconstruction')


def run(*args):
    print('+', ' '.join(map(str, args)), flush=True)
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True)


def copy_world(out: Path, names):
    for name in names:
        shutil.copy2(out / name, DATA / name)


def feature_count():
    return len(json.loads((DATA / 'regions.geo.json').read_text())['features'])


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    if feature_count() != 598:
        raise SystemExit(f'reconstruction must start from 598 regions, got {feature_count()}')

    out = TMP / 'broad'
    run('python', 'tools/build-map-expansion-v2-final.py', '--output-dir', out)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
    run('python', 'tools/cleanup-region-display-names.py')
    if feature_count() != 626:
        raise SystemExit(f'expected 626 regions after broad expansion, got {feature_count()}')

    out = TMP / 'silk'
    run('python', 'tools/build-silk-road-expansion.py', '--output-dir', out)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))
    if feature_count() != 720:
        raise SystemExit(f'expected 720 regions after Silk Road expansion, got {feature_count()}')

    out = TMP / 'east-africa'
    run('python', 'tools/build-east-africa-expansion.py', '--output-dir', out)
    copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))

    for batch in ('europe-greenland', 'africa-arabia', 'central-south-asia',
                  'east-southeast-asia', 'maritime-oceania'):
        out = TMP / batch
        run('python', 'tools/build-old-world-map-batch.py', batch, '--output-dir', out)
        copy_world(out, ('regions.geo.json', 'regions.meta.json', 'resources.initial.json'))

    run('python', 'tools/build-old-world-map-residual.py')
    run('python', 'tools/finalize-old-world-map-report.py')

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
