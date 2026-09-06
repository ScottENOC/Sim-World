from pathlib import Path

builder = Path('tools/build-map-expansion.py')
text = builder.read_text()
text = text.replace(
    "PLAN = ROOT / 'tools' / 'map-region-plan.json'\n",
    "PLAN = ROOT / 'tools' / 'map-region-plan.json'\nRESOURCE_PLAN = ROOT / 'tools' / 'map-resource-plan.json'\n"
)

old = '''def nearest_resource_template(centroid, base_meta, base_resources):
    best = None
    best_distance = float('inf')
    for m in base_meta:
        if m['id'] not in base_resources:
            continue
        d = haversine_km(centroid, m['centroid'])
        if d < best_distance:
            best_distance = d
            best = base_resources[m['id']]
    if best is None:
        raise RuntimeError('No existing resource templates available')
    return copy.deepcopy(best)


'''
new = '''DEPOSIT_CLASS_SPECS = {
    'copper': {
        'minor': (50000, 200000, 800000, 40, 120, 480),
        'moderate': (180000, 720000, 2700000, 90, 300, 1600),
        'major': (600000, 2400000, 9000000, 250, 800, 3500),
        'very_major': (1500000, 6000000, 24000000, 600, 1800, 8000),
    },
    'tin': {
        'trace': (5000, 20000, 80000, 12, 30, 100),
        'minor': (15000, 60000, 240000, 20, 60, 200),
        'moderate': (50000, 200000, 800000, 45, 140, 500),
        'major': (140000, 560000, 2200000, 100, 300, 1100),
        'very_major': (350000, 1400000, 5600000, 220, 700, 2500),
    },
    'gold': {
        'minor': (15000, 30000, 60000, 25, 80, 180),
        'moderate': (45000, 90000, 180000, 70, 180, 420),
        'major': (120000, 240000, 600000, 160, 420, 1000),
        'very_major': (300000, 600000, 1500000, 350, 900, 2200),
    },
    'ironOre': {
        'minor': (2000000, 6000000, 20000000, 180, 700, 2500),
        'moderate': (8000000, 24000000, 80000000, 650, 2500, 9000),
        'major': (20000000, 60000000, 200000000, 1500, 6000, 22000),
        'very_major': (50000000, 150000000, 500000000, 3500, 14000, 50000),
    },
    'stone': {
        'minor': (20000000,),
        'moderate': (90000000,),
        'major': (250000000,),
        'very_major': (700000000,),
    },
}


def make_deposit(resource_key, magnitude):
    try:
        spec = DEPOSIT_CLASS_SPECS[resource_key][magnitude]
    except KeyError as exc:
        raise RuntimeError(f'Unknown deposit class {resource_key}={magnitude!r}') from exc
    if resource_key == 'stone':
        return {'tiers': [{
            'id': 'quarry', 'label': 'Quarrying', 'initialStock': spec[0],
            'difficulty': 0.3, 'requiredTechId': None,
            'maxWorkers': max(80, round(spec[0] / 37500)),
        }]}
    surface, shaft, deep, surface_workers, shaft_workers, deep_workers = spec
    surface_label = {
        'gold': 'Alluvial placer gold & shallow veins',
        'ironOre': 'Surface outcrops & shallow iron workings',
        'copper': 'Surface outcrops & shallow copper workings',
        'tin': 'Cassiterite placers & shallow workings',
    }[resource_key]
    return {'tiers': [
        {'id':'surface','label':surface_label,'initialStock':surface,'difficulty':0.45,
         'requiredTechId':None,'maxWorkers':surface_workers},
        {'id':'shaft','label':'Shaft mining','initialStock':shaft,'difficulty':0.60,
         'requiredTechId':'shaft_mining','maxWorkers':shaft_workers},
        {'id':'deep','label':'Deep mining (below water table)','initialStock':deep,'difficulty':0.75,
         'requiredTechId':'mine_drainage','maxWorkers':deep_workers},
    ]}


def historical_resource_endowment(region, resource_plan):
    iso = region['sourceGroup']
    key = f"{iso}:{region['name']}"
    default = resource_plan.get('defaultsByISO', {}).get(iso)
    if default is None:
        raise RuntimeError(f'{key}: no default historical resource profile for source group')
    override = resource_plan.get('regions', {}).get(key, {})
    profile = {**default, **{k: v for k, v in override.items() if k != 'deposits'}}
    deposit_classes = override['deposits'] if 'deposits' in override else default.get('deposits', {})
    for field in ('landQuality', 'forestFraction', 'forestStartCoverage'):
        if field not in profile:
            raise RuntimeError(f'{key}: historical resource profile missing {field}')
    if profile['landQuality'] <= 0:
        raise RuntimeError(f'{key}: landQuality must be positive')
    if not 0 <= profile['forestFraction'] <= 1 or not 0 <= profile['forestStartCoverage'] <= 1:
        raise RuntimeError(f'{key}: forest fractions must be between zero and one')
    deposits = {resource: make_deposit(resource, magnitude)
                for resource, magnitude in deposit_classes.items()}
    return {
        'landQuality': profile['landQuality'],
        'forestFraction': profile['forestFraction'],
        'forestStartCoverage': profile['forestStartCoverage'],
        'deposits': deposits,
    }


'''
if old not in text:
    raise SystemExit('nearest-resource fallback block not found')
text = text.replace(old, new)
text = text.replace(
    "def write_outputs(out_dir, base_geo, base_meta_doc, base_resources, new_regions):",
    "def write_outputs(out_dir, base_geo, base_meta_doc, base_resources, new_regions, resource_plan):"
)
text = text.replace(
    "        base_resources[r['id']] = nearest_resource_template(r['centroid'], base_meta_doc['regions'][:-1], base_resources)",
    "        base_resources[r['id']] = historical_resource_endowment(r, resource_plan)"
)
text = text.replace(
    "    base_resources = json.loads(BASE_RESOURCES.read_text())\n",
    "    base_resources = json.loads(BASE_RESOURCES.read_text())\n    resource_plan = json.loads(RESOURCE_PLAN.read_text())\n"
)
text = text.replace(
    "    write_outputs(Path(args.output_dir), base_geo, base_meta_doc, base_resources, new_regions)",
    "    write_outputs(Path(args.output_dir), base_geo, base_meta_doc, base_resources, new_regions, resource_plan)"
)
builder.write_text(text)

extraction = Path('js/world/resources/extraction.js')
et = extraction.read_text()
et = et.replace(
'''// The static endowment file expresses relative geology. Calibration scales
// accessible tin here so the same map data can support an approximately
// eighty-year prosperous bronze economy before its shallow supply fails.
export const SURFACE_TIN_STOCK_MULTIPLIER = 5.5;
export const SURFACE_COPPER_STOCK_MULTIPLIER = 2;
''',
'''// Static endowments are the geology. Do not multiply deposits here to force
// a desired boom/collapse duration; if realistic supply produces the wrong
// macro-history, fix extraction, demand or trade rather than the map.
export const SURFACE_TIN_STOCK_MULTIPLIER = 1;
export const SURFACE_COPPER_STOCK_MULTIPLIER = 1;
''')
extraction.write_text(et)

workflow = Path('.github/workflows/build-map-expansion-preview.yml')
wt = workflow.read_text()
needle = "      - 'tools/map-region-plan.json'\n"
if "tools/map-resource-plan.json" not in wt:
    wt = wt.replace(needle, needle + "      - 'tools/map-resource-plan.json'\n")
workflow.write_text(wt)
