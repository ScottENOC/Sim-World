#!/usr/bin/env python3
"""Build player-facing continent -> modern country/economy -> simulation region navigation.

This file is UI metadata only. Simulation regions remain geography-first and may
belong to multiple modern-country navigation buckets when they cross present-day
boundaries.
"""
import json
import urllib.request
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data' / 'world' / 'regions.geo.json'
OUT_PATH = ROOT / 'data' / 'world' / 'region-navigation.json'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
ADMIN1_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson'
USER_AGENT = 'Sim-World country navigation/1.1'
FULLY_CONTAINED_THRESHOLD = 0.995

# Player-facing names follow current Australian DFAT usage where Natural Earth
# uses a formal state name or an older English label. Western Sahara is retained
# as an explicit player-navigation bucket even though its political status is
# disputed; this metadata does not define simulation sovereignty.
DISPLAY_OVERRIDES = {
    'Bahamas': 'The Bahamas',
    'Bosnia and Herz.': 'Bosnia and Herzegovina',
    'Brunei': 'Brunei Darussalam',
    'Cape Verde': 'Cabo Verde',
    'Czechia': 'Czech Republic',
    'Dem. Rep. Congo': 'Congo, Democratic Republic of the',
    'Democratic Republic of the Congo': 'Congo, Democratic Republic of the',
    'Dominican Rep.': 'Dominican Republic',
    'Eq. Guinea': 'Equatorial Guinea',
    'Gambia': 'The Gambia',
    'Ivory Coast': "Côte d'Ivoire",
    "People's Republic of China": 'China',
    'Republic of China': 'Taiwan',
    'Republic of India': 'India',
    'Kyrgyzstan': 'Kyrgyz Republic',
    'Macedonia': 'Republic of North Macedonia',
    'North Macedonia': 'Republic of North Macedonia',
    'North Korea': "Democratic People's Republic of Korea (North Korea)",
    'South Korea': 'Republic of Korea (South Korea)',
    'Republic of Korea': 'Republic of Korea (South Korea)',
    "Democratic People's Republic of Korea": "Democratic People's Republic of Korea (North Korea)",
    'Palestine': 'Palestine',
    'Slovakia': 'Slovak Republic',
    'Swaziland': 'Eswatini',
    'Taiwan': 'Taiwan',
    'Turkey': 'Türkiye',
    'Republic of Türkiye': 'Türkiye',
    'United Kingdom': 'United Kingdom',
    'United States of America': 'United States of America',
    'United States': 'United States of America',
    'Vatican': 'The Holy See',
    'Vatican City': 'The Holy See',
}

PHYSICAL_CONTINENT_BY_PREFIX = {
    'af_': 'Africa', 'ar_': 'Asia', 'ca_': 'Asia', 'na_': 'Asia', 'sa_': 'Asia',
    'se_': 'Asia', 'ea_': 'Asia', 'mi_': 'Asia', 'au_': 'Oceania',
    'nz_': 'Oceania', 'pac_': 'Oceania',
}
LEGACY_CONTINENT = {
    'GBR-ENG':'Europe','GBR-WLS':'Europe','GBR-SCT':'Europe','FRA':'Europe','ESP':'Europe',
    'PRT':'Europe','IRL':'Europe','GIB':'Europe','AND':'Europe','IMN':'Europe','JEY':'Europe',
    'GGY':'Europe','ITA':'Europe','GRC':'Europe','ALB':'Europe','MKD':'Europe','BGR':'Europe',
    'SRB':'Europe','MNE':'Europe','BIH':'Europe','HRV':'Europe','TUR':'Asia','CYP':'Asia',
    'SYR':'Asia','LBN':'Asia','ISR':'Asia','PSE':'Asia','JOR':'Asia','IRQ':'Asia','IRN':'Asia',
    'KAZ':'Asia','TKM':'Asia','UZB':'Asia','KGZ':'Asia','TJK':'Asia','AFG':'Asia','PAK':'Asia',
    'CHN':'Asia','MNG':'Asia','EGY':'Africa','LBY':'Africa','TUN':'Africa','KOS':'Europe','XKX':'Europe',
}


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def clean_name(feature):
    p = feature.get('properties') or {}
    raw = str(p.get('NAME_EN') or p.get('ADMIN') or p.get('NAME') or p.get('name') or '').strip()
    return DISPLAY_OVERRIDES.get(raw, raw)


