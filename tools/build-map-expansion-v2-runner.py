#!/usr/bin/env python3
"""Stable runner for build-map-expansion-v2.

Uses the same pinned geoBoundaries snapshot as the existing 418-region map and
constrains absorbed microstates to their surrounding host-country geography.
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

PIN = '9469f09'
# Use github.com/.../raw rather than raw.githubusercontent.com. The repository
# stores these geometries in Git LFS; this URL form resolves the LFS object,
# matching the source URLs already recorded for the 418-region expansion.
DIRECT = ('https://github.com/wmgeolab/geoBoundaries/raw/' + PIN +
          '/releaseData/gbOpen/{iso}/{level}/geoBoundaries-{iso}-{level}_simplified.geojson')
HOST_ISO = {'VAT':'ITA', 'SMR':'ITA', 'MCO':'FRA', 'LIE':'CHE'}


def fetch_json_retry(url, attempts=4, timeout=45):
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': map_v2.USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except Exception as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(1.5 * (attempt + 1))
    raise last


def country_masks_with_hosts(admin0, wanted):
    expanded = set(wanted)
    for iso in list(wanted):
        if iso in HOST_ISO:
            expanded.add(HOST_ISO[iso])
    return original_country_masks(admin0, expanded)


def absorb_microstates_hosted(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    for spec in specs:
        iso = spec['iso']
        micro = masks.get(iso)
        host = masks.get(HOST_ISO.get(iso))
        if micro is None or micro.is_empty or host is None or host.is_empty:
            print(f'MICROSTATE_WARN missing geometry/host {iso}')
            continue
        best = None
        for f in base_geo:
            g = map_v2.repair(shape(f['geometry']))
            # Only regions with meaningful land inside the surrounding country
            # may absorb the enclave. This prevents Liechtenstein -> Lombardia.
            if map_v2.area_sqkm(g.intersection(host)) < 1:
                continue
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.08 else 0
            score = (shared > 0, shared, -d)
            if best is None or score > best[0]:
                best = (score, f, g)
        if best is None:
            raise RuntimeError(f'{iso}: no surrounding host-country game region found')
        _, f, g = best
        merged = map_v2.repair(map_v2.unary_union([g, micro]))
        f['geometry'] = map_v2.mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(merged)
        print(f"MICROSTATE_ABSORB {iso} -> {f['properties'].get('name')}")


def source_features_pinned(country, mask, existing_coverage):
    iso = country['iso']
    level = country.get('level', 'ADM1')
    url = DIRECT.format(iso=iso, level=level)
    try:
        geo = fetch_json_retry(url)
    except Exception as direct_error:
        print(f'PINNED_SOURCE_WARN {iso}: {direct_error}; falling back to live API')
        meta = fetch_json_retry(map_v2.GEOB_API.format(iso=iso, level=level), attempts=2, timeout=45)
        fallback = meta.get('simplifiedGeometryGeoJSON') or meta.get('gjDownloadURL')
        if not fallback:
            raise RuntimeError(f'{iso}: no fallback GeoJSON URL')
        geo = fetch_json_retry(fallback, attempts=3, timeout=45)

    min_area = float(country.get('minAreaSqKm', 400))
    max_lon = country.get('maxCentroidLongitude')
    lon_clip = box(-180, -90, float(max_lon), 90) if max_lon is not None else None
    pieces = []
    for f in geo.get('features', []):
        name = map_v2.feature_name(f)
        g = map_v2.clean(shape(f['geometry']))
        if mask is not None:
            g = map_v2.repair(g.intersection(mask))
        if lon_clip is not None:
            g = map_v2.repair(g.intersection(lon_clip))
        if g.is_empty:
            continue
        g = map_v2.repair(g.difference(existing_coverage))
        if g.is_empty or map_v2.area_sqkm(g) < min_area:
            continue
        pieces.append({'geometry':g,'names':[name],'anchor':name,'anchorArea':map_v2.area_sqkm(g)})
    return pieces


original_country_masks = map_v2.country_masks
map_v2.fetch_json = fetch_json_retry
map_v2.country_masks = country_masks_with_hosts
map_v2.absorb_microstates = absorb_microstates_hosted
map_v2.source_features = source_features_pinned

if __name__ == '__main__':
    map_v2.main()
