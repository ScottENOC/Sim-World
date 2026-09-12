#!/usr/bin/env python3
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'build-sea-expansion-v2.py'
spec = importlib.util.spec_from_file_location('sea_builder_silk', MODULE_PATH)
sea = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sea)
sea.PLAN = ROOT / 'tools' / 'sea-region-plan-silk-road.json'

if __name__ == '__main__':
    sea.main()
