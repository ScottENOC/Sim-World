#!/usr/bin/env python3
"""Build the Central Asian Silk Road and China tranche on top of the live map."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FINAL_PATH = ROOT / 'tools' / 'build-map-expansion-v2-final.py'
spec = importlib.util.spec_from_file_location('map_final', FINAL_PATH)
final = importlib.util.module_from_spec(spec)
spec.loader.exec_module(final)
map_v2 = final.map_v2

CHEMICAL_CLASSES = {
    'minor': 400_000,
    'moderate': 1_800_000,
    'major': 7_000_000,
    'very_major': 24_000_000,
}
_original_make_deposit = map_v2.make_deposit


def make_deposit(resource, magnitude):
    if resource in {'saltpetre', 'sulfur'}:
        stock = CHEMICAL_CLASSES[magnitude]
        label = 'Saltpetre beds & cave deposits' if resource == 'saltpetre' else 'Sulfur deposits'
        return {'tiers': [{
            'id': 'surface',
            'label': label,
            'initialStock': stock,
            'difficulty': 0.34 if resource == 'saltpetre' else 0.42,
            'requiredTechId': None,
            'maxWorkers': max(20, round(stock / 45000)),
        }]}
    return _original_make_deposit(resource, magnitude)


def resource_endowment(region, plan):
    profile = plan['defaultsByISO'].get(region['sourceGroup'])
    if profile is None:
        raise RuntimeError(f"No resource default for {region['sourceGroup']}:{region['name']}")
    return {
        'landQuality': profile['landQuality'],
        'forestFraction': profile['forestFraction'],
        'forestStartCoverage': profile['forestStartCoverage'],
        'deposits': {k: make_deposit(k, v) for k, v in profile.get('deposits', {}).items()},
        'specialResources': dict(profile.get('specialResources', {})),
    }


map_v2.make_deposit = make_deposit
map_v2.resource_endowment = resource_endowment

if __name__ == '__main__':
    final.main()
