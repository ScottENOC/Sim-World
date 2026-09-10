from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# --- Remove the accidental Chukotka runtime region and all exact-id references. ---
meta_path = ROOT / 'data/world/regions.meta.json'
meta = json.loads(meta_path.read_text())
chuk = [r for r in meta.get('regions', []) if 'chukot' in str(r.get('name','')).lower()]
if len(chuk) != 1:
    raise SystemExit(f'Expected exactly one Chukotka region, found {len(chuk)}')
remove_id = chuk[0]['id']
print(f'REMOVING_CHUKOTKA={remove_id} {chuk[0].get("name")}')

def scrub(value):
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items() if k != remove_id and v != remove_id}
    if isinstance(value, list):
        out = []
        for item in value:
            if item == remove_id:
                continue
            if isinstance(item, dict) and (item.get('id') == remove_id or item.get('regionId') == remove_id):
                continue
            out.append(scrub(item))
        return out
    return value

meta['regions'] = [scrub(r) for r in meta.get('regions', []) if r.get('id') != remove_id]
meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n')

geo_path = ROOT / 'data/world/regions.geo.json'
geo = json.loads(geo_path.read_text())
geo['features'] = [f for f in geo.get('features', []) if f.get('properties', {}).get('id') != remove_id]
geo_path.write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')) + '\n')

for rel in ['data/world/resources.initial.json', 'data/world/terrain.initial.json', 'data/world/seaRegions.meta.json']:
    p = ROOT / rel
    doc = scrub(json.loads(p.read_text()))
    p.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')

# Prevent recurrence: European Russia needs BOTH a western and eastern longitude clip.
plan_path = ROOT / 'tools/map-region-plan-v2.json'
plan = json.loads(plan_path.read_text())
rus = next(c for c in plan['countries'] if c.get('iso') == 'RUS')
rus['minLongitude'] = 15.0
rus['maxCentroidLongitude'] = 62.5
plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')

fast_path = ROOT / 'tools/build-map-expansion-v2-fast.py'
text = fast_path.read_text()
old = """    max_lon = country.get('maxCentroidLongitude')\n    lon_clip = box(-180, -90, float(max_lon), 90) if max_lon is not None else None\n"""
new = """    min_lon = country.get('minLongitude')\n    max_lon = country.get('maxCentroidLongitude')\n    if min_lon is not None or max_lon is not None:\n        lon_clip = box(float(min_lon if min_lon is not None else -180), -90,\n                       float(max_lon if max_lon is not None else 180), 90)\n    else:\n        lon_clip = None\n"""
if old not in text:
    raise SystemExit('Russia longitude clipping anchor not found')
fast_path.write_text(text.replace(old, new, 1))

