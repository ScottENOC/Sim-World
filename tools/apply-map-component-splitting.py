#!/usr/bin/env python3
from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# Add a reusable splitter to the Old World builder. Material disconnected
# polygons become independent source pieces; sub-threshold fragments are kept
# with their nearest material component so coverage is not silently discarded.
path = Path('tools/build-old-world-asia-pacific.py')
text = path.read_text()
anchor = """def pacific_extra_geometry():
    return unary_union(PACIFIC_EXTRAS)


"""
addition = anchor + """def split_material_components(geom, min_material_area_sqkm=8):
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
        # Preserve genuine small-island groups rather than deleting land merely
        # because no individual island reaches the source-unit threshold.
        return [geom]

    groups = [[p] for p in material]
    for fragment in tiny:
        nearest = min(range(len(material)), key=lambda i: fragment.distance(material[i]))
        groups[nearest].append(fragment)
    return [map_v2.repair(unary_union(group)) for group in groups]


"""
text = replace_once(text, anchor, addition, 'component splitter')
old = """    def add_piece(geom, name, source):
        geom = map_v2.repair(geom.difference(existing))
        if geom.is_empty or map_v2.area_sqkm(geom) < 8:
            return
        area = map_v2.area_sqkm(geom)
        pieces.append({'geometry': geom, 'names': [name], 'anchor': name, 'anchorArea': area,
                       'mergeArea': geom.area, 'source': source})
"""
new = """    def add_piece(geom, name, source):
        geom = map_v2.repair(geom.difference(existing))
        if geom.is_empty or map_v2.area_sqkm(geom) < 8:
            return
        for component in split_material_components(geom, 8):
            area = map_v2.area_sqkm(component)
            if area < 8:
                continue
            pieces.append({'geometry': component, 'names': [name], 'anchor': name, 'anchorArea': area,
                           'mergeArea': component.area, 'source': source})
"""
text = replace_once(text, old, new, 'whole-world source splitter use')
path.write_text(text)

# Apply the same rule to the bounded batch builder used by CI map expansion.
path = Path('tools/build-old-world-map-batch.py')
text = path.read_text()
old = """    def add_piece(geom, name, source):
        geom = local_subtract(builder, geom, existing_geoms, existing_tree)
        if geom.is_empty or builder.map_v2.area_sqkm(geom) < 8:
            return
        area = builder.map_v2.area_sqkm(geom)
        pieces.append({
            'geometry': geom, 'names': [name], 'anchor': name,
            'anchorArea': area, 'mergeArea': geom.area, 'source': source,
        })
"""
new = """    def add_piece(geom, name, source):
        geom = local_subtract(builder, geom, existing_geoms, existing_tree)
        if geom.is_empty or builder.map_v2.area_sqkm(geom) < 8:
            return
        for component in builder.split_material_components(geom, 8):
            area = builder.map_v2.area_sqkm(component)
            if area < 8:
                continue
            pieces.append({
                'geometry': component, 'names': [name], 'anchor': name,
                'anchorArea': area, 'mergeArea': component.area, 'source': source,
            })
"""
text = replace_once(text, old, new, 'batch source splitter use')
path.write_text(text)
