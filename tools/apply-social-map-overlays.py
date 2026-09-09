from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'Could not find {label}')
    return text.replace(old, new, 1)

main = Path('js/main.js')
text = main.read_text()
text = replace_once(
    text,
    "import { renderDiplomaticServicePanel } from './ui/diplomaticServicePanel.js?v=20260909-diplomatic-ui1';\n",
    "import { renderDiplomaticServicePanel } from './ui/diplomaticServicePanel.js?v=20260909-diplomatic-ui1';\nimport { buildSocialOverlayLayers } from './ui/socialOverlays.js?v=20260910-social-overlays1';\n",
    'social overlay import',
)
text = replace_once(
    text,
    "  wireLayerToggle(map);\n  map.setLayer(LAYERS.density);",
    "  Object.assign(LAYERS, buildSocialOverlayLayers({\n    regions, religiousWorld, agreements, fogOfWar,\n    getPlayerRegionId: () => playerRegionId,\n    getPlayerPolityId: () => activePlayerPolityId,\n    knowledgeLevel, knowledgeThresholds: KNOWLEDGE_THRESHOLDS,\n  }));\n  wireLayerToggle(map);\n  map.setLayer(LAYERS.density);",
    'social overlay layer registration',
)
main.write_text(text)

index = Path('index.html')
html = index.read_text()
html = replace_once(
    html,
    '        <button class="layer-btn" data-layer="political">Political</button>\n',
    '        <button class="layer-btn" data-layer="political">Political</button>\n        <button class="layer-btn" data-layer="culture">Culture</button>\n        <button class="layer-btn" data-layer="language">Language</button>\n        <button class="layer-btn" data-layer="religion">Faith</button>\n        <button class="layer-btn" data-layer="influence">Influence</button>\n',
    'social overlay buttons',
)
index.write_text(html)

css = Path('css/main.css')
styles = css.read_text()
styles = replace_once(
    styles,
    '  max-width: 140px;\n}\n\n.legend.hidden',
    '  max-width: min(94vw, 520px);\n}\n\n.legend.hidden',
    'legend width',
)
styles = replace_once(
    styles,
    '.layer-toggle {\n  display: flex;\n  gap: 4px;\n  margin-bottom: 6px;\n  pointer-events: auto;\n}',
    '.layer-toggle {\n  display: flex;\n  gap: 4px;\n  margin-bottom: 6px;\n  pointer-events: auto;\n  overflow-x: auto;\n  overscroll-behavior-x: contain;\n  scrollbar-width: none;\n}\n.layer-toggle::-webkit-scrollbar { display: none; }',
    'scrollable layer toggle',
)
styles = replace_once(
    styles,
    '.layer-btn {\n  flex: 1;\n',
    '.layer-btn {\n  flex: 0 0 auto;\n  min-width: 50px;\n',
    'layer button sizing',
)
styles = replace_once(
    styles,
    '#legend-categorical {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}',
    '#legend-categorical {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  max-height: 112px;\n  overflow-y: auto;\n  pointer-events: auto;\n}',
    'categorical legend scrolling',
)
css.write_text(styles)

renderer = Path('js/ui/mapRenderer.js')
r = renderer.read_text()
r = replace_once(
    r,
    "const CATEGORICAL_PALETTE = ['#c08a4e', '#4e8ac0', '#8ac04e', '#c04e8a', '#4ec0a8', '#a84ec0', '#c0a84e', '#6a6ac0'];\n",
    "const CATEGORICAL_PALETTE = ['#c08a4e', '#4e8ac0', '#8ac04e', '#c04e8a', '#4ec0a8', '#a84ec0', '#c0a84e', '#6a6ac0'];\nfunction categoricalColor(key, index, total) {\n  if (total <= CATEGORICAL_PALETTE.length) return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];\n  let h = 2166136261;\n  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }\n  const hue = (h >>> 0) % 360;\n  const sat = 46 + ((h >>> 8) % 24);\n  const light = 48 + ((h >>> 16) % 18);\n  return `hsl(${hue} ${sat}% ${light}%)`;\n}\n",
    'stable categorical colours',
)
r = replace_once(
    r,
    "      const colorByKey = new Map(\n        unique.map((k, i) => [k, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]])\n      );\n\n      this.layer = {\n        type: 'categorical',\n        valueFn: config.valueFn,\n        label: config.label,\n        colorByKey,\n        visualOverlay: config.visualOverlay || null,\n      };",
    "      const colorByKey = new Map(\n        unique.map((k, i) => [k, categoricalColor(k, i, unique.length)])\n      );\n      const counts = new Map();\n      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);\n      const legendKeys = unique.slice().sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, config.legendLimit || 12);\n\n      this.layer = {\n        type: 'categorical',\n        valueFn: config.valueFn,\n        label: config.label,\n        colorByKey,\n        legendKeys,\n        visualOverlay: config.visualOverlay || null,\n      };",
    'categorical layer metadata',
)
r = replace_once(
    r,
    "      const { label, colorByKey } = this.layer;\n      return {\n        type: 'categorical',\n        label,\n        entries: [...colorByKey.entries()].map(([key, color]) => ({ key, color })),\n      };",
    "      const { label, colorByKey, legendKeys } = this.layer;\n      const keys = legendKeys || [...colorByKey.keys()];\n      return {\n        type: 'categorical',\n        label,\n        entries: keys.map((key) => ({ key, color: colorByKey.get(key) })),\n        hiddenCategoryCount: Math.max(0, colorByKey.size - keys.length),\n      };",
    'categorical legend limiting',
)
renderer.write_text(r)
