#!/usr/bin/env python3
"""Fast Natural-Earth-backed additive map expansion.

Avoids repeatedly differencing each source polygon against one enormous,
increasingly complex world union. Existing Sim-World land is indexed once and
only nearby polygons are unioned for each source piece. Modern country masks
keep newly generated countries disjoint, so newly generated land does not need
to be folded back into the subtraction geometry country-by-country.
"""
import importlib.util
import json
import time
import urllib.request
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'build-map-expansion-v2.py'
spec = importlib.util.spec_from_file_location('map_v2', MODULE_PATH)
map_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(map_v2)

ADMIN1_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
HOST_ISO = {'VAT':'ITA', 'SMR':'ITA', 'MCO':'FRA', 'LIE':'CHE'}
ALIASES = {'KOS': {'KOS','XKX'}, 'PSE': {'PSE','PSX'}, 'ESH': {'ESH','SAH'}}
_admin1_cache = None
_existing_geoms = []
_existing_tree = None


def fetch_json_retry(url, attempts=4, timeout=120):
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': map_v2.USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except Exception as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
    raise last


def country_masks_with_hosts(admin0, wanted):
    expanded = set(wanted)
    for iso in list(wanted):
        if iso in HOST_ISO:
            expanded.add(HOST_ISO[iso])
        expanded.update(ALIASES.get(iso, set()))
    return original_country_masks(admin0, expanded)


