#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

# Ensure an idempotent rebase revisits Ukraine so the missing peninsula can be
# appended even though the rest of Ukraine is already represented.
plan_path=ROOT/'tools'/'map-region-plan-v2.json'
plan=json.loads(plan_path.read_text())
append=list(plan.get('appendOnlyCountriesWhenRebased',[]))
if 'UKR' not in append:
    append.append('UKR')
plan['appendOnlyCountriesWhenRebased']=append
plan_path.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')

# Natural Earth currently places UA-43 and UA-40 under RUS in adm0_a3. For this
# game the country hierarchy is a geographic picker, not a statement of modern
# sovereignty. Use their UA subdivision codes so the peninsula cannot fall
# between the RUS and UKR clipping masks, and merge Sevastopol into Crimea.
fast=ROOT/'tools'/'build-map-expansion-v2-fast.py'
s=fast.read_text()
old="""def country_masks_with_hosts(admin0, wanted):\n    expanded = set(wanted)\n    for iso in list(wanted):\n        if iso in HOST_ISO:\n            expanded.add(HOST_ISO[iso])\n        expanded.update(ALIASES.get(iso, set()))\n    return original_country_masks(admin0, expanded)\n"""
new="""def country_masks_with_hosts(admin0, wanted):\n    expanded = set(wanted)\n    for iso in list(wanted):\n        if iso in HOST_ISO:\n            expanded.add(HOST_ISO[iso])\n        expanded.update(ALIASES.get(iso, set()))\n    masks = original_country_masks(admin0, expanded)\n    if 'UKR' in expanded:\n        crimea_parts = []\n        for f in natural_earth_admin1().get('features', []):\n            subdivision = str((f.get('properties') or {}).get('iso_3166_2') or '').upper()\n            if subdivision in {'UA-43', 'UA-40'}:\n                crimea_parts.append(map_v2.repair(shape(f['geometry'])))\n        if crimea_parts:\n            crimea = map_v2.repair(unary_union(crimea_parts))\n            if masks.get('UKR') is not None:\n                masks['UKR'] = map_v2.repair(unary_union([masks['UKR'], crimea]))\n            else:\n                masks['UKR'] = crimea\n            if masks.get('RUS') is not None:\n                masks['RUS'] = map_v2.repair(masks['RUS'].difference(crimea))\n            print('CRIMEA_GEOGRAPHIC_MASK=UKR UA-43+UA-40')\n    return masks\n"""
assert old in s, 'country mask hook not found'
s=s.replace(old,new,1)
old="""def feature_iso_codes(feature):\n    p = feature.get('properties') or {}\n    keys = ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3')\n    return {str(p.get(k,'')).upper() for k in keys if p.get(k)}\n"""
new="""def feature_iso_codes(feature):\n    p = feature.get('properties') or {}\n    subdivision = str(p.get('iso_3166_2') or '').upper()\n    if subdivision in {'UA-43', 'UA-40'}:\n        return {'UKR'}\n    keys = ('adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3')\n    return {str(p.get(k,'')).upper() for k in keys if p.get(k)}\n"""
assert old in s, 'feature ISO hook not found'
s=s.replace(old,new,1)
old="""        if not candidates and mask is not None:\n            candidates = [(country['name'], mask)]\n\n    pieces = []\n"""
new="""        if not candidates and mask is not None:\n            candidates = [(country['name'], mask)]\n\n    if iso == 'UKR':\n        crimea = [(name, geom) for name, geom in candidates if name.casefold() in {'crimea', 'sevastopol'}]\n        if crimea:\n            candidates = [(name, geom) for name, geom in candidates if name.casefold() not in {'crimea', 'sevastopol'}]\n            candidates.append(('Crimea', map_v2.repair(unary_union([geom for _, geom in crimea]))))\n\n    pieces = []\n"""
assert old in s, 'candidate merge hook not found'
s=s.replace(old,new,1)
fast.write_text(s)

# Existing seas pre-date some land additions. Reclip every existing sea against
# simulated land before adding/skipping planned seas, not merely against the
# external admin-0 land mask used for brand-new water polygons.
sea=ROOT/'tools'/'build-sea-expansion-v2.py'
s=sea.read_text()
old="""    global_land = repair(unary_union([repair(shape(f['geometry'])) for f in world_land.get('features', [])]))\n\n    feature_by_id = {f['properties']['id']: f for f in sea_geo.get('features', [])}\n    meta_by_id = {m['id']: m for m in sea_meta.get('seaRegions', [])}\n"""
new="""    global_land = repair(unary_union([repair(shape(f['geometry'])) for f in world_land.get('features', [])]))\n    simulated_land = occupied_geometry(land_geo.get('features', []))\n\n    feature_by_id = {f['properties']['id']: f for f in sea_geo.get('features', [])}\n    meta_by_id = {m['id']: m for m in sea_meta.get('seaRegions', [])}\n    if simulated_land is not None:\n        for sea_id, feature in feature_by_id.items():\n            old_water = repair(shape(feature['geometry']))\n            clipped = repair(old_water.difference(simulated_land))\n            if clipped.is_empty or area_sqkm(clipped) < 100:\n                raise RuntimeError(f'{sea_id}: simulated-land clipping consumed sea region')\n            if not clipped.equals(old_water):\n                feature['geometry'] = mapping(clipped)\n                meta = meta_by_id.get(sea_id)\n                if meta is not None:\n                    update_meta_geometry(meta, clipped)\n                removed = max(0.0, area_sqkm(old_water) - area_sqkm(clipped))\n                print(f'SEA_RECLIP {sea_id} removedLandOverlap={removed:.1f} km²')\n"""
assert old in s, 'sea clipping hook not found'
s=s.replace(old,new,1)
sea.write_text(s)

# The finalisation helper is temporary, but let it patch the durable broad-map
# workflow to the final 647-region baseline after Crimea is restored.
finalise=ROOT/'tools'/'finalise-western-europe-map.py'
if finalise.exists():
    f=finalise.read_text().replace('expected polished 646-region map','expected polished 647-region map').replace('assert len(ids)==646','assert len(ids)==647')
    finalise.write_text(f)

print('Prepared durable Crimea geographic classification and sea re-clipping')
