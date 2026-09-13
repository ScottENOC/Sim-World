#!/usr/bin/env python3
"""Keep narrow/strategic seas ahead of broad Pacific basins.

The additive sea builder gives earlier planned regions priority. Hawaii must be
created before Central/North Pacific boxes, otherwise those broad basins consume
all Hawaiian water and the strategic Hawaii region disappears.
"""
import json
from pathlib import Path

path = Path('tools/sea-region-plan-old-world-pacific.json')
doc = json.loads(path.read_text())
regions = doc.get('regions', [])

hawaii = next((r for r in regions if r.get('id') == 'sea_hawaii'), None)
if hawaii is None:
    raise RuntimeError('sea_hawaii missing from Pacific sea plan')

regions = [r for r in regions if r.get('id') != 'sea_hawaii']
insert_at = next((i for i, r in enumerate(regions)
                  if r.get('id') in {'sea_west_pacific_tropical', 'sea_central_pacific_w',
                                     'sea_central_pacific_e', 'sea_north_pacific_w',
                                     'sea_north_pacific_e'}), len(regions))
regions.insert(insert_at, hawaii)
doc['regions'] = regions
path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(f'Hawaii sea ordered before broad Pacific basins at index {insert_at}')
