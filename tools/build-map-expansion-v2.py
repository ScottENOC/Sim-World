#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'tools' / 'map-region-plan-v2.json'
RESOURCE_PLAN = ROOT / 'tools' / 'map-resource-plan-v2.json'
BASE_GEO = ROOT / 'data' / 'world' / 'regions.geo.json'
BASE_META = ROOT / 'data' / 'world' / 'regions.meta.json'
BASE_RESOURCES = ROOT / 'data' / 'world' / 'resources.initial.json'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOB_API = 'https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/'
GEOD = Geod(ellps='WGS84')
USER_AGENT = 'Sim-World Europe Middle East expansion/2.0'
ADJ_TOL = 0.025
COUNTRY_CODE_KEYS = ('ADM0_A3','ISO_A3','SOV_A3','SU_A3','GU_A3','BRK_A3','ADM0_A3_IS')
COUNTRY_ALIASES = {'PSE': {'PSE','PSX'}}


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def repair(g):
    if g.is_empty:
        return g
    return g if g.is_valid else g.buffer(0)


def clean(g):
    g = repair(g)
    return repair(g.simplify(0.01, preserve_topology=True)) if not g.is_empty else g


def area_sqkm(g):
    if g.is_empty:
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(g)
    return abs(area) / 1_000_000.0


def stable_id(iso, name):
    digest = hashlib.sha1(f'expansion-v2|{iso}|{name}'.encode('utf-8')).hexdigest()[:11]
    return f'r2_{digest}'


def feature_name(f):
    p = f.get('properties') or {}
    for k in ('shapeName','name','NAME_1','name_en','gn_name'):
        if p.get(k) not in (None, ''):
            return str(p[k])
    return 'Unnamed'


def country_masks(admin0, wanted):
    parts = {iso: [] for iso in wanted}
    for f in admin0.get('features', []):
        p = f.get('properties') or {}
        codes = {str(p.get(k,'')).upper() for k in COUNTRY_CODE_KEYS if p.get(k)}
        g = repair(shape(f['geometry']))
        for iso in wanted:
            accepted = {iso} | COUNTRY_ALIASES.get(iso, set())
            if codes & accepted:
                parts[iso].append(g)
    out = {}
    for iso, geoms in parts.items():
        if geoms:
            out[iso] = repair(unary_union(geoms))
    return out


