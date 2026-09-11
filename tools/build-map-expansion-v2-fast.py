#!/usr/bin/env python3
"""Fast Natural-Earth-backed additive map expansion.

Existing Sim-World land is spatially indexed once. Each candidate source polygon
is differenced only against nearby existing regions, and already-represented
stable IDs are dropped as source-boundary slivers before adjacency is built.
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
_existing_ids = set()


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
    masks = original_country_masks(admin0, expanded)
    if 'UKR' in expanded:
        crimea_parts = []
        for f in natural_earth_admin1().get('features', []):
            subdivision = str((f.get('properties') or {}).get('iso_3166_2') or '').upper()
            if subdivision in {'UA-43', 'UA-40'}:
                crimea_parts.append(map_v2.repair(shape(f['geometry'])))
        if crimea_parts:
            crimea = map_v2.repair(unary_union(crimea_parts))
            if masks.get('UKR') is not None:
                masks['UKR'] = map_v2.repair(unary_union([masks['UKR'], crimea]))
            else:
                masks['UKR'] = crimea
            if masks.get('RUS') is not None:
                masks['RUS'] = map_v2.repair(masks['RUS'].difference(crimea))
            print('CRIMEA_GEOGRAPHIC_MASK=UKR UA-43+UA-40')
    return masks


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
        host_env = host.envelope
        for f in base_geo:
            g = map_v2.repair(shape(f['geometry']))
            if not g.envelope.intersects(host_env):
                continue
            total_area = max(1.0, map_v2.area_sqkm(g))
            host_area = map_v2.area_sqkm(g.intersection(host))
            if host_area / total_area < 0.50:
                continue
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.08 else 0
            score = (shared > 0, shared, -d, host_area / total_area)
            if best is None or score > best[0]:
                best = (score, f, g)
        if best is None:
            raise RuntimeError(f'{iso}: no predominantly host-country region available for absorption')
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
    subdivision = str(p.get('iso_3166_2') or '').upper()
    if subdivision in {'UA-43', 'UA-40'}:
        return {'UKR'}
    keys = ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3')
    return {str(p.get(k,'')).upper() for k in keys if p.get(k)}


def natural_earth_admin1():
    global _admin1_cache
    if _admin1_cache is None:
        _admin1_cache = fetch_json_retry(ADMIN1_URL)
        print('NATURAL_EARTH_ADMIN1_FEATURES=' + str(len(_admin1_cache.get('features', []))))
    return _admin1_cache


def prepare_existing_index(base_features):
    global _existing_geoms, _existing_tree, _existing_ids
    _existing_geoms = []
    _existing_ids = {f['properties']['id'] for f in base_features}
    for f in base_features:
        g = map_v2.repair(shape(f['geometry']))
        if not g.is_empty:
            _existing_geoms.append(map_v2.repair(g.simplify(0.005, preserve_topology=True)))
    _existing_tree = STRtree(_existing_geoms)
    print('EXISTING_SPATIAL_INDEX=' + str(len(_existing_geoms)))


def subtract_existing(g):
    if _existing_tree is None or g.is_empty:
        return g
    indices = _existing_tree.query(g)
    nearby = [_existing_geoms[int(i)] for i in indices]
    if not nearby:
        return g
    coverage = unary_union(nearby) if len(nearby) > 1 else nearby[0]
    return map_v2.repair(g.difference(coverage))


def source_features_fast(country, mask, _unused_existing_coverage):
    iso = country['iso']
    min_area = float(country.get('minAreaSqKm', 400))
    min_lon = country.get('minLongitude')
    max_lon = country.get('maxCentroidLongitude')
    if min_lon is not None or max_lon is not None:
        lon_clip = box(float(min_lon if min_lon is not None else -180), -90,
                       float(max_lon if max_lon is not None else 180), 90)
    else:
        lon_clip = None
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

    if iso == 'UKR':
        crimea = [(name, geom) for name, geom in candidates if name.casefold() in {'crimea', 'sevastopol'}]
        if crimea:
            candidates = [(name, geom) for name, geom in candidates if name.casefold() not in {'crimea', 'sevastopol'}]
            candidates.append(('Crimea', map_v2.repair(unary_union([geom for _, geom in crimea]))))

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
        pieces.append({'geometry': g, 'names':[name], 'anchor':name, 'anchorArea':a, 'mergeArea':g.area})
    return pieces


def cluster_regions_fast(pieces, target):
    clusters = list(pieces)
    target = max(1, min(int(target), len(clusters))) if clusters else 0
    while len(clusters) > target:
        clusters.sort(key=lambda c: c.get('mergeArea', c['geometry'].area))
        geoms = [c['geometry'] for c in clusters]
        tree = STRtree(geoms)
        merged_pair = None
        for i, a in enumerate(clusters):
            candidates = tree.query(a['geometry'].buffer(0.08))
            best = None
            for raw_j in candidates:
                j = int(raw_j)
                if j == i:
                    continue
                b = clusters[j]
                d = a['geometry'].distance(b['geometry'])
                combined = a.get('mergeArea', a['geometry'].area) + b.get('mergeArea', b['geometry'].area)
                score = (0 if d <= 0.04 else 1, d, combined)
                if best is None or score < best[0]:
                    best = (score, j)
            if best is not None:
                merged_pair = (i, best[1])
                break
        if merged_pair is None:
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
        if j < i:
            i, j = j, i
        a, b = clusters[i], clusters[j]
        g = map_v2.repair(unary_union([a['geometry'], b['geometry']]))
        anchor = a if a['anchorArea'] >= b['anchorArea'] else b
        merged = {
            'geometry':g,
            'names':sorted(set(a['names'] + b['names']), key=str.casefold),
            'anchor':anchor['anchor'],
            'anchorArea':anchor['anchorArea'],
            'mergeArea':a.get('mergeArea', a['geometry'].area) + b.get('mergeArea', b['geometry'].area),
        }
        clusters.pop(j); clusters.pop(i); clusters.append(merged)
    return clusters


def make_game_regions_fast(country, clusters):
    regions = original_make_game_regions(country, clusters)
    kept = []
    for r in regions:
        if r['id'] in _existing_ids:
            print(f"DUPLICATE_SLIVER_SKIP {country['iso']} {r['name']} {r['areaSqKm']:.0f}sqkm")
            continue
        kept.append(r)
    return kept


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
original_make_game_regions = map_v2.make_game_regions
map_v2.fetch_json = fetch_json_retry
map_v2.country_masks = country_masks_with_hosts
map_v2.absorb_microstates = absorb_microstates_hosted
map_v2.source_features = source_features_fast
map_v2.cluster_regions = cluster_regions_fast
map_v2.make_game_regions = make_game_regions_fast

if __name__ == '__main__':
    make_runtime_plan_idempotent()
    map_v2.main()
