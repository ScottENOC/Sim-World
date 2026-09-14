#!/usr/bin/env python3
"""Make replay-only expansion stages accept the current reconstructed baseline.

Normal standalone builds keep their historical plan-count guard. Setting
SIMWORLD_DYNAMIC_BASE=1 lets the deterministic reconstruction pipeline replay a
stage after an earlier stage produced more geography-correct regions.
"""
from pathlib import Path

for filename in ('tools/build-silk-road-expansion.py', 'tools/build-east-africa-expansion.py'):
    path = Path(filename)
    text = path.read_text()
    if 'import os\n' not in text:
        text = text.replace('import json\n', 'import json\nimport os\n', 1)
    old = """    expected = int(plan['targetExistingRegionCount'])
    if len(geo.get('features', [])) != expected:
        raise RuntimeError(f\"Base map has {len(geo.get('features', []))}; expected {expected}\")
"""
    new = """    expected = int(plan['targetExistingRegionCount'])
    actual = len(geo.get('features', []))
    if actual != expected:
        if os.environ.get('SIMWORLD_DYNAMIC_BASE') == '1' and actual >= expected:
            print(f'DYNAMIC_BASE configured={expected} actual={actual}')
            expected = actual
        else:
            raise RuntimeError(f\"Base map has {actual}; expected {expected}\")
"""
    if new not in text:
        if old not in text:
            raise SystemExit(f'baseline guard anchor not found in {filename}')
        text = text.replace(old, new, 1)

    # Detailed source paths also need the shared component splitter. The broad
    # source path already invokes it inside source_features_fast().
    if filename.endswith('build-silk-road-expansion.py'):
        old_piece = """        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        pieces.append({'geometry': geom, 'names': [name], 'anchor': name,
                       'anchorArea': area, 'mergeArea': geom.area})
"""
        new_piece = """        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        for component in fast.split_material_components(geom, 8):
            component_area = map_v2.area_sqkm(component)
            pieces.append({'geometry': component, 'names': [name], 'anchor': name,
                           'anchorArea': component_area, 'mergeArea': component.area})
"""
    else:
        old_piece = """        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        pieces.append({
            'geometry': geom,
            'names': [name],
            'anchor': name,
            'anchorArea': area,
            'mergeArea': geom.area,
            'iso': iso,
        })
"""
        new_piece = """        area = map_v2.area_sqkm(geom)
        if area < min_area:
            continue
        for component in fast.split_material_components(geom, 8):
            component_area = map_v2.area_sqkm(component)
            pieces.append({
                'geometry': component,
                'names': [name],
                'anchor': name,
                'anchorArea': component_area,
                'mergeArea': component.area,
                'iso': iso,
            })
"""
    if new_piece not in text:
        if old_piece not in text:
            raise SystemExit(f'component source anchor not found in {filename}')
        text = text.replace(old_piece, new_piece, 1)
    path.write_text(text)