def absorb_microstates_hosted(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    for item in specs:
        iso = item['iso']
        micro = masks.get(iso)
        if micro is None:
            for alias in ALIASES.get(iso, set()):
                micro = masks.get(alias)
                if micro is not None:
                    break
        host = masks.get(HOST_ISO.get(iso))
        if micro is None or host is None or micro.is_empty or host.is_empty:
            print(f'MICROSTATE_WARN missing {iso} or host geometry')
            continue
        best = None
        for f in base_geo:
            g = map_v2.repair(shape(f['geometry']))
            # Bounding-box rejection avoids expensive host intersections for
            # hundreds of obviously unrelated regions.
            if not g.envelope.intersects(host.envelope):
                continue
            if map_v2.area_sqkm(g.intersection(host)) < 1:
                continue
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.08 else 0
            score = (shared > 0, shared, -d)
            if best is None or score > best[0]:
                best = (score, f, g)
        if best is None:
            raise RuntimeError(f'{iso}: no host-country region available for absorption')
        _, f, g = best
        merged = map_v2.repair(unary_union([g, micro]))
        f['geometry'] = map_v2.mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(merged)
        print(f"MICROSTATE_ABSORB {iso} -> {f['properties'].get('name')}")


def feature_iso_codes(feature):
    p = feature.get('properties') or {}
    keys = ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3')
    return {str(p.get(k,'')).upper() for k in keys if p.get(k)}


def natural_earth_admin1():
    global _admin1_cache
    if _admin1_cache is None:
        _admin1_cache = fetch_json_retry(ADMIN1_URL)
        print('NATURAL_EARTH_ADMIN1_FEATURES=' + str(len(_admin1_cache.get('features', []))))
    return _admin1_cache


def prepare_existing_index(base_features):
    global _existing_geoms, _existing_tree
    # A 0.003-degree simplification is much finer than gameplay-region
    # boundaries while removing thousands of coastline vertices from repeated
    # difference operations.
    _existing_geoms = []
    for f in base_features:
        g = map_v2.repair(shape(f['geometry']))
        if not g.is_empty:
            _existing_geoms.append(map_v2.repair(g.simplify(0.003, preserve_topology=True)))
    _existing_tree = STRtree(_existing_geoms)
    print('EXISTING_SPATIAL_INDEX=' + str(len(_existing_geoms)))


def subtract_existing(g):
    if _existing_tree is None or g.is_empty:
        return g
    # Shapely 2 STRtree returns integer indices. Only union geometries whose
    # envelopes intersect this source piece; most pieces see a handful rather
    # than all ~600 existing regions.
    indices = _existing_tree.query(g)
    nearby = [_existing_geoms[int(i)] for i in indices]
    if not nearby:
        return g
    coverage = unary_union(nearby) if len(nearby) > 1 else nearby[0]
    return map_v2.repair(g.difference(coverage))


def source_features_fast(country, mask, _unused_existing_coverage):
    iso = country['iso']
    min_area = float(country.get('minAreaSqKm', 400))
    max_lon = country.get('maxCentroidLongitude')
    lon_clip = box(-180, -90, float(max_lon), 90) if max_lon is not None else None
    accepted = {iso} | ALIASES.get(iso, set())

    candidates = []
    if country.get('level') == 'ADM0':
        if mask is not None:
            candidates = [(country['name'], mask)]
    else:
        for f in natural_earth_admin1().get('features', []):
            if not (feature_iso_codes(f) & accepted):
                continue
            p = f.get('properties') or {}
            name = str(p.get('name') or p.get('name_en') or p.get('gn_name') or country['name'])
            candidates.append((name, map_v2.clean(shape(f['geometry']))))
        if not candidates and mask is not None:
            candidates = [(country['name'], mask)]

    pieces = []
    for name, geom in candidates:
        g = map_v2.clean(geom)
        if mask is not None:
            g = map_v2.repair(g.intersection(mask))
        if lon_clip is not None:
            g = map_v2.repair(g.intersection(lon_clip))
        if g.is_empty:
            continue
        g = subtract_existing(g)
        if g.is_empty:
            continue
        a = map_v2.area_sqkm(g)
        if a < min_area:
            continue
        pieces.append({'geometry': g, 'names':[name], 'anchor':name, 'anchorArea':a})
    return pieces


def cluster_regions_fast(pieces, target):
    """Merge nearest contiguous pieces without O(n^3) global rescans.

    Natural Earth ADM1 counts are modest, but Russia can still make the old
    all-pairs-rescan loop expensive. Rebuild a spatial tree each merge round and
    choose the best touching/nearby candidate for the smallest cluster.
    """
    clusters = list(pieces)
    target = max(1, min(int(target), len(clusters))) if clusters else 0
    while len(clusters) > target:
        clusters.sort(key=lambda c: map_v2.area_sqkm(c['geometry']))
        geoms = [c['geometry'] for c in clusters]
        tree = STRtree(geoms)
        merged_pair = None
        for i, a in enumerate(clusters):
            # Expand around this piece; country subdivisions normally touch.
            candidates = tree.query(a['geometry'].buffer(0.08))
            best = None
            for raw_j in candidates:
                j = int(raw_j)
                if j == i:
                    continue
                b = clusters[j]
                d = a['geometry'].distance(b['geometry'])
                score = (0 if d <= 0.04 else 1, d,
                         map_v2.area_sqkm(a['geometry']) + map_v2.area_sqkm(b['geometry']))
                if best is None or score < best[0]:
                    best = (score, j)
            if best is not None:
                merged_pair = (i, best[1])
                break
        if merged_pair is None:
            # Rare island fallback: one full pair scan, not one per merge.
            best = None
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    d = clusters[i]['geometry'].distance(clusters[j]['geometry'])
                    score = (d, map_v2.area_sqkm(clusters[i]['geometry']) + map_v2.area_sqkm(clusters[j]['geometry']))
                    if best is None or score < best[0]:
                        best = (score, i, j)
            _, i, j = best
        else:
            i, j = merged_pair
        if j < i:
            i, j = j, i
        a, b = clusters[i], clusters[j]
        g = map_v2.repair(unary_union([a['geometry'], b['geometry']]))
        anchor = a if a['anchorArea'] >= b['anchorArea'] else b
        merged = {'geometry':g,
                  'names':sorted(set(a['names'] + b['names']), key=str.casefold),
                  'anchor':anchor['anchor'], 'anchorArea':anchor['anchorArea']}
        clusters.pop(j); clusters.pop(i); clusters.append(merged)
    return clusters


def make_runtime_plan_idempotent():
    configured = json.loads(Path(map_v2.PLAN).read_text())
    baseline = int(configured.get('targetExistingRegionCount', 0))
    live_geo = json.loads(Path(map_v2.BASE_GEO).read_text())
    current = len(live_geo.get('features', []))
    if current < baseline:
        raise RuntimeError(f'Base map has {current} regions; expansion requires at least {baseline}')
    if current != baseline:
        runtime = dict(configured)
        runtime['targetExistingRegionCount'] = current
        runtime_path = Path('/tmp/simworld-map-region-plan-v2-runtime.json')
        runtime_path.write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + '\n')
        map_v2.PLAN = runtime_path
        print(f'IDEMPOTENT_REBASE configured={baseline} current={current}')
    prepare_existing_index(live_geo.get('features', []))


original_country_masks = map_v2.country_masks
map_v2.fetch_json = fetch_json_retry
map_v2.country_masks = country_masks_with_hosts
map_v2.absorb_microstates = absorb_microstates_hosted
map_v2.source_features = source_features_fast
map_v2.cluster_regions = cluster_regions_fast

if __name__ == '__main__':
    make_runtime_plan_idempotent()
    map_v2.main()