# --- UI renderer: coalesce redraws, cull offscreen geometry, and cheapen active interaction. ---
map_path = ROOT / 'js/ui/mapRenderer.js'
text = map_path.read_text()
text = text.replace(
"""  constructor(canvas, regions, { onSelect, seaRegions = [], isRegionVisible = () => true,\n    isSeaRegionVisible = () => true, getConflictPressure = () => 0 } = {}) {\n""",
"""  constructor(canvas, regions, { onSelect, seaRegions = [], isRegionVisible = () => true,\n    isSeaRegionVisible = () => true, getConflictPressure = () => 0, onInteraction = () => {} } = {}) {\n""", 1)
text = text.replace(
"""    this.getConflictPressure = getConflictPressure;\n    this.selectedId = null;\n""",
"""    this.getConflictPressure = getConflictPressure;\n    this.onInteraction = onInteraction;\n    this.selectedId = null;\n""", 1)
text = text.replace(
"""    this._visualProfileCache = new Map();\n    this._animationHandle = null;\n""",
"""    this._visualProfileCache = new Map();\n    this._animationHandle = null;\n    this._drawQueued = false;\n    this._isInteracting = false;\n    this._lastAnimationDrawAt = 0;\n""", 1)
text = text.replace(
"""    this._regionPaths = new Map(this.regions.map((region) => [region.id, makePath(region.feature)]));\n    this._seaPaths = new Map(this.seaRegions.map((sea) => [sea.id, makePath(sea.feature)]));\n  }\n""",
"""    this._regionPaths = new Map(this.regions.map((region) => [region.id, makePath(region.feature)]));\n    this._seaPaths = new Map(this.seaRegions.map((sea) => [sea.id, makePath(sea.feature)]));\n    const boundsPath = d3.geoPath(this.projection);\n    this._regionBounds = new Map(this.regions.map((region) => [region.id, boundsPath.bounds(region.feature)]));\n    this._seaBounds = new Map(this.seaRegions.map((sea) => [sea.id, boundsPath.bounds(sea.feature)]));\n  }\n\n  _requestDraw() {\n    if (this._drawQueued) return;\n    this._drawQueued = true;\n    requestAnimationFrame(() => {\n      this._drawQueued = false;\n      this.draw();\n    });\n  }\n\n  _boundsOnScreen(bounds, margin = 48) {\n    if (!bounds || this.transform.k <= 1.05) return true;\n    const [[x0, y0], [x1, y1]] = bounds;\n    const k = this.transform.k;\n    const tx = this.transform.x;\n    const ty = this.transform.y;\n    return x1 * k + tx >= -margin && x0 * k + tx <= this.width + margin &&\n      y1 * k + ty >= -margin && y0 * k + ty <= this.height + margin;\n  }\n""", 1)
text = text.replace("""    if (this.path) this.draw();\n""", """    if (this.path) this._requestDraw();\n""", 1)
old_zoom = """    const zoom = d3.zoom()\n      .scaleExtent([1, 12])\n      .on('zoom', (event) => {\n        this.transform = event.transform;\n        this.draw();\n      });\n"""
new_zoom = """    const zoom = d3.zoom()\n      .scaleExtent([1, 12])\n      .on('start', () => {\n        this._isInteracting = true;\n        this.onInteraction();\n      })\n      .on('zoom', (event) => {\n        this.transform = event.transform;\n        this.onInteraction();\n        this._requestDraw();\n      })\n      .on('end', () => {\n        this._isInteracting = false;\n        this.onInteraction();\n        this._requestDraw();\n      });\n"""
if old_zoom not in text:
    raise SystemExit('zoom anchor not found')
text = text.replace(old_zoom, new_zoom, 1)
text = text.replace(
"""    this.canvas.addEventListener('click', (event) => {\n      const rect = this.canvas.getBoundingClientRect();\n""",
"""    this.canvas.addEventListener('pointerdown', () => this.onInteraction(), { passive: true });\n    this.canvas.addEventListener('click', (event) => {\n      this.onInteraction();\n      const rect = this.canvas.getBoundingClientRect();\n""", 1)
text = text.replace("""        this.onSelect(hit);\n        this.draw();\n""", """        this.onSelect(hit);\n        this._requestDraw();\n""", 1)
text = text.replace(
"""    for (const region of this.regions) {\n      if (!this.isRegionVisible(region)) continue;\n      if (d3.geoContains(region.feature, lonLat)) return region;\n    }\n""",
"""    for (const region of this.regions) {\n      if (!this.isRegionVisible(region)) continue;\n      const bounds = this._regionBounds?.get(region.id);\n      if (bounds && (px < bounds[0][0] || px > bounds[1][0] || py < bounds[0][1] || py > bounds[1][1])) continue;\n      if (d3.geoContains(region.feature, lonLat)) return region;\n    }\n""", 1)
# Replace draw() calls in layer state changes only; leave constructor's initial draw and actual draw body alone.
text = text.replace("""    this._syncAnimationLoop();\n    this.draw();\n  }\n\n  refreshLayer() {\n""", """    this._syncAnimationLoop();\n    this._requestDraw();\n  }\n\n  refreshLayer() {\n""", 1)
text = text.replace("""    if (this.layerConfig) this.setLayer(this.layerConfig);\n    else this.draw();\n""", """    if (this.layerConfig) this.setLayer(this.layerConfig);\n    else this._requestDraw();\n""", 1)
text = text.replace("""    this._syncAnimationLoop();\n    this.draw();\n  }\n\n  getLegendInfo() {\n""", """    this._syncAnimationLoop();\n    this._requestDraw();\n  }\n\n  getLegendInfo() {\n""", 1)
old_anim = """    const animate = () => {\n      this._animationHandle = requestAnimationFrame(animate);\n      this.draw();\n    };\n    this._animationHandle = requestAnimationFrame(animate);\n"""
new_anim = """    const animate = (now) => {\n      this._animationHandle = requestAnimationFrame(animate);\n      if (this._isInteracting || now - this._lastAnimationDrawAt < 100) return;\n      this._lastAnimationDrawAt = now;\n      this._requestDraw();\n    };\n    this._animationHandle = requestAnimationFrame(animate);\n"""
if old_anim not in text:
    raise SystemExit('animation anchor not found')
