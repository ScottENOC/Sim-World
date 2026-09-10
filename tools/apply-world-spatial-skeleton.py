from pathlib import Path

root=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p=root/path
    text=p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:90]}')
    p.write_text(text.replace(old,new,1))

# Main integration: immutable physical geography is loaded from committed data;
# mutable settlements/control are then attached to those fixed anchors.
replace_once('js/main.js',
"import { buildSocialOverlayLayers } from './ui/socialOverlays.js?v=20260910-social-overlays1';",
"import { buildSocialOverlayLayers } from './ui/socialOverlays.js?v=20260910-social-overlays1';\nimport { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';\nimport { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';\nimport { createLocalRegionView } from './ui/localRegionView.js?v=20260910-spatial1';\nimport { ensureSubregionalControl } from './military/subregionalControl.js?v=20260908-subregion1';")

# Compatibility if an earlier materialisation on this branch still imports the generator.
p=root/'js/main.js'; text=p.read_text()
text=text.replace("import { buildWorldSpatialGraph, syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';\nimport { createLocalRegionView } from './ui/localRegionView.js?v=20260910-spatial1';\nimport { ensureSubregionalControl } from './military/subregionalControl.js?v=20260908-subregion1';",
                  "import { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';\nimport { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';\nimport { createLocalRegionView } from './ui/localRegionView.js?v=20260910-spatial1';\nimport { ensureSubregionalControl } from './military/subregionalControl.js?v=20260908-subregion1';")
p.write_text(text)

replace_once('js/main.js',
"  linkSeaAdjacency(regions, seaRegions);\n  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);",
"  linkSeaAdjacency(regions, seaRegions);\n  const spatialGraph = await loadWorldSpatialGraph(regions);\n  for (const region of regions) syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);\n  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);")
# Compatibility with earlier materialised branch source.
p=root/'js/main.js'; text=p.read_text(); text=text.replace(
"  linkSeaAdjacency(regions, seaRegions);\n  const spatialGraph = buildWorldSpatialGraph(regions, seaRegions);\n  for (const region of regions) syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);\n  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);",
"  linkSeaAdjacency(regions, seaRegions);\n  const spatialGraph = await loadWorldSpatialGraph(regions);\n  for (const region of regions) syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);\n  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);")
p.write_text(text)

replace_once('js/main.js',
"  const eventQueue = [];\n  let council;",
"  const eventQueue = [];\n  let council;\n  let localRegionView = null;\n  const addRegionZoomButton = (region) => {\n    const controls = document.getElementById('region-controls');\n    if (!controls || controls.querySelector('#btn-zoom-local-region')) return;\n    const button = document.createElement('button');\n    button.id = 'btn-zoom-local-region';\n    button.className = 'region-zoom-button';\n    button.textContent = 'Zoom to region';\n    button.addEventListener('click', () => localRegionView?.open(region));\n    controls.prepend(button);\n  };")

replace_once('js/main.js',
"      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);",
"      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      addRegionZoomButton(region);\n      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);")

p=root/'js/main.js'; text=p.read_text()
needle="      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);"
if needle in text:
    text=text.replace(needle,"      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      addRegionZoomButton(region);\n      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);",1)
    p.write_text(text)

replace_once('js/main.js',
"  Object.assign(LAYERS, buildSocialOverlayLayers({",
"  localRegionView = createLocalRegionView({\n    graph: spatialGraph, regions,\n    getCampaigns: () => activeCampaigns,\n    getFleets: () => fleets,\n  });\n\n  Object.assign(LAYERS, buildSocialOverlayLayers({")

replace_once('js/main.js',
"    for (const region of regions) { ensureCommunicationState(region); ensureDiplomaticService(region); ensureCounterIntelligence(region); }\n    syncNextProjectId(regions);",
"    for (const region of regions) {\n      ensureCommunicationState(region); ensureDiplomaticService(region); ensureCounterIntelligence(region);\n      syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);\n    }\n    syncNextProjectId(regions);")

replace_once('js/main.js',
"      renderRegionControls(selectedRegion, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId);",
"      renderRegionControls(selectedRegion, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n      addRegionZoomButton(selectedRegion);\n      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId);")

replace_once('index.html',
"    <div id=\"menu-modal\" class=\"modal hidden\">",
"    <section id=\"local-region-view\" class=\"local-region-view hidden\" aria-label=\"Regional view\">\n      <header class=\"local-region-header\">\n        <div><small>Regional view</small><h2 id=\"local-region-title\">—</h2></div>\n        <button id=\"btn-close-local-region\" aria-label=\"Return to world map\">&times;</button>\n      </header>\n      <nav class=\"local-region-modes\">\n        <button class=\"active\" data-local-mode=\"overview\">Overview</button>\n        <button data-local-mode=\"economy\">Economy</button>\n        <button data-local-mode=\"control\">Control</button>\n        <button data-local-mode=\"military\">Military</button>\n      </nav>\n      <canvas id=\"local-region-canvas\"></canvas>\n      <div id=\"local-region-detail\" class=\"local-region-detail\"></div>\n    </section>\n    <div id=\"menu-modal\" class=\"modal hidden\">")

css=root/'css/main.css'; c=css.read_text()
marker='/* ---------- Persistent regional spatial view ---------- */'
if marker not in c:
    c += '''\n\n/* ---------- Persistent regional spatial view ---------- */\n.local-region-view { position:absolute; inset:0; z-index:28; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; background:var(--ink); padding-top:max(8px,env(safe-area-inset-top)); }\n.local-region-view.hidden { display:none; }\n.local-region-header { display:flex; align-items:center; justify-content:space-between; padding:8px 14px 6px; }\n.local-region-header small { color:var(--bronze); font-variant:small-caps; letter-spacing:.08em; }\n.local-region-header h2 { margin:2px 0 0; font-size:20px; }\n.local-region-header button { width:36px; height:36px; border-radius:50%; border:1px solid var(--bronze-dim); background:var(--ink-2); color:var(--parchment); font-size:22px; }\n.local-region-modes { display:flex; gap:6px; padding:5px 12px 9px; overflow-x:auto; }\n.local-region-modes button { flex:1 0 auto; min-width:76px; padding:8px; border:1px solid var(--bronze-dim); border-radius:8px; background:var(--ink-2); color:var(--parchment-dim); }\n.local-region-modes button.active { background:var(--bronze); color:var(--ink); border-color:var(--bronze); }\n#local-region-canvas { width:100%; height:100%; min-height:0; touch-action:manipulation; }\n.local-region-detail { min-height:64px; display:flex; flex-direction:column; gap:2px; padding:10px 14px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--bronze-dim); background:var(--ink-2); font-size:12px; color:var(--parchment-dim); }\n.local-region-detail strong { color:var(--parchment); font-size:14px; }\n.region-zoom-button { width:100%; padding:10px; border:1px solid var(--bronze); border-radius:8px; background:var(--bronze); color:var(--ink); font-weight:700; }\n'''
    css.write_text(c)

p=root/'index.html'; text=p.read_text(); text=text.replace("js/main.js?v=20260908-fleets1","js/main.js?v=20260910-spatial1"); p.write_text(text)
