#!/usr/bin/env python3
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tools' / 'map-source-manifest.json'
OUTPUT = ROOT / 'tools' / 'map-source-inventory.json'
USER_AGENT = 'Sim-World map source inventory/1.0'


def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def feature_name(feature):
    props = feature.get('properties') or {}
    for key in ('shapeName', 'name', 'NAME_1', 'name_en', 'gn_name'):
        value = props.get(key)
        if value not in (None, ''):
            return str(value)
    return None


def main():
    manifest = json.loads(MANIFEST.read_text())
    api_template = manifest['defaultSource']['apiTemplate']
    inventory = {
        'version': 1,
        'generatedFromManifestVersion': manifest.get('version'),
        'countries': []
    }

    failures = []
    for entry in manifest['countries']:
        iso = entry['iso']
        api_url = api_template.format(iso=iso)
        row = {
            'iso': iso,
            'name': entry['name'],
            'tier': entry['tier'],
            'preferred': entry['preferred'],
            'notes': entry.get('notes', ''),
            'geoBoundariesApi': api_url,
        }
        try:
            meta = fetch_json(api_url)
            row.update({
                'boundaryID': meta.get('boundaryID'),
                'boundaryYearRepresented': meta.get('boundaryYearRepresented'),
                'boundaryCanonical': meta.get('boundaryCanonical'),
                'boundarySource': meta.get('boundarySource'),
                'boundaryLicense': meta.get('boundaryLicense'),
                'admUnitCountReported': int(meta['admUnitCount']) if str(meta.get('admUnitCount', '')).isdigit() else meta.get('admUnitCount'),
                'geojsonURL': meta.get('gjDownloadURL'),
                'simplifiedGeojsonURL': meta.get('simplifiedGeometryGeoJSON'),
                'topojsonURL': meta.get('tjDownloadURL'),
            })
            geometry_url = meta.get('simplifiedGeometryGeoJSON') or meta.get('gjDownloadURL')
            if geometry_url:
                geo = fetch_json(geometry_url)
                features = geo.get('features') or []
                row['featureCountDownloaded'] = len(features)
                row['units'] = sorted(filter(None, (feature_name(f) for f in features)), key=str.casefold)
                if features:
                    row['propertyKeys'] = sorted((features[0].get('properties') or {}).keys())
        except Exception as exc:
            row['error'] = f'{type(exc).__name__}: {exc}'
            failures.append(iso)
        inventory['countries'].append(row)
        print(f"{iso}: {row.get('featureCountDownloaded', row.get('admUnitCountReported', 'ERROR'))}")

    OUTPUT.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {OUTPUT}')
    if failures:
        print('Partial failures: ' + ', '.join(failures), file=sys.stderr)


if __name__ == '__main__':
    main()