text = text.replace(old_anim, new_anim, 1)
text = text.replace(
"""    for (const sea of this.seaRegions) {\n      if (!this.isSeaRegionVisible(sea)) continue;\n""",
"""    for (const sea of this.seaRegions) {\n      if (!this.isSeaRegionVisible(sea) || !this._boundsOnScreen(this._seaBounds?.get(sea.id))) continue;\n""", 1)
text = text.replace(
"""    for (const region of this.regions) {\n      if (!this.isRegionVisible(region)) continue;\n\n      const selected = region.id === this.selectedId;\n""",
"""    for (const region of this.regions) {\n      if (!this.isRegionVisible(region) || !this._boundsOnScreen(this._regionBounds?.get(region.id))) continue;\n\n      const selected = region.id === this.selectedId;\n""", 1)
text = text.replace("""    if (this.transform.k >= 2.6) {\n""", """    if (!this._isInteracting && this.transform.k >= 2.6) {\n""", 1)
text = text.replace(
"""    if (this.layer?.visualOverlay === 'trade') this._drawTradeOverlay();\n    if (this.layer?.visualOverlay === 'military') this._drawMilitaryOverlay();\n""",
"""    if (!this._isInteracting && this.layer?.visualOverlay === 'trade') this._drawTradeOverlay();\n    if (!this._isInteracting && this.layer?.visualOverlay === 'military') this._drawMilitaryOverlay();\n""", 1)
map_path.write_text(text)

# --- Clock: let input win over simulation throughput. ---
clock_path = ROOT / 'js/core/clock.js'
text = clock_path.read_text()
text = text.replace("""    this._estimatedTickMs = null;\n    this._now = now;\n""", """    this._estimatedTickMs = null;\n    this._deferUntil = 0;\n    this._now = now;\n""", 1)
text = text.replace(
"""  get daysPerTick() { return this.resolution.daysPerTick; }\n\n  _targetIntervalMs(speed = this.speed) { return MS_PER_TICK_AT_1X / speed; }\n""",
"""  get daysPerTick() { return this.resolution.daysPerTick; }\n\n  deferForInteraction(ms = 300) {\n    this._deferUntil = Math.max(this._deferUntil, this._now() + Math.max(0, ms));\n  }\n\n  _targetIntervalMs(speed = this.speed) { return MS_PER_TICK_AT_1X / speed; }\n""", 1)
old_tick = """        } else if (frameTime >= this._nextTickAt) {\n          const startedAt = this._now();\n"""
new_tick = """        } else if (frameTime >= this._nextTickAt) {\n          if (frameTime < this._deferUntil) {\n            this._nextTickAt = this._deferUntil;\n            this._rafHandle = this._requestFrame(loop);\n            return;\n          }\n          const startedAt = this._now();\n"""
if old_tick not in text:
    raise SystemExit('clock tick anchor not found')
clock_path.write_text(text.replace(old_tick, new_tick, 1))

# --- Main wiring: map and ordinary UI input defer simulation work briefly. ---
main_path = ROOT / 'js/main.js'
text = main_path.read_text()
text = text.replace(
"""    getConflictPressure: (region) => {\n""",
"""    onInteraction: () => clock.deferForInteraction(350),\n    getConflictPressure: (region) => {\n""", 1)
anchor = """  wireLayerToggle(map);\n  map.setLayer(LAYERS.density);\n"""
replacement = """  wireLayerToggle(map);\n  const deferSimulationForInput = () => clock.deferForInteraction(350);\n  document.addEventListener('pointerdown', deferSimulationForInput, { passive: true, capture: true });\n  document.addEventListener('touchstart', deferSimulationForInput, { passive: true, capture: true });\n  document.addEventListener('input', deferSimulationForInput, true);\n  document.addEventListener('keydown', deferSimulationForInput, true);\n  map.setLayer(LAYERS.density);\n"""
if anchor not in text:
    raise SystemExit('main UI input anchor not found')
main_path.write_text(text.replace(anchor, replacement, 1))

print('UI responsiveness patch applied')
