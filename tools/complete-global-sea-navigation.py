#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'js' / 'world' / 'chokepoints.js'
text = PATH.read_text()
replacements = [
    ("  ['sea_english_channel', 'sea_north'], ['sea_biscay', 'sea_portuguese'],",
     "  ['sea_english_channel', 'sea_north'], ['sea_biscay', 'sea_portuguese'],\n  ['sea_baltic', 'sea_gulf_finland'], ['sea_baltic', 'sea_gulf_bothnia'],"),
    ("  ['sea_south_china', 'sea_gulf_thailand'], ['sea_south_china', 'sea_philippine'],",
     "  ['sea_south_china', 'sea_gulf_thailand'], ['sea_south_china', 'sea_gulf_tonkin'],\n  ['sea_south_china', 'sea_philippine'],"),
    ("  ['sea_east_china', 'sea_yellow'], ['sea_yellow', 'sea_korea_strait'],",
     "  ['sea_east_china', 'sea_yellow'], ['sea_yellow', 'sea_bohai'],\n  ['sea_yellow', 'sea_korea_strait'],"),
]
for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'patch anchor not found: {old}')
    text = text.replace(old, new, 1)
PATH.write_text(text)
