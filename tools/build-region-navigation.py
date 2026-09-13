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
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data' / 'world' / 'regions.geo.json'
OUT_PATH = ROOT / 'data' / 'world' / 'region-navigation.json'
ADMIN0_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
USER_AGENT = 'Sim-World country navigation/1.0'

# Player-facing names follow current Australian DFAT usage where Natural Earth
# uses a formal state name or an older English label.
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
    'Republic of Kosovo': 'Kosovo',
    'Kosovo': 'Kosovo',
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
    'CHN':'Asia','MNG':'Asia','EGY':'Africa','LBY':'Africa','TUN':'Africa',
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


def main():
    geo = json.loads(GEO_PATH.read_text())
    admin0 = fetch_json(ADMIN0_URL)
    countries = []
    country_geoms = []
    for feature in admin0.get('features', []):
        name = clean_name(feature)
        if not name:
            continue
        if name in {'Somaliland', 'Western Sahara', 'Northern Cyprus'}:
            continue
        geom = shape(feature['geometry'])
        if geom.is_empty:
            continue
        countries.append({'name': name, 'continent': admin_continent(feature), 'feature': feature})
        country_geoms.append(geom)
    tree = STRtree(country_geoms)

    nav = {}
    country_names = set()
    multi_country = 0
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
        for _, country in sorted(hits, key=lambda item: (-item[0], item[1]['name'])):
            key = (continent, country['name'])
            if key in seen:
                continue
            seen.add(key)
            memberships.append({'continent': continent, 'country': country['name']})
            country_names.add(country['name'])
        if not memberships:
            memberships = [{'continent': continent, 'country': 'Other'}]
        if len({m['country'] for m in memberships}) > 1:
            multi_country += 1
        nav[rid] = memberships

    doc = {
        'schemaVersion': 1,
        'purpose': 'Player navigation only; does not define simulation sovereignty or region borders.',
        'regions': nav,
        'countries': sorted(country_names),
        'regionCount': len(nav),
        'multiCountryRegionCount': multi_country,
    }
    OUT_PATH.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"NAVIGATION_REGIONS={len(nav)}")
    print(f"NAVIGATION_COUNTRIES={len(country_names)}")
    print(f"MULTI_COUNTRY_REGIONS={multi_country}")


if __name__ == '__main__':
    main()
