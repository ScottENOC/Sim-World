#!/usr/bin/env python3
"""Repair two known gross land-ownership corruptions in the checked-in world.

The repair is footprint-conserving: it repartitions only geometry already owned by
malformed regions. Modern administrative data is not used to draw the new borders.
Instead, the large Central-European component accidentally labelled Kaliningrad is
cut into broad geography-first bands. Finite mineral stock and worker capacity are
split by area so the operation cannot create resources.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'data' / 'world'
GEO = WORLD / 'regions.geo.json'
META = WORLD / 'regions.meta.json'
RES = WORLD / 'resources.initial.json'

BROKEN_KAL = 'r2_81f83805b72'
GOOD_KAL = 'r2_8d84d0f082a'
SERMERSOOQ = 'r2_a75df4701f6'
GEOD = Geod(ellps='WGS84')
MIN_KEEP_KM2 = 0.01

CENTRAL_ZONES = [
    ('lower_rhine_low_countries', 'Lower Rhine & Low Countries', box(-10, 50.4, 7.4, 60)),
    ('upper_rhine', 'Upper Rhine & Western Uplands', box(-10, 40, 8.8, 50.4)),
    ('north_german_plain', 'North German Plain', box(7.4, 52.0, 11.5, 60)),
    ('elbe_baltic', 'Lower Elbe & Baltic Plain', box(11.5, 52.0, 18.5, 60)),
    ('central_uplands', 'Central European Uplands', box(8.8, 49.5, 12.2, 52.0)),
    ('bohemian_marches', 'Bohemian & Saxon Marches', box(12.2, 49.5, 18.5, 52.0)),
    ('alpine_foreland', 'Alpine Foreland & Upper Danube', box(8.8, 40, 18.5, 49.5)),
]


def repair(g):
    if g.is_empty:
        return g
    return g if g.is_valid else g.buffer(0)


def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    out = []
    if hasattr(g, 'geoms'):
        for child in g.geoms:
            out.extend(polygons(child))
    return out


def area_km2(g):
    if g.is_empty:
        return 0.0
    a, _ = GEOD.geometry_area_perimeter(g)
    return abs(a) / 1_000_000.0


def stable_id(key):
    return 'r_fix_' + hashlib.sha1(key.encode('utf-8')).hexdigest()[:11]


def split_resource(resource, weights):
    """Return area-weighted resource copies without multiplying finite deposits."""
    outputs = []
    for weight in weights:
        doc = copy.deepcopy(resource)
        for deposit in (doc.get('deposits') or {}).values():
            for tier in deposit.get('tiers') or []:
                if 'initialStock' in tier:
                    tier['initialStock'] = max(0, int(round(float(tier['initialStock']) * weight)))
                if 'maxWorkers' in tier:
                    tier['maxWorkers'] = max(1, int(round(float(tier['maxWorkers']) * weight)))
        outputs.append(doc)
    source_deposits = resource.get('deposits') or {}
    for dep_name, source_dep in source_deposits.items():
        source_tiers = source_dep.get('tiers') or []
        for ti, source_tier in enumerate(source_tiers):
            for field in ('initialStock', 'maxWorkers'):
                if field not in source_tier or not outputs:
                    continue
                target = int(source_tier[field])
                current = sum(int(o['deposits'][dep_name]['tiers'][ti][field]) for o in outputs)
                outputs[0]['deposits'][dep_name]['tiers'][ti][field] += target - current
    return outputs


def set_meta(meta_by_id, rid, name, geom, neighbours=None):
    c = geom.representative_point()
    doc = meta_by_id.get(rid)
    if doc is None:
        doc = {'id': rid}
        meta_by_id[rid] = doc
    doc.update({
        'id': rid,
        'name': name,
        'centroid': [c.x, c.y],
        'areaSqKm': area_km2(geom),
        'neighbors': sorted(set(neighbours or [])),
    })
    return doc


def main():
    geo = json.loads(GEO.read_text())
    meta_doc = json.loads(META.read_text())
    resources = json.loads(RES.read_text())
    features = geo['features']
    feature_by_id = {f['properties']['id']: f for f in features}
    meta_by_id = {m['id']: m for m in meta_doc['regions']}

    for rid in (BROKEN_KAL, GOOD_KAL, SERMERSOOQ):
        if rid not in feature_by_id:
            raise RuntimeError(f'missing expected region {rid}')

    broken_kal_geom = repair(shape(feature_by_id[BROKEN_KAL]['geometry']))
    good_kal_geom = repair(shape(feature_by_id[GOOD_KAL]['geometry']))
    serm_geom = repair(shape(feature_by_id[SERMERSOOQ]['geometry']))
    before_affected = repair(unary_union([broken_kal_geom, good_kal_geom, serm_geom]))

    parts = sorted(polygons(broken_kal_geom), key=area_km2, reverse=True)
    if not parts or area_km2(parts[0]) < 300_000:
        raise RuntimeError('expected malformed Central-European core not found')
    central = repair(unary_union([p for p in parts if p.bounds[0] < 18.0]))
    kal_scraps = repair(unary_union([p for p in parts if p.bounds[0] >= 18.0 and p.bounds[1] >= 53.0]))
    if not kal_scraps.is_empty:
        good_kal_geom = repair(unary_union([good_kal_geom, kal_scraps]))

    zone_geoms = []
    consumed = None
    for key, name, mask in CENTRAL_ZONES:
        g = repair(central.intersection(mask))
        if g.is_empty or area_km2(g) < MIN_KEEP_KM2:
            continue
        zone_geoms.append([key, name, g])
        consumed = g if consumed is None else repair(unary_union([consumed, g]))
    remainder = central if consumed is None else repair(central.difference(consumed))
    for part in polygons(remainder):
        if area_km2(part) < MIN_KEEP_KM2:
            continue
        idx = min(range(len(zone_geoms)), key=lambda i: part.distance(zone_geoms[i][2]))
        zone_geoms[idx][2] = repair(unary_union([zone_geoms[idx][2], part]))

    source_resource = resources[BROKEN_KAL]
    total_zone_area = sum(area_km2(row[2]) for row in zone_geoms)
    weights = [area_km2(row[2]) / total_zone_area for row in zone_geoms]
    zone_resources = split_resource(source_resource, weights)

    features[:] = [f for f in features if f['properties']['id'] != BROKEN_KAL]
    meta_doc['regions'][:] = [m for m in meta_doc['regions'] if m['id'] != BROKEN_KAL]
    meta_by_id.pop(BROKEN_KAL, None)
    resources.pop(BROKEN_KAL, None)

    new_ids = []
    for (key, name, geom), res_doc in zip(zone_geoms, zone_resources):
        rid = stable_id('central-europe|' + key)
        new_ids.append(rid)
        features.append({
            'type': 'Feature',
            'properties': {
                'id': rid,
                'name': name,
                'sourceGroup': 'central_europe_repair_v1',
                'navigationContinent': 'Europe',
                'navigationGroup': 'Central Europe',
            },
            'geometry': mapping(geom),
        })
        set_meta(meta_by_id, rid, name, geom)
        resources[rid] = res_doc

    feature_by_id[GOOD_KAL]['geometry'] = mapping(good_kal_geom)
    good_name = feature_by_id[GOOD_KAL]['properties'].get('name', 'Kaliningrad')
    set_meta(meta_by_id, GOOD_KAL, good_name, good_kal_geom)

    serm_parts = sorted(polygons(serm_geom), key=area_km2, reverse=True)
    core = serm_parts[0]
    keep = []
    detached = []
    for part in serm_parts:
        (keep if part.distance(core) < 2.0 else detached).append(part)
    new_serm = repair(unary_union(keep))
    feature_by_id[SERMERSOOQ]['geometry'] = mapping(new_serm)
    serm_name = feature_by_id[SERMERSOOQ]['properties'].get('name', 'Greenland — Kommuneqarfik Sermersooq')
    set_meta(meta_by_id, SERMERSOOQ, serm_name, new_serm)

    current = [(f['properties']['id'], repair(shape(f['geometry']))) for f in features
               if f['properties']['id'] not in {SERMERSOOQ, GOOD_KAL, *new_ids}]
    moved_by_target = {}
    for part in detached:
        if area_km2(part) < MIN_KEEP_KM2:
            continue
        # These components have already been classified as remote from the
        # Greenland core. Keeping a known European outlier attached to Greenland
        # is worse than assigning it to the physically nearest non-Greenland region.
        target_id, _target_geom = min(current, key=lambda row: part.distance(row[1]))
        moved_by_target.setdefault(target_id, []).append(part)

    for target_id, extras in moved_by_target.items():
        target_feature = next(f for f in features if f['properties']['id'] == target_id)
        merged = repair(unary_union([shape(target_feature['geometry']), *extras]))
        target_feature['geometry'] = mapping(merged)
        set_meta(meta_by_id, target_id, target_feature['properties'].get('name', target_id), merged,
                 meta_by_id.get(target_id, {}).get('neighbors', []))

    feature_by_id[SERMERSOOQ]['geometry'] = mapping(new_serm)
    set_meta(meta_by_id, SERMERSOOQ, serm_name, new_serm)

    existing_meta_ids = {m['id'] for m in meta_doc['regions']}
    for rid in new_ids:
        if rid not in existing_meta_ids:
            meta_doc['regions'].append(meta_by_id[rid])

    repaired_source_union = repair(unary_union([good_kal_geom, new_serm, *[r[2] for r in zone_geoms],
                                                 *[p for ps in moved_by_target.values() for p in ps]]))
    source_delta = repair(before_affected.symmetric_difference(repaired_source_union))
    delta_fraction = area_km2(source_delta) / max(1.0, area_km2(before_affected))
    if delta_fraction > 1e-6:
        raise RuntimeError(f'affected land footprint changed by {delta_fraction:.3e}')

    for dep_name, dep in (source_resource.get('deposits') or {}).items():
        for ti, tier in enumerate(dep.get('tiers') or []):
            for field in ('initialStock', 'maxWorkers'):
                if field in tier:
                    got = sum(resources[rid]['deposits'][dep_name]['tiers'][ti][field] for rid in new_ids)
                    if got != tier[field]:
                        raise RuntimeError(f'{dep_name}/{field} changed: {tier[field]} -> {got}')

    GEO.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')))
    META.write_text(json.dumps(meta_doc, ensure_ascii=False, separators=(',', ':')))
    RES.write_text(json.dumps(resources, ensure_ascii=False, separators=(',', ':')))
    print(f'CENTRAL_EUROPE_REPLACEMENT_REGIONS={len(new_ids)}')
    print(f'GREENLAND_DETACHED_COMPONENTS={len(detached)}')
    print(f'GREENLAND_RECIPIENT_REGIONS={len(moved_by_target)}')
    print(f'AFFECTED_FOOTPRINT_DELTA_FRACTION={delta_fraction:.3e}')


if __name__ == '__main__':
    main()
