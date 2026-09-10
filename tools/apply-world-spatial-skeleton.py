from pathlib import Path

root = Path(__file__).resolve().parents[1]

# The first CI materialisation already installed the regional-zoom UI. This
# helper is now deliberately small and idempotent: its job is to ensure runtime
# physical geography comes from the committed base file, never from generation.
main = root / 'js/main.js'
text = main.read_text()
text = text.replace(
    "import { buildWorldSpatialGraph, syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';",
    "import { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';\nimport { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';"
)
text = text.replace(
    "  const spatialGraph = buildWorldSpatialGraph(regions, seaRegions);",
    "  const spatialGraph = await loadWorldSpatialGraph(regions);"
)
if "loadWorldSpatialGraph" not in text or "await loadWorldSpatialGraph(regions)" not in text:
    raise SystemExit('runtime spatial-base loader was not installed')
if "buildWorldSpatialGraph(regions, seaRegions)" in text:
    raise SystemExit('runtime still regenerates physical geography')
if "createLocalRegionView" not in text or "syncRegionSpatialSites" not in text:
    raise SystemExit('regional zoom integration is incomplete')
main.write_text(text)

index = (root / 'index.html').read_text()
if 'id="local-region-view"' not in index or 'id="local-region-canvas"' not in index:
    raise SystemExit('regional zoom markup is missing')

css = (root / 'css/main.css').read_text()
if 'Persistent regional spatial view' not in css:
    raise SystemExit('regional zoom styles are missing')