def admin_continent(feature):
    p = feature.get('properties') or {}
    c = str(p.get('CONTINENT') or '').strip()
    if c == 'North America': return 'North America'
    if c == 'South America': return 'South America'
    if c in {'Africa','Asia','Europe','Oceania'}: return c
    return 'Other'


def region_continent(feature, fallback):
    p = feature.get('properties') or {}
    explicit = p.get('navigationContinent')
    if explicit == 'Greenland': return 'North America'
    if explicit in {'Africa','Asia','Europe','Oceania','North America','South America'}:
        return explicit
    source = str(p.get('sourceGroup') or '')
    if source in LEGACY_CONTINENT:
        if source == 'ESP' and p.get('name') in {'Ceuta','Melilla'}: return 'Africa'
        return LEGACY_CONTINENT[source]
    if source == 'ow_greenland': return 'North America'
    for prefix, continent in PHYSICAL_CONTINENT_BY_PREFIX.items():
        if source.startswith(prefix): return continent
    return fallback


def is_kosovo_admin1(feature):
    p = feature.get('properties') or {}
    codes = {str(p.get(key) or '').upper() for key in (
        'adm0_a3','ADM0_A3','sov_a3','SOV_A3','gu_a3','GU_A3','iso_a2','ISO_A2'
    )}
    if codes & {'KOS','XKX','KVX','XK'}:
        return True
    values = ' '.join(str(v) for v in p.values() if v is not None).lower()
    return 'kosovo' in values


def kosovo_geometry():
    """Explicit navigation exception because Natural Earth admin-0 can fold Kosovo into Serbia."""
    admin1 = fetch_json(ADMIN1_URL)
    parts = []
    for feature in admin1.get('features', []):
        if not is_kosovo_admin1(feature):
            continue
        geom = shape(feature['geometry'])
        if not geom.is_empty:
            parts.append(geom)
    if not parts:
        raise RuntimeError('Could not resolve Kosovo navigation boundary from Natural Earth Admin-1')
    geom = unary_union(parts)
    print(f'KOSOVO_ADMIN1_PARTS={len(parts)}')
    return geom


