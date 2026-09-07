#!/usr/bin/env python3
"""Natural-Earth-backed runner for the broad additive map expansion.

A single admin-1 dataset is sufficient because modern subdivisions are only raw
geometry ingredients. Existing Sim-World land is subtracted before clustering.
The configured target count is a minimum baseline: after this expansion has
already generated regions, rerunning the builder is safe and adds nothing twice.
"""
import importlib.util
import json
import time
import urllib.request
from pathlib import Path

from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'build-map-expansion-v2.py'
spec = importlib.util.spec_from_file_location('map_v2', MODULE_PATH)
map_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(map_v2)

ADMIN1_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
HOST_ISO = {'VAT':'ITA', 'SMR':'ITA', 'MCO':'FRA', 'LIE':'CHE'}
ALIASES = {'KOS': {'KOS','XKX'}, 'PSE': {'PSE','PSX'}, 'ESH': {'ESH','SAH'}}
_admin1_cache = None


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
    # Natural Earth sometimes uses its own ADM0 code for special territories.
    for iso in list(wanted):
        expanded.update(ALIASES.get(iso, set()))
    return original_country_masks(admin0, expanded)


def absorb_microstates_hosted(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    for item in specs:
        iso = item['iso']
        micro = masks.get(iso)
        # If the mask was indexed under a Natural Earth alias, recover it.
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
        merged = map_v2.repair(map_v2.unary_union([g, micro]))
        f['geometry'] = map_v2.mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(merged)
        print(f"MICROSTATE_ABSORB {iso} -> {f['properties'].get('name')}")


def feature_iso_codes(feature):
    p = feature.get('properties') or {}
    keys = ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3','geonunit','GEONUNIT')
    return {str(p.get(k,'')).upper() for k in keys if p.get(k)}


def natural_earth_admin1():
    global _admin1_cache
    if _admin1_cache is None:
        _admin1_cache = fetch_json_retry(ADMIN1_URL)
        print('NATURAL_EARTH_ADMIN1_FEATURES=' + str(len(_admin1_cache.get('features', []))))
    return _admin1_cache


def source_features_natural_earth(country, mask, existing_coverage):
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
        g = map_v2.repair(g.difference(existing_coverage))
        a = map_v2.area_sqkm(g)
        if g.is_empty or a < min_area:
            continue
        pieces.append({'geometry':g,'names':[name],'anchor':name,'anchorArea':a})
    return pieces


def make_runtime_plan_idempotent():
    configured = json.loads(Path(map_v2.PLAN).read_text())
    baseline = int(configured.get('targetExistingRegionCount', 0))
    live_geo = json.loads(Path(map_v2.BASE_GEO).read_text())
    current = len(live_geo.get('features', []))
    if current < baseline:
        raise RuntimeError(f'Base map has {current} regions; expansion requires at least {baseline}')
    if current == baseline:
        return
    runtime = dict(configured)
    runtime['targetExistingRegionCount'] = current
    runtime_path = Path('/tmp/simworld-map-region-plan-v2-runtime.json')
    runtime_path.write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + '\n')
    map_v2.PLAN = runtime_path
    print(f'IDEMPOTENT_REBASE configured={baseline} current={current}')


original_country_masks = map_v2.country_masks
map_v2.fetch_json = fetch_json_retry
map_v2.country_masks = country_masks_with_hosts
map_v2.absorb_microstates = absorb_microstates_hosted
map_v2.source_features = source_features_natural_earth

if __name__ == '__main__':
    make_runtime_plan_idempotent()
    map_v2.main()
