#!/usr/bin/env python3
"""Harden the shared expansion path against disconnected-region confetti."""
from pathlib import Path

path = Path('tools/build-map-expansion-v2-fast.py')
text = path.read_text()

helper_anchor = "def prepare_existing_index(base_features):\n"
helper = """MAX_CLUSTER_GAP_DEGREES = 0.35


def split_material_components(geom, min_material_area_sqkm=8):
    \"\"\"Split real disconnected land while retaining sub-threshold crumbs.

    The 8 km² threshold identifies material land components. Smaller fragments
    are attached to their nearest material component so no land is silently
    discarded. If the whole geometry consists of tiny islands, it remains one
    source unit for later coherent archipelago clustering.
    \"\"\"
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

old_source = """        a = map_v2.area_sqkm(g)
        if a < min_area:
            continue
        pieces.append({'geometry': g, 'names':[name], 'anchor':name, 'anchorArea':a, 'mergeArea':g.area})
"""
new_source = """        a = map_v2.area_sqkm(g)
        if a < min_area:
            continue
        # Split on a small absolute material threshold, not the country's source
        # minimum. The latter can be hundreds of km² and would leave dozens of
        # genuinely separate 10–100 km² fragments glued together.
        for component in split_material_components(g, 8):
            ca = map_v2.area_sqkm(component)
            pieces.append({'geometry': component, 'names':[name], 'anchor':name, 'anchorArea':ca, 'mergeArea':component.area})
"""
if new_source not in text:
    if old_source not in text:
        raise SystemExit('source feature splitting anchor not found')
    text = text.replace(old_source, new_source, 1)

old_cluster = """        if merged_pair is None:
            best = None
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    d = clusters[i]['geometry'].distance(clusters[j]['geometry'])
                    combined = clusters[i].get('mergeArea', clusters[i]['geometry'].area) + clusters[j].get('mergeArea', clusters[j]['geometry'].area)
                    score = (d, combined)
                    if best is None or score < best[0]:
                        best = (score, i, j)
            _, i, j = best
        else:
            i, j = merged_pair
"""
new_cluster = """        if merged_pair is None:
            # Region-count targets are soft. Never merge far-apart land merely
            # to hit a historical count: that is the mechanism which produced
            # Kursk-style confetti. A modest gap still permits coherent local
            # island groups and tiny source seams.
            best = None
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    d = clusters[i]['geometry'].distance(clusters[j]['geometry'])
                    if d > MAX_CLUSTER_GAP_DEGREES:
                        continue
                    combined = clusters[i].get('mergeArea', clusters[i]['geometry'].area) + clusters[j].get('mergeArea', clusters[j]['geometry'].area)
                    score = (d, combined)
                    if best is None or score < best[0]:
                        best = (score, i, j)
            if best is None:
                print(f'CLUSTER_STOP disconnected={len(clusters)} target={target}')
                break
            _, i, j = best
        else:
            i, j = merged_pair
"""
if new_cluster not in text:
    if old_cluster not in text:
        raise SystemExit('cluster fallback anchor not found')
    text = text.replace(old_cluster, new_cluster, 1)

path.write_text(text)
