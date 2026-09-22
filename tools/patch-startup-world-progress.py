from pathlib import Path

# Replace short-lived pre-selection telemetry with simple direct metadata fetches.
picker = Path('js/ui/startupPicker.js')
s = picker.read_text()
start = s.index('async function loadMapEntries(scenario, report = () => {}) {')
end = s.index('\nasync function installEarlyPicker()', start)
replacement = """async function loadMapEntries(scenario) {\n  const [metaResponse, navResponse] = await Promise.all([\n    fetchScenarioAssetDirect('regions.meta.json?v=20260922-picker-direct1', scenario, { cache: 'no-store' }),\n    fetchScenarioAssetDirect('region-navigation.json?v=20260922-picker-direct1', scenario, { cache: 'no-store' }),\n  ]);\n  if (!metaResponse.ok) throw new Error(`region metadata HTTP ${metaResponse.status}`);\n  if (!navResponse.ok) throw new Error(`navigation metadata HTTP ${navResponse.status}`);\n  const metadata = await metaResponse.json();\n  const navigation = await navResponse.json();\n  const regions = [...(metadata.regions || [])].sort((a, b) => alphabetical(a.name, b.name));\n  const regionById = new Map(regions.map((region) => [region.id, region]));\n  const entries = [];\n  for (const region of regions) {\n    for (const membership of navigation.regions?.[region.id] || []) entries.push({ region, ...membership });\n  }\n  return { regions, regionById, entries };\n}\n"""
s = s[:start] + replacement + s[end:]
old = """    const status = document.createElement('div');\n    status.className = 'startup-picker-status';\n    pickerList.replaceChildren(status);\n    const telemetryStarted = performance.now();\n    const telemetryLines = [];\n    const report = (message) => {\n      const elapsed = ((performance.now() - telemetryStarted) / 1000).toFixed(1);\n      telemetryLines.push(`${elapsed}s · ${message}`);\n      status.replaceChildren(...telemetryLines.slice(-10).map((line) => {\n        const row = document.createElement('div');\n        row.textContent = line;\n        return row;\n      }));\n      pickerHelp.textContent = `${scenario.name} · ${message}`;\n      console.info('[startup-picker]', message);\n    };\n    report('Preparing region list…');\n\n    let entries;\n    let regionById;\n    try {\n      ({ entries, regionById } = await loadMapEntries(scenario, report));\n"""
new = """    pickerList.innerHTML = '<div class=\"startup-picker-status\">Preparing region list…</div>';\n\n    let entries;\n    let regionById;\n    try {\n      ({ entries, regionById } = await loadMapEntries(scenario));\n"""
if old not in s:
    raise SystemExit('pre-selection telemetry anchor not found')
s = s.replace(old, new, 1)
old_mark = """    const status = document.createElement('div');\n    status.className = 'startup-picker-status';\n    status.textContent = countryFirst\n      ? `Loading world… ${country} is selected. The game will open on ${region.name} when the scenario state is ready.`\n      : `Loading world… ${region.name} is selected and will start automatically when ready.`;\n    pickerList.appendChild(status);\n"""
new_mark = """    const status = document.createElement('div');\n    status.className = 'startup-picker-status';\n    const startedAt = performance.now();\n    const reportWorldStartup = (message) => {\n      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);\n      status.textContent = `${elapsed}s · ${message}`;\n      pickerHelp.textContent = `${scenario.name} · ${message}`;\n      console.info('[world-startup]', message);\n    };\n    window.__reportWorldStartup = reportWorldStartup;\n    window.addEventListener('error', (event) => reportWorldStartup(`Startup error: ${event.message || 'unknown error'}`), { once: true });\n    window.addEventListener('unhandledrejection', (event) => reportWorldStartup(`Startup rejection: ${event.reason?.message || event.reason || 'unknown rejection'}`), { once: true });\n    reportWorldStartup(countryFirst\n      ? `Loading world… ${country} is selected. Preparing ${region.name}.`\n      : `Loading world… ${region.name} is selected.`);\n    pickerList.appendChild(status);\n"""
if old_mark not in s:
    raise SystemExit('post-selection status anchor not found')
s = s.replace(old_mark, new_mark, 1)
picker.write_text(s)

main = Path('js/main.js')
m = main.read_text()
anchor = "let activePlayerPolityId = null;\n\nasync function main() {\n"
insert = """let activePlayerPolityId = null;\n\nconst reportWorldStartup = (message) => {\n  if (typeof window !== 'undefined' && typeof window.__reportWorldStartup === 'function') window.__reportWorldStartup(message);\n};\n\nasync function main() {\n  reportWorldStartup('Starting world simulation…');\n"""
if anchor not in m:
    raise SystemExit('main start anchor not found')
m = m.replace(anchor, insert, 1)
repls = [
("  const regions = await loadWorld();", "  reportWorldStartup('Loading land regions…');\n  const regions = await loadWorld();\n  reportWorldStartup(`Loaded ${regions.length.toLocaleString()} land regions · initialising societies…`);"),
("  initialisePoliticalContinuity(polities, regions, 0);\n  const seaRegions = await loadSeaWorld();", "  initialisePoliticalContinuity(polities, regions, 0);\n  reportWorldStartup('Societies and polities ready · loading sea regions…');\n  const seaRegions = await loadSeaWorld();"),
("  linkSeaAdjacency(regions, seaRegions);\n  const spatialGraph = await loadWorldSpatialGraph(regions);", "  linkSeaAdjacency(regions, seaRegions);\n  reportWorldStartup(`Loaded ${seaRegions.length.toLocaleString()} sea regions · loading spatial graph…`);\n  const spatialGraph = await loadWorldSpatialGraph(regions);"),
("  initialiseHydrology(spatialGraph, regions);", "  reportWorldStartup('Spatial graph ready · initialising hydrology…');\n  initialiseHydrology(spatialGraph, regions);"),
("  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);", "  reportWorldStartup('Hydrology ready · building local sites and knowledge…');\n  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);"),
("  const [toolTypes, regionNavigation] = await Promise.all([", "  reportWorldStartup('Knowledge ready · loading tools and navigation…');\n  const [toolTypes, regionNavigation] = await Promise.all(["),
("  const fogOfWar = new FogOfWar(regions);", "  reportWorldStartup('Tools and navigation ready · creating map and council…');\n  const fogOfWar = new FogOfWar(regions);"),
("  showRegionPicker(regions, regionNavigation, (chosen) => {", "  reportWorldStartup('World systems ready · preparing region handoff…');\n  showRegionPicker(regions, regionNavigation, (chosen) => {"),
("  window.__worldsim = {", "  reportWorldStartup('World ready · opening selected region…');\n  window.__worldsim = {")
]
for old,new in repls:
    if old not in m:
        raise SystemExit(f'main anchor missing: {old[:50]}')
    m = m.replace(old,new,1)
main.write_text(m)