def main():
    geo = json.loads(GEO_PATH.read_text())
    admin0 = fetch_json(ADMIN0_URL)
    countries = []
    country_geoms = []
    for feature in admin0.get('features', []):
        name = clean_name(feature)
        if not name:
            continue
        # These are not separate player-navigation countries here. Western
        # Sahara is intentionally *not* excluded: regions intersecting it must
        # be discoverable under Africa -> Western Sahara, while border-crossing
        # regions can remain discoverable under neighbouring countries too.
        if name in {'Somaliland', 'Northern Cyprus', 'Kosovo'}:
            continue
        geom = shape(feature['geometry'])
        if geom.is_empty:
            continue
        countries.append({'name': name, 'continent': admin_continent(feature)})
        country_geoms.append(geom)
    tree = STRtree(country_geoms)
    kosovo = kosovo_geometry()

    nav = {}
    country_names = {'Kosovo'}
    multi_country = 0
    kosovo_regions = []
    kosovo_exclusive_regions = []
    western_sahara_regions = []

    for feature in geo.get('features', []):
        props = feature.get('properties') or {}
        rid = props.get('id')
        if not rid:
            continue
        geom = shape(feature['geometry'])
        memberships = []
        seen = set()
        fallback_continent = 'Other'
        best_area = -1.0
        hits = []
        for raw_idx in tree.query(geom):
            idx = int(raw_idx)
            intersection = geom.intersection(country_geoms[idx])
            if intersection.is_empty or intersection.area <= 1e-10:
                continue
            area = intersection.area
            hits.append((area, countries[idx]))
            if area > best_area:
                best_area = area
                fallback_continent = countries[idx]['continent']

        continent = region_continent(feature, fallback_continent)
        for area, country in sorted(hits, key=lambda item: (-item[0], item[1]['name'])):
            # Natural Earth's Western Sahara polygon is Africa; force that
            # player-facing continent even if old physical-zone metadata was
            # missing or malformed for the simulation region.
            membership_continent = 'Africa' if country['name'] == 'Western Sahara' else continent
            key = (membership_continent, country['name'])
            if key in seen:
                continue
            seen.add(key)
            memberships.append({'continent': membership_continent, 'country': country['name']})
            country_names.add(country['name'])
            if country['name'] == 'Western Sahara':
                western_sahara_regions.append({'id': rid, 'name': props.get('name', rid), 'overlapArea': round(area, 8)})

        # Kosovo is deliberately handled outside the admin-0 index. If a
        # simulation region is effectively wholly inside Kosovo, Kosovo replaces
        # neighbouring-country navigation. If the simulation region crosses the
        # modern border, Kosovo is an additional route to that same region.
        kosovo_overlap = geom.intersection(kosovo)
        if not kosovo_overlap.is_empty and kosovo_overlap.area > 1e-10:
            region_area = max(geom.area, 1e-12)
            coverage = kosovo_overlap.area / region_area
            kosovo_regions.append({'id': rid, 'name': props.get('name', rid), 'coverage': round(coverage, 6)})
            if coverage >= FULLY_CONTAINED_THRESHOLD:
                memberships = [{'continent': 'Europe', 'country': 'Kosovo'}]
                kosovo_exclusive_regions.append(rid)
            elif ('Europe', 'Kosovo') not in seen:
                memberships.append({'continent': 'Europe', 'country': 'Kosovo'})

        if not memberships:
            memberships = [{'continent': continent, 'country': 'Other'}]
        if len({m['country'] for m in memberships}) > 1:
            multi_country += 1
        nav[rid] = memberships

    if not kosovo_regions:
        raise RuntimeError('Kosovo picker exception did not match any simulation regions')
    if not western_sahara_regions:
        raise RuntimeError('Western Sahara navigation bucket did not match any simulation regions')

    doc = {
        'schemaVersion': 2,
        'purpose': 'Player navigation only; does not define simulation sovereignty or region borders.',
        'regions': nav,
        'countries': sorted(country_names),
        'regionCount': len(nav),
        'multiCountryRegionCount': multi_country,
        'manualNavigationExceptions': {
            'Kosovo': {
                'rule': 'Natural Earth Admin-1 boundary; fully-contained simulation regions are Kosovo-only, partial overlaps remain many-to-many.',
                'regions': kosovo_regions,
                'exclusiveRegionIds': kosovo_exclusive_regions,
            },
            'Western Sahara': {
                'rule': 'Player-navigation bucket under Africa; simulation sovereignty remains independent of this modern navigation label.',
                'regions': western_sahara_regions,
            },
        },
    }
    OUT_PATH.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"NAVIGATION_REGIONS={len(nav)}")
    print(f"NAVIGATION_COUNTRIES={len(country_names)}")
    print(f"MULTI_COUNTRY_REGIONS={multi_country}")
    print(f"KOSOVO_REGIONS={len(kosovo_regions)}")
    print(f"WESTERN_SAHARA_REGIONS={len(western_sahara_regions)}")
    for item in kosovo_regions:
        print(f"KOSOVO_REGION {item['id']} {item['coverage']:.4f} {item['name']}")
    for item in western_sahara_regions:
        print(f"WESTERN_SAHARA_REGION {item['id']} {item['name']}")


if __name__ == '__main__':
    main()
