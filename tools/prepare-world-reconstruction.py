#!/usr/bin/env python3
"""Strip the generated Old World/Asia-Pacific layer before a clean rebuild.

The broad expansion deliberately tagged generated physical regions with
sourceGroup/navigationContinent/navigationGroup. Keep the older base map and
remove exactly that generated layer from geometry, metadata and endowments so
it can be reconstructed from source geography with the corrected builder.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'data' / 'world'
GEO = WORLD / 'regions.geo.json'
META = WORLD / 'regions.meta.json'
RESOURCES = WORLD / 'resources.initial.json'
COVERAGE = WORLD / 'old-world-pacific-coverage.json'
SEAS_COMPLETE = WORLD / 'old-world-pacific-seas.complete'


def generated_feature(feature):
    props = feature.get('properties') or {}
    return bool(props.get('sourceGroup') and props.get('navigationContinent') and props.get('navigationGroup'))


def main():
    geo = json.loads(GEO.read_text())
    meta = json.loads(META.read_text())
    resources = json.loads(RESOURCES.read_text())

    original_features = list(geo.get('features', []))
    generated = [f for f in original_features if generated_feature(f)]
    generated_ids = {str((f.get('properties') or {}).get('id') or f.get('id') or '') for f in generated}
    generated_ids.discard('')
    kept = [f for f in original_features if f not in generated]

    if len(original_features) != 1574:
        raise RuntimeError(f'Expected 1574 canonical land regions before reconstruction, found {len(original_features)}')
    if len(generated) != 776:
        raise RuntimeError(f'Expected 776 tagged generated regions, found {len(generated)}')
    if len(kept) != 798:
        raise RuntimeError(f'Expected 798 base regions after stripping generated layer, found {len(kept)}')
    if len(generated_ids) != len(generated):
        raise RuntimeError('Generated region IDs are missing or duplicated')

    geo['features'] = kept

    meta_regions = list(meta.get('regions', []))
    meta['regions'] = [r for r in meta_regions if str(r.get('id') or '') not in generated_ids]
    if len(meta['regions']) != 798:
        raise RuntimeError(f'Expected 798 metadata regions after stripping generated layer, found {len(meta["regions"])}')

    # The preserved base regions were adjacent to the generated layer. Remove
    # those now-invalid IDs before the reconstructed adjacency is calculated.
    stale_neighbor_refs = 0
    for region in meta['regions']:
        old = list(region.get('neighbors') or [])
        new = [neighbor for neighbor in old if str(neighbor) not in generated_ids]
        stale_neighbor_refs += len(old) - len(new)
        region['neighbors'] = new

    if not isinstance(resources, dict):
        raise RuntimeError('resources.initial.json must be an object keyed by region ID')
    for region_id in generated_ids:
        resources.pop(region_id, None)

    GEO.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    META.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    RESOURCES.write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))

    # Force the aggregate report and sea layer to be rebuilt from the new land.
    if COVERAGE.exists():
        COVERAGE.unlink()
    if SEAS_COMPLETE.exists():
        SEAS_COMPLETE.unlink()

    print(f'ORIGINAL_REGIONS={len(original_features)}')
    print(f'REMOVED_GENERATED_REGIONS={len(generated)}')
    print(f'PRESERVED_BASE_REGIONS={len(kept)}')
    print(f'PRESERVED_META_REGIONS={len(meta["regions"])}')
    print(f'PRESERVED_RESOURCE_REGIONS={len(resources)}')
    print(f'SCRUBBED_STALE_NEIGHBOR_REFS={stale_neighbor_refs}')


if __name__ == '__main__':
    main()
