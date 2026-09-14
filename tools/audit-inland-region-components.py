#!/usr/bin/env python3
"""Rank disconnected geometry problems in regions that are not sea-adjacent."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('geometry_audit', ROOT / 'tools' / 'audit-region-geometry.py')
audit = importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)

geo = json.loads((ROOT / 'data/world/regions.geo.json').read_text(encoding='utf-8'))
seas = json.loads((ROOT / 'data/world/seaRegions.meta.json').read_text(encoding='utf-8'))
coastal = {rid for sea in seas.get('seaRegions', []) for rid in sea.get('adjacentLand', [])}
rows = []
for feature in geo.get('features', []):
    rid = audit.feature_id(feature)
    if rid in coastal:
        continue
    area, perimeter, components, rings, component_areas = audit.geometry_metrics(feature.get('geometry') or {})
    largest = max(component_areas, default=0.0)
    over1 = sum(a >= 1 for a in component_areas)
    over10 = sum(a >= 10 for a in component_areas)
    ratio = perimeter / (area ** 0.5) if area > 0 else float('inf')
    largest_fraction = largest / area if area else 0
    score = over1 * (1 - largest_fraction)
    rows.append((score, ratio, over10, components, rid, audit.label_for(feature), area, largest_fraction, over1))
rows.sort(reverse=True)
print(f'INLAND_REGIONS={len(rows)} COASTAL_REGIONS={len(geo.get("features", []))-len(rows)}')
print('rank\tid\tname\tarea_km2\tparts\t>1km2\t>10km2\tlargest%\tP/sqrt(A)\tconfetti')
for i, r in enumerate(rows[:120], 1):
    score, ratio, over10, components, rid, name, area, largest_fraction, over1 = r
    print(f'{i}\t{rid}\t{name}\t{area:.1f}\t{components}\t{over1}\t{over10}\t{100*largest_fraction:.1f}\t{ratio:.2f}\t{score:.1f}')
