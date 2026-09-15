#!/usr/bin/env python3
"""Run the shared sea-region builder with the global open-ocean plan."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'tools' / 'build-sea-expansion-v2.py'
spec = importlib.util.spec_from_file_location('sea_v2', MODULE)
sea_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sea_v2)
sea_v2.PLAN = ROOT / 'tools' / 'global-ocean-sea-plan-v1.json'

if __name__ == '__main__':
    sea_v2.main()
