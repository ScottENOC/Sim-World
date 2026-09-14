#!/usr/bin/env python3
"""Harden the earlier broad-map source path against disconnected remainder confetti."""
from pathlib import Path

path = Path('tools/build-map-expansion-v2-fast.py')
text = path.read_text()

helper_anchor = """def prepare_existing_index(base_features):\n"""
helper = """def split_material_components(geom, min_material_area_sqkm=8):
    geom = map_v2.repair(geom)
    if geom.is_empty:
        return []

    def polygons(g):
        if g.geom_type == 'Polygon':
            yield g
        elif hasattr(g, 'geoms'):
            for child in g.geoms:
                yield from polygons(child)

    parts = [map_v2.repair(p) for p in polygons(geom) if not p.is_empty]
    if len(parts) <= 1:
        return parts
    material = [p for p in parts if map_v2.area_sqkm(p) >= min_material_area_sqkm]
    tiny = [p for p in parts if map_v2.area_sqkm(p) < min_material_area_sqkm]
    if not material:
        return [geom]
    groups = [[p] for p in material]
    for fragment in tiny:
        nearest = min(range(len(material)), key=lambda i: fragment.distance(material[i]))
        groups[nearest].append(fragment)
    return [map_v2.repair(unary_union(group)) for group in groups]


"""
if helper not in text:
    if helper_anchor not in text:
        raise SystemExit('helper insertion anchor not found')
    text = text.replace(helper_anchor, helper + helper_anchor, 1)

old = """        a = map_v2.area_sqkm(g)
        if a < min_area:
            continue
        pieces.append({'geometry': g, 'names':[name], 'anchor':name, 'anchorArea':a, 'mergeArea':g.area})
"""
new = """        a = map_v2.area_sqkm(g)
        if a < min_area:
            continue
        for component in split_material_components(g, min_area):
            ca = map_v2.area_sqkm(component)
            if ca < min_area:
                continue
            pieces.append({'geometry': component, 'names':[name], 'anchor':name, 'anchorArea':ca, 'mergeArea':component.area})
"""
if new not in text:
    if old not in text:
        raise SystemExit('source feature splitting anchor not found')
    text = text.replace(old, new, 1)

path.write_text(text)