def absorb_microstates(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    changed = []
    for spec in specs:
        micro = masks.get(spec['iso'])
        if micro is None or micro.is_empty:
            print(f"MICROSTATE_WARN missing geometry {spec['iso']}")
            continue
        best = None
        for f in base_geo:
            g = repair(shape(f['geometry']))
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.05 else 0
            score = (shared > 0, shared, -d)
            if best is None or score > best[0]:
                best = (score, f, g)
        if best is None:
            continue
        _, f, g = best
        merged = repair(unary_union([g, micro]))
        f['geometry'] = mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = area_sqkm(merged)
        changed.append((spec['iso'], f['properties'].get('name')))
        print(f"MICROSTATE_ABSORB {spec['iso']} -> {f['properties'].get('name')}")
    return changed


def source_features(country, mask, existing_coverage):
    iso = country['iso']
    level = country.get('level', 'ADM1')
    meta = fetch_json(GEOB_API.format(iso=iso, level=level))
    url = meta.get('simplifiedGeometryGeoJSON') or meta.get('gjDownloadURL')
    if not url:
        raise RuntimeError(f'{iso}: geoBoundaries returned no GeoJSON URL')
    geo = fetch_json(url)
    min_area = float(country.get('minAreaSqKm', 400))
    max_lon = country.get('maxCentroidLongitude')
    lon_clip = box(-180, -90, float(max_lon), 90) if max_lon is not None else None
    pieces = []
    for f in geo.get('features', []):
        name = feature_name(f)
        g = clean(shape(f['geometry']))
        if mask is not None:
            g = repair(g.intersection(mask))
        if lon_clip is not None:
            g = repair(g.intersection(lon_clip))
        if g.is_empty:
            continue
        # The v2 builder is additive: existing simulated geography always wins.
        g = repair(g.difference(existing_coverage))
        if g.is_empty:
            continue
        # Drop tiny border slivers caused by source-dataset disagreement.
        if area_sqkm(g) < min_area:
            continue
        pieces.append({'geometry': g, 'names': [name], 'anchor': name, 'anchorArea': area_sqkm(g)})
    return pieces


def cluster_regions(pieces, target):
    clusters = list(pieces)
    target = max(1, min(int(target), len(clusters))) if clusters else 0
    while len(clusters) > target:
        best = None
        for i in range(len(clusters)):
            a = clusters[i]
            for j in range(i + 1, len(clusters)):
                b = clusters[j]
                d = a['geometry'].distance(b['geometry'])
                touching = d <= 0.04
                combined = area_sqkm(a['geometry']) + area_sqkm(b['geometry'])
                # Prefer contiguous neighbours; among them merge smaller geographic units first.
                score = (0 if touching else 1, d, combined)
                if best is None or score < best[0]:
                    best = (score, i, j)
        _, i, j = best
        a, b = clusters[i], clusters[j]
        g = repair(unary_union([a['geometry'], b['geometry']]))
        anchor = a if a['anchorArea'] >= b['anchorArea'] else b
        merged = {
            'geometry': g,
            'names': sorted(set(a['names'] + b['names']), key=str.casefold),
            'anchor': anchor['anchor'],
            'anchorArea': anchor['anchorArea'],
        }
        clusters.pop(j)
        clusters.pop(i)
        clusters.append(merged)
    return clusters


def make_game_regions(country, clusters):
    if not clusters:
        return []
    used = set()
    out = []
    for c in sorted(clusters, key=lambda x: (x['geometry'].centroid.y, x['geometry'].centroid.x), reverse=True):
        if len(clusters) == 1:
            name = country['name']
        elif len(c['names']) == 1:
            name = c['anchor']
        else:
            name = f"{c['anchor']} hinterland"
        base = name
        n = 2
        while name in used:
            name = f'{base} {n}'
            n += 1
        used.add(name)
        cen = c['geometry'].centroid
        out.append({
            'id': stable_id(country['iso'], name),
            'name': name,
            'sourceGroup': country['iso'],
            'sourceUnits': c['names'],
            'geometry': c['geometry'],
            'centroid': [cen.x, cen.y],
            'areaSqKm': area_sqkm(c['geometry']),
            'neighbors': [],
        })
    return out


def add_land_adjacency(base_features, base_meta, new_regions):
    base_geom = {f['properties']['id']: repair(shape(f['geometry'])) for f in base_features}
    meta_by_id = {m['id']: m for m in base_meta}
    for i, r in enumerate(new_regions):
        g = r['geometry']
        for j in range(i + 1, len(new_regions)):
            o = new_regions[j]
            if g.distance(o['geometry']) <= ADJ_TOL:
                r['neighbors'].append(o['id'])
                o['neighbors'].append(r['id'])
        minx, miny, maxx, maxy = g.bounds
        for oid, og in base_geom.items():
            ominx, ominy, omaxx, omaxy = og.bounds
            if omaxx < minx-ADJ_TOL or ominx > maxx+ADJ_TOL or omaxy < miny-ADJ_TOL or ominy > maxy+ADJ_TOL:
                continue
            if g.distance(og) <= ADJ_TOL:
                r['neighbors'].append(oid)
                m = meta_by_id.get(oid)
                if m is not None:
                    m.setdefault('neighbors', []).append(r['id'])
    for r in new_regions:
        r['neighbors'] = sorted(set(r['neighbors']))
    for m in base_meta:
        m['neighbors'] = sorted(set(m.get('neighbors', [])))


METAL_CLASSES = {
    'minor': (40_000, 160_000, 600_000, 30, 100, 400),
    'moderate': (150_000, 600_000, 2_400_000, 80, 280, 1200),
    'major': (500_000, 2_000_000, 8_000_000, 220, 750, 3200),
    'very_major': (1_300_000, 5_200_000, 20_000_000, 520, 1700, 7000),
}
IRON_CLASSES = {
    'minor': (2_000_000, 6_000_000, 20_000_000, 180, 700, 2500),
    'moderate': (8_000_000, 24_000_000, 80_000_000, 650, 2500, 9000),
    'major': (20_000_000, 60_000_000, 200_000_000, 1500, 6000, 22000),
    'very_major': (50_000_000, 150_000_000, 500_000_000, 3500, 14000, 50000),
}
QUARRY_CLASSES = {'minor':20_000_000,'moderate':90_000_000,'major':250_000_000,'very_major':700_000_000}
SALT_CLASSES = {'minor':2_000_000,'moderate':8_000_000,'major':30_000_000,'very_major':100_000_000}


def make_deposit(resource, magnitude):
    if resource in ('stone','fineStone'):
        stock = QUARRY_CLASSES[magnitude]
        return {'tiers':[{'id':'quarry','label':'Prestige stone quarry' if resource == 'fineStone' else 'Quarrying',
          'initialStock':stock,'difficulty':0.32 if resource == 'fineStone' else 0.30,'requiredTechId':None,
          'maxWorkers':max(60, round(stock/40000))}]}
    if resource == 'salt':
        stock = SALT_CLASSES[magnitude]
        return {'tiers':[{'id':'surface','label':'Salt flats & shallow deposits','initialStock':stock,
          'difficulty':0.30,'requiredTechId':None,'maxWorkers':max(30,round(stock/50000))}]}
    spec = IRON_CLASSES[magnitude] if resource == 'ironOre' else METAL_CLASSES[magnitude]
    surface, shaft, deep, sw, shw, dw = spec
    labels = {
        'ironOre':'Surface iron workings','copper':'Surface copper workings','tin':'Cassiterite placers',
        'gold':'Alluvial gold & shallow veins','silver':'Shallow silver-bearing ores','lead':'Shallow lead-bearing ores'
    }
    return {'tiers':[
      {'id':'surface','label':labels.get(resource, f'Surface {resource} workings'),'initialStock':surface,'difficulty':0.45,'requiredTechId':None,'maxWorkers':sw},
      {'id':'shaft','label':'Shaft mining','initialStock':shaft,'difficulty':0.60,'requiredTechId':'shaft_mining','maxWorkers':shw},
      {'id':'deep','label':'Deep mining (below water table)','initialStock':deep,'difficulty':0.75,'requiredTechId':'mine_drainage','maxWorkers':dw},
    ]}


def resource_endowment(region, plan):
    profile = plan['defaultsByISO'].get(region['sourceGroup'])
    if profile is None:
        raise RuntimeError(f"No resource default for {region['sourceGroup']}:{region['name']}")
    return {
      'landQuality': profile['landQuality'],
      'forestFraction': profile['forestFraction'],
      'forestStartCoverage': profile['forestStartCoverage'],
      'deposits': {k: make_deposit(k,v) for k,v in profile.get('deposits',{}).items()},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='/tmp/simworld-map-expansion-v2')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text())
    resource_plan = json.loads(RESOURCE_PLAN.read_text())
    base_geo = json.loads(BASE_GEO.read_text())
    base_meta_doc = json.loads(BASE_META.read_text())
    base_resources = json.loads(BASE_RESOURCES.read_text())
    if len(base_geo.get('features', [])) != plan['targetExistingRegionCount']:
        raise RuntimeError(f"Base map has {len(base_geo.get('features', []))} regions; v2 expected {plan['targetExistingRegionCount']}")

    wanted = {c['iso'] for c in plan['countries']} | {m['iso'] for m in plan.get('microstateAbsorption', [])}
    admin0 = fetch_json(ADMIN0_URL)
    masks = country_masks(admin0, wanted)
    absorb_microstates(base_geo['features'], base_meta_doc['regions'], masks, plan.get('microstateAbsorption', []))

    existing = repair(unary_union([repair(shape(f['geometry'])) for f in base_geo['features']]))
    all_new = []
    for country in plan['countries']:
        mask = masks.get(country['iso'])
        pieces = source_features(country, mask, existing)
        if not pieces:
            print(f"COUNTRY_SKIP {country['iso']} already covered or no substantial uncovered land")
            continue
        clusters = cluster_regions(pieces, country['targetRegions'])
        regions = make_game_regions(country, clusters)
        print(f"COUNTRY {country['iso']} sourcePieces={len(pieces)} gameRegions={len(regions)} uncoveredArea={sum(r['areaSqKm'] for r in regions):.0f}")
        all_new.extend(regions)
        existing = repair(unary_union([existing] + [r['geometry'] for r in regions]))

    add_land_adjacency(base_geo['features'], base_meta_doc['regions'], all_new)
    ids = {f['properties']['id'] for f in base_geo['features']}
    for r in all_new:
        if r['id'] in ids:
            raise RuntimeError(f"Generated duplicate region id {r['id']}")
        ids.add(r['id'])
        base_geo['features'].append({'type':'Feature','properties':{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup']},'geometry':mapping(r['geometry'])})
        base_meta_doc['regions'].append({'id':r['id'],'name':r['name'],'centroid':r['centroid'],'areaSqKm':r['areaSqKm'],'neighbors':r['neighbors']})
        base_resources[r['id']] = resource_endowment(r, resource_plan)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out/'regions.geo.json').write_text(json.dumps(base_geo,ensure_ascii=False,separators=(',',':')))
    (out/'regions.meta.json').write_text(json.dumps(base_meta_doc,ensure_ascii=False,separators=(',',':')))
    (out/'resources.initial.json').write_text(json.dumps(base_resources,ensure_ascii=False,separators=(',',':')))
    review = [{'id':r['id'],'name':r['name'],'sourceGroup':r['sourceGroup'],'sourceUnits':r['sourceUnits'],
      'areaSqKm':round(r['areaSqKm'],1),'neighbors':len(r['neighbors'])} for r in all_new]
    (out/'v2-region-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
    isolated = [r['name'] for r in all_new if not r['neighbors']]
    print(f"BASE_REGIONS={plan['targetExistingRegionCount']}")
    print(f"NEW_REGIONS={len(all_new)}")
    print(f"TOTAL_REGIONS={len(base_geo['features'])}")
    print(f"ISOLATED_NEW_REGIONS={len(isolated)}")
    if isolated:
        print('ISOLATED_NAMES=' + ', '.join(isolated))


if __name__ == '__main__':
    main()
