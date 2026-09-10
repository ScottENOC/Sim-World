#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# ---- Add Germany + Low Countries to the additive map plan ----
region_path = ROOT / 'tools' / 'map-region-plan-v2.json'
plan = json.loads(region_path.read_text())
append_only = list(plan.get('appendOnlyCountriesWhenRebased', []))
for iso in ('CHE', 'DEU', 'NLD', 'BEL', 'LUX'):
    if iso not in append_only:
        append_only.append(iso)
plan['appendOnlyCountriesWhenRebased'] = append_only

new_countries = [
    {'iso':'DEU','name':'Germany','level':'ADM1','targetRegions':12},
    {'iso':'NLD','name':'Netherlands','level':'ADM1','targetRegions':4,'minAreaSqKm':150,'minLongitude':3.0},
    {'iso':'BEL','name':'Belgium','level':'ADM1','targetRegions':3,'minAreaSqKm':150},
    {'iso':'LUX','name':'Luxembourg','level':'ADM0','targetRegions':1,'minAreaSqKm':100},
]
existing = {c['iso'] for c in plan['countries']}
insert_at = next((i + 1 for i, c in enumerate(plan['countries']) if c['iso'] == 'ISL'), len(plan['countries']))
for country in new_countries:
    if country['iso'] not in existing:
        plan['countries'].insert(insert_at, country)
        insert_at += 1
        existing.add(country['iso'])
region_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')

# ---- Coarse physical endowments, not historical bonuses ----
resource_path = ROOT / 'tools' / 'map-resource-plan-v2.json'
resources = json.loads(resource_path.read_text())
defaults = resources['defaultsByISO']
defaults.setdefault('DEU', {
    'landQuality':1.12,'forestFraction':0.48,'forestStartCoverage':0.82,
    'deposits':{'stone':'major','ironOre':'moderate','salt':'moderate','silver':'minor','lead':'minor'}
})
defaults.setdefault('NLD', {
    'landQuality':1.28,'forestFraction':0.20,'forestStartCoverage':0.68,
    'deposits':{'stone':'minor','ironOre':'minor','salt':'minor'}
})
defaults.setdefault('BEL', {
    'landQuality':1.18,'forestFraction':0.42,'forestStartCoverage':0.78,
    'deposits':{'stone':'moderate','ironOre':'minor','lead':'minor'}
})
defaults.setdefault('LUX', {
    'landQuality':1.00,'forestFraction':0.54,'forestStartCoverage':0.84,
    'deposits':{'stone':'moderate','ironOre':'moderate'}
})
resource_path.write_text(json.dumps(resources, ensure_ascii=False, indent=2) + '\n')

# ---- Fix compositor preview without moving the D3 touch target itself ----
renderer_path = ROOT / 'js' / 'ui' / 'mapRenderer.js'
s = renderer_path.read_text()

old = """    this._lastRenderedTransform = d3.zoomIdentity;\n    this._gesturePreviewActive = false;\n\n    this._resize();\n"""
new = """    this._lastRenderedTransform = d3.zoomIdentity;\n    this._gesturePreviewActive = false;\n    this._gesturePreviewBaseTransform = d3.zoomIdentity;\n    this._gesturePreview = document.createElement('canvas');\n    this._gesturePreview.setAttribute('aria-hidden', 'true');\n    Object.assign(this._gesturePreview.style, {\n      position: 'absolute', inset: '0', width: '100%', height: '100%',\n      pointerEvents: 'none', display: 'none', transformOrigin: '0 0',\n    });\n    this.canvas.insertAdjacentElement('afterend', this._gesturePreview);\n    this._gesturePreviewCtx = this._gesturePreview.getContext('2d');\n\n    this._resize();\n"""
assert old in s, 'constructor gesture-preview anchor not found'
s = s.replace(old, new, 1)

old = """  _applyGesturePreview(nextTransform) {\n    // Immediate compositor-only feedback: move/scale the already-painted\n    // canvas while the expensive accurate map redraw waits for gesture end.\n    const base = this._lastRenderedTransform || d3.zoomIdentity;\n    const scale = nextTransform.k / Math.max(0.0001, base.k);\n    const x = nextTransform.x - base.x * scale;\n    const y = nextTransform.y - base.y * scale;\n    this.canvas.style.transformOrigin = '0 0';\n    this.canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;\n    this.canvas.style.willChange = 'transform';\n    this._gesturePreviewActive = true;\n  }\n\n  _clearGesturePreview() {\n    if (!this._gesturePreviewActive) return;\n    this.canvas.style.transform = '';\n    this.canvas.style.transformOrigin = '';\n    this.canvas.style.willChange = '';\n    this._gesturePreviewActive = false;\n  }\n"""
new = """  _captureGesturePreview() {\n    // Snapshot the last accurate frame onto a non-interactive sibling canvas.\n    // D3 continues measuring touches against the real canvas, whose bounds stay\n    // completely fixed throughout the gesture. This avoids an iOS feedback loop\n    // where scaling the input element also changes the coordinates of the fingers.\n    const preview = this._gesturePreview;\n    const ctx = this._gesturePreviewCtx;\n    if (!preview || !ctx) return;\n    if (preview.width !== this.canvas.width) preview.width = this.canvas.width;\n    if (preview.height !== this.canvas.height) preview.height = this.canvas.height;\n    ctx.setTransform(1, 0, 0, 1, 0, 0);\n    ctx.clearRect(0, 0, preview.width, preview.height);\n    ctx.drawImage(this.canvas, 0, 0);\n    this._gesturePreviewBaseTransform = this._lastRenderedTransform || d3.zoomIdentity;\n    preview.style.transform = '';\n    preview.style.display = 'block';\n    preview.style.willChange = 'transform';\n    this.canvas.style.opacity = '0';\n    this._gesturePreviewActive = true;\n  }\n\n  _applyGesturePreview(nextTransform) {\n    if (!this._gesturePreviewActive) this._captureGesturePreview();\n    if (!this._gesturePreviewActive) return;\n    const base = this._gesturePreviewBaseTransform || d3.zoomIdentity;\n    const scale = nextTransform.k / Math.max(0.0001, base.k);\n    const x = nextTransform.x - base.x * scale;\n    const y = nextTransform.y - base.y * scale;\n    this._gesturePreview.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;\n  }\n\n  _clearGesturePreview() {\n    if (!this._gesturePreviewActive) return;\n    this._gesturePreview.style.transform = '';\n    this._gesturePreview.style.willChange = '';\n    this._gesturePreview.style.display = 'none';\n    this.canvas.style.opacity = '';\n    this._gesturePreviewActive = false;\n  }\n"""
assert old in s, 'old direct-canvas gesture preview not found'
s = s.replace(old, new, 1)

old = """      .on('start', () => {\n        this._isInteracting = true;\n        this.onInteraction();\n      })\n"""
new = """      .on('start', () => {\n        this._isInteracting = true;\n        this._captureGesturePreview();\n        this.onInteraction();\n      })\n"""
assert old in s, 'zoom start anchor not found'
s = s.replace(old, new, 1)

renderer_path.write_text(s)
print('Applied Germany/Low Countries map plan and stable sibling-canvas pinch preview')
