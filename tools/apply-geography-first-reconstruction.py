#!/usr/bin/env python3
"""Apply geography-first reconstruction rules to the Old World map builders.

This intentionally patches only the broad generated-world builder. Existing
older map layers keep their current behaviour. The reconstruction accepts more
regions than the target plan when necessary rather than merging disconnected
mainland pieces merely to hit an arbitrary count.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, old, new):
    file = ROOT / path
    text = file.read_text()
    if new in text:
        print(f'ALREADY_APPLIED {path}')
        return
    if old not in text:
        raise RuntimeError(f'patch anchor missing in {path}')
    file.write_text(text.replace(old, new, 1))
    print(f'PATCHED {path}')


# Source subtraction can create hundreds of tiny detached slivers. Once a
# meaningful component exists, sub-8 km² scraps are below the simulation's
# regional resolution and should not be glued to distant mainland geometry.
replace(
    'tools/build-old-world-asia-pacific.py',
    """    groups = [[p] for p in material]\n    for fragment in tiny:\n        nearest = min(range(len(material)), key=lambda i: fragment.distance(material[i]))\n        groups[nearest].append(fragment)\n    return [map_v2.repair(unary_union(group)) for group in groups]\n""",
    """    # Detached sub-resolution remnants are discarded once meaningful land\n    # exists. Keeping them by attaching each scrap to the nearest mainland was\n    # a major source of multi-polygon 'confetti' such as Kursk. Genuine\n    # all-small island groups are still preserved by the branch above.\n    return material\n""",
)

# Add a strict mainland clustering path. It merges only pieces whose union is
# physically connected. If the requested target cannot be reached without a
# disconnected merge, it stops and accepts the higher region count.
batch_path = ROOT / 'tools/build-old-world-map-batch.py'
batch = batch_path.read_text()
helper = r'''

DISCONNECTED_ZONE_PREFIXES = (
    'mi_', 'pac_', 'nz_',
)
DISCONNECTED_ZONE_IDS = {
    'ow_med_islands',
    'ea_japan_hokkaido', 'ea_japan_honshu', 'ea_japan_south',
    'ea_sakhalin', 'ea_taiwan', 'au_tasmania', 'pac_hawaii',
}


def zone_allows_disconnected(zone):
    zone_id = str(zone.get('id') or '')
    return zone_id in DISCONNECTED_ZONE_IDS or zone_id.startswith(DISCONNECTED_ZONE_PREFIXES)


def cluster_regions_contiguous(builder, pieces, target):
    clusters = list(pieces)
    if not clusters:
        return []
    target = max(1, min(int(target), len(clusters)))

    while len(clusters) > target:
        geoms = [c['geometry'] for c in clusters]
        tree = STRtree(geoms)
        best = None
        for i, a in enumerate(clusters):
            for raw_j in tree.query(a['geometry']):
                j = int(raw_j)
                if j <= i:
                    continue
                b = clusters[j]
                if not a['geometry'].intersects(b['geometry']):
                    continue
                merged_geom = builder.map_v2.repair(unary_union([a['geometry'], b['geometry']]))
                if merged_geom.is_empty:
                    continue
                material_parts = builder.split_material_components(merged_geom, 8)
                if len(material_parts) != 1:
                    continue
                connected = material_parts[0]
                combined = a.get('mergeArea', a['geometry'].area) + b.get('mergeArea', b['geometry'].area)
                score = (combined, connected.length)
                if best is None or score < best[0]:
                    best = (score, i, j, connected)
        if best is None:
            break

        _, i, j, geometry = best
        a, b = clusters[i], clusters[j]
        anchor = a if a['anchorArea'] >= b['anchorArea'] else b
        merged = {
            'geometry': geometry,
            'names': sorted(set(a['names'] + b['names']), key=str.casefold),
            'anchor': anchor['anchor'],
            'anchorArea': anchor['anchorArea'],
            'mergeArea': a.get('mergeArea', a['geometry'].area) + b.get('mergeArea', b['geometry'].area),
        }
        clusters.pop(j)
        clusters.pop(i)
        clusters.append(merged)
    return clusters


def cluster_zone(builder, source, zone):
    target = zone['targetRegions']
    if zone_allows_disconnected(zone):
        return builder.fast.cluster_regions_fast(source, target)
    clusters = cluster_regions_contiguous(builder, source, target)
    if len(clusters) > target:
        print(f"ZONE_CONTIGUITY_OVERRIDE {zone['id']} target={target} actual={len(clusters)}", flush=True)
    return clusters
'''

anchor = "\ndef local_coverage(builder, wanted_mask, existing_geoms, existing_tree, new_regions):\n"
if 'def cluster_regions_contiguous(builder, pieces, target):' not in batch:
    if anchor not in batch:
        raise RuntimeError('batch clustering insertion anchor missing')
    batch = batch.replace(anchor, helper + anchor, 1)

old_call = """        clusters = builder.fast.cluster_regions_fast(source, zone['targetRegions'])\n        regions = builder.make_regions(zone, clusters)\n"""
new_call = """        clusters = cluster_zone(builder, source, zone)\n        regions = builder.make_regions(zone, clusters)\n"""
if new_call not in batch:
    if old_call not in batch:
        raise RuntimeError('batch clustering call anchor missing')
    batch = batch.replace(old_call, new_call, 1)

batch_path.write_text(batch)
print('PATCHED tools/build-old-world-map-batch.py')
