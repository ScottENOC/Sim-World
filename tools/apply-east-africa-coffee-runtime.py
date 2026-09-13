#!/usr/bin/env python3
"""Idempotently integrate coffee into trade/resources and pass simulation time."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    text = path.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:80]!r}')
    path.write_text(text.replace(old, new, 1))
    return True


def patch_trade_goods():
    path = ROOT / 'js' / 'economy' / 'tradeGoods.js'
    return replace_once(
        path,
        "  tea:        { label: 'Tea', basePrice: 9, referenceStock: 240, category: 'luxury', cargoKgPerUnit: 0.15 },\n",
        "  tea:        { label: 'Tea', basePrice: 9, referenceStock: 240, category: 'luxury', cargoKgPerUnit: 0.15 },\n"
        "  coffee:     { label: 'Coffee', basePrice: 13, referenceStock: 180, category: 'luxury', cargoKgPerUnit: 0.14 },\n"
    )


def patch_resource_types():
    path = ROOT / 'data' / 'world' / 'resourceTypes.json'
    doc = json.loads(path.read_text())
    if 'coffee' in doc:
        return False
    doc['coffee'] = {'category': 'cultivated_luxury', 'label': 'Coffee'}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    return True


def patch_labor():
    path = ROOT / 'js' / 'economy' / 'laborCore.js'
    return replace_once(
        path,
        "  tickFoodLuxuries(regions, elapsedDays);\n",
        "  tickFoodLuxuries(regions, elapsedDays, { currentDay: weatherDay, rng });\n"
    )


def main():
    changed = []
    for name, fn in [('trade goods', patch_trade_goods), ('resource types', patch_resource_types), ('economy time bridge', patch_labor)]:
        if fn(): changed.append(name)
    print('east africa coffee runtime applied: ' + (', '.join(changed) if changed else 'already current'))


if __name__ == '__main__':
    main()
