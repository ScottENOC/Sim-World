#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
world = root / 'data' / 'world'
geo = json.loads((world / 'regions.geo.json').read_text())
meta = json.loads((world / 'regions.meta.json').read_text())
resources = json.loads((world / 'resources.initial.json').read_text())
terrain = json.loads((world / 'terrain.initial.json').read_text())
sea_geo = json.loads((world / 'seaRegions.geo.json').read_text())
sea_meta = json.loads((world / 'seaRegions.meta.json').read_text())
report = json.loads((world / 'old-world-pacific-coverage.json').read_text())

features = geo['features']
ids = [f['properties']['id'] for f in features]
assert len(ids) == len(set(ids)), 'duplicate land region IDs'
assert len(features) >= 1200, f'expected a substantially expanded map, got {len(features)} regions'
assert report['targetCoverageRatio'] >= 0.985, report
assert report['totalRegions'] == len(features)
assert report['newRegions'] >= 350, report

meta_by_id = {m['id']: m for m in meta['regions']}
assert set(ids) == set(meta_by_id), 'land metadata does not match geometry IDs'
assert set(ids) <= set(resources), 'missing resource endowments'
assert set(ids) <= set(terrain), 'missing terrain entries'
for region_id, entry in meta_by_id.items():
    for neighbor in entry.get('neighbors', []):
        assert neighbor in meta_by_id, f'{region_id} references unknown neighbor {neighbor}'

physical = [f for f in features if f.get('properties', {}).get('navigationContinent') and f.get('properties', {}).get('navigationGroup')]
groups = {f['properties']['sourceGroup'] for f in physical}
required = {
    'af_congo_west','af_highveld','ar_najd','ca_kazakh_steppe','na_lena_yakutia',
    'sa_indus','sa_deccan_south','se_mekong','ea_japan_honshu','mi_borneo',
    'mi_new_guinea','au_murray_darling','nz_south','pac_hawaii','ow_greenland'
}
missing = required - groups
assert not missing, f'missing representative physical zones: {sorted(missing)}'
assert len(physical) == report['newRegions'], 'new geography tags do not match generated region count'

sea_ids = [f['properties']['id'] for f in sea_geo['features']]
assert len(sea_ids) == len(set(sea_ids)), 'duplicate sea region IDs'
assert len(sea_ids) >= 85, f'expected expanded sea map, got {len(sea_ids)}'
sea_meta_by_id = {m['id']: m for m in sea_meta['seaRegions']}
assert set(sea_ids) == set(sea_meta_by_id), 'sea metadata does not match geometry IDs'
for required_sea in ['sea_malacca_strait','sea_torres_strait','sea_mozambique_channel','sea_bay_bengal','sea_japan','sea_coral','sea_hawaii','sea_greenland']:
    assert required_sea in sea_meta_by_id, f'missing strategic sea {required_sea}'

print(json.dumps({
    'landRegions': len(features),
    'newLandRegions': report['newRegions'],
    'targetCoverageRatio': round(report['targetCoverageRatio'], 6),
    'seaRegions': len(sea_ids),
    'physicalZoneCount': len(groups),
}, indent=2))
