from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:100]}')
    p.write_text(text.replace(old, new, 1))


# Keep subregional military control attached to the same durable settlement entities.
replace_once(
    'js/military/subregionalControl.js',
    "  const control = region.subregionalControl;\n  control.sovereignActorId ||= sovereign;",
    "  const control = region.subregionalControl;\n  control.sovereignActorId ||= sovereign;\n\n  // Settlement entities are authoritative. Military control nodes reference the\n  // same IDs rather than inventing parallel towns that disappear on conquest.\n  const settlementLedger = ensureSettlements(region);\n  for (const settlement of settlementLedger.places) {\n    let node = control.places.find((candidate) => candidate.id === settlement.id);\n    if (!node) {\n      node = place(settlement.id, settlement.name, settlement.kind, control.sovereignActorId, settlement.isPrincipal ? 1 : 0.55, settlement.population || 0);\n      control.places.push(node);\n    }\n    node.name = settlement.name;\n    node.population = Math.max(0, Math.round(settlement.population || 0));\n    node.settlementStatus = settlement.status || 'active';\n    node.isSettlement = true;\n    node.isPrincipalSettlement = !!settlement.isPrincipal;\n    node.location = settlement.location || node.location;\n    node.spatialSiteId = settlement.spatialSiteId || node.spatialSiteId;\n    if (settlement.status === 'active') {\n      node.kind = settlement.kind;\n      node.strategicValue = settlement.isPrincipal ? 1 : settlement.kind === 'city' ? 0.78 : settlement.kind === 'town' ? 0.62 : 0.42;\n    } else {\n      node.kind = 'ruins';\n      node.strategicValue = settlement.isPrincipal ? 0.36 : 0.14;\n    }\n  }"
)

# Spatial sites include settlement lifecycle metadata and always sync every known
# settlement, even if a caller only passes military-control places.
replace_once(
    'js/world/spatialGraph.js',
    "  Object.assign(site,{type,name:place.name,lon:point[0],lat:point[1],regionId:region.id,sourcePlaceId:place.id,\n    controllerActorId:place.controllerActorId,garrisonActorId:place.garrisonActorId||null,garrisonPersonnel:place.garrisonPersonnel||0});",
    "  Object.assign(site,{type,name:place.name,lon:point[0],lat:point[1],regionId:region.id,sourcePlaceId:place.id,\n    controllerActorId:place.controllerActorId,garrisonActorId:place.garrisonActorId||null,garrisonPersonnel:place.garrisonPersonnel||0,\n    population:Math.max(0,place.population||0),settlementStatus:place.status||place.settlementStatus||null,fame:place.fame||0});"
)

replace_once(
    'js/world/spatialGraph.js',
    "  const anchors=graph.regionAnchorPoints(region.id), principal=graph.sites.get(`${region.id}:principal`);\n  const used=[];\n  for(const place of places){",
    "  const anchors=graph.regionAnchorPoints(region.id), principal=graph.sites.get(`${region.id}:principal`);\n  const used=[];\n  const mergedPlaces=new Map();\n  for(const settlement of region.settlements?.places||[]) mergedPlaces.set(settlement.id,settlement);\n  for(const place of places){\n    const settlement=mergedPlaces.get(place.id);\n    mergedPlaces.set(place.id,settlement?{...place,...settlement,controllerActorId:place.controllerActorId,garrisonActorId:place.garrisonActorId,garrisonPersonnel:place.garrisonPersonnel}:place);\n  }\n  const pullPoints=[...anchors];\n  const idx=graph.regionIndex.get(region.id);\n  for(const corridorId of idx?.corridorIds||[]){\n    const corridor=graph.corridors.get(corridorId);\n    if(corridor?.type==='river') for(const segment of corridor.regionSegments||[]) if(segment.regionId===region.id) pullPoints.push(segment.from,segment.to);\n    if(corridor?.type==='land_route'&&corridor.anchorId){const a=graph.anchors.get(corridor.anchorId);if(a)pullPoints.push([a.lon,a.lat]);}\n  }\n  const coast=graph.anchors.get(`coast:${region.id}`);if(coast)pullPoints.push([coast.lon,coast.lat]);\n  for(const place of mergedPlaces.values()){"
)

replace_once(
    'js/world/spatialGraph.js',
    "    else if(['city','principal_settlement'].includes(place.kind)) point=[principal.lon,principal.lat];\n    else if(place.kind==='port' && graph.anchors.has(`coast:${region.id}`)){const a=graph.anchors.get(`coast:${region.id}`);point=[a.lon,a.lat];}\n    else point=sitePoint(region,place.id,anchors.length?anchors:[[principal.lon,principal.lat]]);\n    used.push(addSite(graph,region,place,point));",
    "    else if(place.isPrincipal||place.id===region.settlements?.principalId) point=[principal.lon,principal.lat];\n    else if(place.kind==='port' && graph.anchors.has(`coast:${region.id}`)){const a=graph.anchors.get(`coast:${region.id}`);point=[a.lon,a.lat];}\n    else point=sitePoint(region,place.id,pullPoints.length?pullPoints:[[principal.lon,principal.lat]]);\n    const displayType=(place.status&&place.status!=='active')?'ruins':place.kind;\n    used.push(addSite(graph,region,place,point,displayType));"
)

# Make the regional renderer show durable villages/ruins as well as towns/cities.
replace_once(
    'js/ui/localRegionView.js',
    "['fort','port','city','principal_settlement','town'].includes(s.type)",
    "['fort','port','city','principal_settlement','town','village','ruins'].includes(s.type)"
)
replace_once(
    'js/ui/localRegionView.js',
    "['mine','port','principal_settlement','town','city','great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type)",
    "['mine','port','principal_settlement','village','town','city','ruins','great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type)"
)
replace_once(
    'js/ui/localRegionView.js',
    "let r=['city','principal_settlement'].includes(s.type)?7:s.type==='port'?6:s.type==='mine'?5:4;",
    "let r=['city','principal_settlement'].includes(s.type)?7:s.type==='town'?6:s.type==='port'?6:s.type==='mine'?5:s.type==='ruins'?3:4;"
)

# Tick settlements after demographics, so settlement populations follow the
# simulation rather than being a one-time visual snapshot.
replace_once(
    'js/main.js',
    "import { tickDisease } from './society/disease.js?v=20260912-disease1';",
    "import { tickDisease } from './society/disease.js?v=20260912-disease1';\nimport { tickSettlements } from './society/settlements.js?v=20260913-settlements2';"
)
replace_once(
    'js/main.js',
    "    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));",
    "    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));\n    profiler.measure('Settlements', () => {\n      for (const region of regions) tickSettlements(region, calendarWeek, time.elapsedDays, Math.random);\n    });"
)

# Cache-bust the modules whose settlement/spatial behaviour changed.
replace_once(
    'js/main.js',
    "import { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';",
    "import { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260913-settlements2';"
)
replace_once(
    'js/main.js',
    "import { createLocalRegionView } from './ui/localRegionView.js?v=20260910-spatial1';",
    "import { createLocalRegionView } from './ui/localRegionView.js?v=20260913-settlements2';"
)

print('Applied persistent settlements v2 integration')
