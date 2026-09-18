from pathlib import Path

configs = {
    '.github/workflows/build-latin-america-map-v2.yml': [
        '.github/workflows/build-latin-america-map-v2.yml',
        'tools/prepare-latin-america-regeneration.py',
        'tools/build-latin-america-expansion.py',
        'tools/latin-america-region-plan-v1.json',
        'tools/build-latin-america-seas.py',
        'tools/latin-america-sea-plan-v1.json',
        'tools/repair-latin-america-adjacency.py',
        'tools/normalize-land-geojson.py',
        'tools/build-region-navigation.py',
        'tools/build-terrain.py',
        'tools/generate-world-spatial-base.mjs',
        'data/world/regions.geo.json',
        'data/world/regions.meta.json',
        'data/world/resources.initial.json',
        'data/world/seaRegions.geo.json',
        'data/world/seaRegions.meta.json',
    ],
    '.github/workflows/repair-known-world-land.yml': [
        '.github/workflows/repair-known-world-land.yml',
        'tools/repair-known-world-land-corruption.py',
        'tools/clean-sermersooq-foreign-components.py',
        'tools/clean-central-europe-detached-components.py',
        'tools/rebuild-land-adjacency.py',
        'tools/build-sea-expansion-v2.py',
        'tools/build-region-navigation.py',
        'tools/build-terrain.py',
        'tools/generate-world-spatial-base.mjs',
        'data/world/regions.geo.json',
        'data/world/regions.meta.json',
        'data/world/resources.initial.json',
        'data/world/seaRegions.geo.json',
        'data/world/seaRegions.meta.json',
    ],
    '.github/workflows/reconstruct-world-geography.yml': [
        '.github/workflows/reconstruct-world-geography.yml',
        'tools/reconstruct-world-from-598.py',
        'tools/absorb-old-world-map-residual.py',
        'tools/repair-region-component-ownership.py',
        'tools/apply-map-component-splitting.py',
        'tools/apply-broad-map-component-splitting.py',
        'tools/apply-reconstruction-dynamic-baselines.py',
        'tools/build-map-expansion-v2-fast.py',
        'tools/build-silk-road-expansion.py',
        'tools/build-east-africa-expansion.py',
        'tools/build-old-world-asia-pacific.py',
        'tools/build-old-world-map-batch.py',
        'data/world/**',
    ],
    '.github/workflows/old-world-asia-pacific-map.yml': [
        '.github/workflows/old-world-asia-pacific-map.yml',
        'tools/build-old-world-asia-pacific.py',
        'tools/build-old-world-map-batch.py',
        'tools/build-old-world-map-residual.py',
        'tools/finalize-old-world-map-report.py',
        'tools/apply-old-world-map-source-filter.py',
        'tools/apply-old-world-asia-pacific-runtime.py',
        'tools/sea-region-plan-old-world-pacific.json',
        'tools/normalize-land-geojson.py',
        'tools/build-region-navigation.py',
        'data/world/**',
    ],
}

for filename, paths in configs.items():
    p = Path(filename)
    text = p.read_text()
    marker = '  pull_request:\n    branches:'
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f'pull_request trigger not found in {filename}')
    dispatch = text.find('  workflow_dispatch:', start)
    if dispatch < 0:
        raise RuntimeError(f'workflow_dispatch not found in {filename}')
    block = '  pull_request:\n    branches: [main]\n    paths:\n' + ''.join(f"      - '{path}'\n" for path in paths)
    text = text[:start] + block + text[dispatch:]
    p.write_text(text)
    print('SCOPED', filename)

# trigger 2
