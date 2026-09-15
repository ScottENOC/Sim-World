#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'js' / 'military' / 'strategicPlanning.js'
text = path.read_text()
text = text.replace('  const previousTarget = strategy.targetRegionId;\n', '', 1)
old = '  const postureChanged = strategy.posture !== previousPosture || strategy.targetRegionId !== previousTarget;'
new = '  const postureChanged = strategy.posture !== previousPosture;'
if new in text:
    path.write_text(text)
    raise SystemExit(0)
if old not in text:
    raise SystemExit('target-change replan line not found')
path.write_text(text.replace(old, new, 1))
