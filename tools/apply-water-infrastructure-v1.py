from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'anchor not found in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))
    return True

# Add small and large river-control works to the normal construction system.
construction_anchor = """  irrigation: {\n    id: 'irrigation', name: 'Irrigation and drainage', requiredTechId: 'water_management', unique: true,\n    description: 'Channels, ditches, embankments and drains stabilising agricultural water supply.',\n    workRequired: 8500, defaultWorkers: 120, minWorkers: 40, maxWorkers: 500,\n    materials: { stone: 350, wood: 450, pottery: 100 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.05,\n  },\n"""
construction_new = construction_anchor + """  river_weir: {\n    id: 'river_weir', name: 'River weir and diversion works', requiredTechId: 'water_management', unique: true,\n    requiresInfrastructure: 'irrigation', minPopulation: 4000,\n    description: 'A low weir, sluices and diversion channels that store a modest pulse of river water, regulate irrigation withdrawals and alter downstream timing.',\n    workRequired: 11000, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,\n    materials: { stone: 900, wood: 800, pottery: 120 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.055,\n  },\n  reservoir_dam: {\n    id: 'reservoir_dam', name: 'Major reservoir dam', requiredTechId: 'hydraulic_engineering', unique: true,\n    requiresInfrastructure: 'river_weir', minPopulation: 12000,\n    description: 'A large impoundment with controlled outlets. It can shift wet-season water into dry periods, suppress floods, secure irrigation and later support hydropower, while materially changing downstream flow.',\n    workRequired: 52000, defaultWorkers: 520, minWorkers: 160, maxWorkers: 2200,\n    materials: { stone: 6200, wood: 1800, pottery: 300, iron: 80 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.075,\n  },\n"""
replace_once('js/economy/construction.js', construction_anchor, construction_new)

# Wire the new runtime layer and advisor controls into the existing game loop.
replace_once(
    'js/main.js',
    "import './ui/diseasePolicyUi.js?v=20260912-disease1';\n",
    "import './ui/diseasePolicyUi.js?v=20260912-disease1';\nimport './ui/waterPolicyUi.js?v=20260914-water2';\n",
)
replace_once(
    'js/main.js',
    "import { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';\n",
    "import { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';\nimport { initialiseHydrology, tickActiveHydrology } from './world/hydrology.js?v=20260914-water2';\n",
)
replace_once(
    'js/main.js',
    "  const spatialGraph = await loadWorldSpatialGraph(regions);\n",
    "  const spatialGraph = await loadWorldSpatialGraph(regions);\n  initialiseHydrology(spatialGraph, regions);\n",
)
replace_once(
    'js/main.js',
    "    const constructionEvents = profiler.measure('Construction', () => tickConstruction(regions, calendarWeek, time.elapsedDays));\n",
    "    const constructionEvents = profiler.measure('Construction', () => tickConstruction(regions, calendarWeek, time.elapsedDays));\n    const waterEvents = profiler.measure('Hydrology', () => tickActiveHydrology(regions, time.endDay, time.elapsedDays));\n",
)
replace_once(
    'js/main.js',
    "      ...constructionEvents.filter((event) => event.regionId === playerRegionId),\n",
    "      ...constructionEvents.filter((event) => event.regionId === playerRegionId),\n      ...waterEvents.filter((event) => event.victimRegionId === playerRegionId || event.sourceRegionId === playerRegionId),\n",
)

# Add policy helpers and richer reservoir operating behaviour.
hydrology_anchor = """  if (!Number.isFinite(h.waterImpactAwareness)) h.waterImpactAwareness = 0;\n  if (!h.report || typeof h.report !== 'object') h.report = {};\n  return h;\n}\n"""
hydrology_new = """  if (!Number.isFinite(h.waterImpactAwareness)) h.waterImpactAwareness = 0;\n  if (!h.report || typeof h.report !== 'object') h.report = {};\n  if (!region.waterPolicy || typeof region.waterPolicy !== 'object') region.waterPolicy = {};\n  if (!region.waterPolicy.operatingPriority) region.waterPolicy.operatingPriority = 'balanced';\n  if (!Number.isFinite(region.waterPolicy.surfaceWithdrawalIntensity)) region.waterPolicy.surfaceWithdrawalIntensity = 0.5;\n  if (!Number.isFinite(region.waterPolicy.targetReservoirFill)) region.waterPolicy.targetReservoirFill = 0.55;\n  if (!Number.isFinite(region.waterPolicy.targetDownstreamFlow)) region.waterPolicy.targetDownstreamFlow = 0.82;\n  return h;\n}\n\nexport function setWaterPolicy(region, patch = {}) {\n  ensureRegionalHydrology(region);\n  const allowed = ['surfaceWithdrawalIntensity','targetReservoirFill','targetDownstreamFlow','wastewaterTreatment','agriculturalRunoffControl','industrialDischargeControl'];\n  for (const key of allowed) if (patch[key] !== undefined) region.waterPolicy[key] = clamp(patch[key]);\n  return region.waterPolicy;\n}\n\nexport function setWaterOperatingPriority(region, priority = 'balanced') {\n  ensureRegionalHydrology(region);\n  const profiles = {\n    balanced: { targetReservoirFill: 0.55, targetDownstreamFlow: 0.82 },\n    irrigation: { targetReservoirFill: 0.72, targetDownstreamFlow: 0.62 },\n    flood_control: { targetReservoirFill: 0.35, targetDownstreamFlow: 0.86 },\n    downstream: { targetReservoirFill: 0.48, targetDownstreamFlow: 1.0 },\n    hydropower: { targetReservoirFill: 0.62, targetDownstreamFlow: 0.92 },\n  };\n  const selected = profiles[priority] || profiles.balanced;\n  region.waterPolicy.operatingPriority = profiles[priority] ? priority : 'balanced';\n  Object.assign(region.waterPolicy, selected);\n  return region.waterPolicy;\n}\n"""
replace_once('js/world/hydrology.js', hydrology_anchor, hydrology_new)

reg_anchor = """  store.stored = clamp(stored, 0, capacity);\n  return { outflow: Math.max(0, outflow), stored: store.stored, storageChange: store.stored - oldStored };\n}\n"""
reg_new = """  store.stored = clamp(stored, 0, capacity);\n  const storageChange = store.stored - oldStored;\n  const floodPeakReduction = inflow > naturalFlow ? clamp(Math.max(0, inflow - outflow) / Math.max(0.05, inflow)) : 0;\n  const hasHydroTech = region?.unlockedTechIds?.has?.('hydroelectric_power') || region?.unlockedTechIds?.has?.('electrical_generation');\n  const hydroPriority = region?.waterPolicy?.operatingPriority === 'hydropower' ? 1 : 0.65;\n  const hydropowerPotential = dam && hasHydroTech ? Math.max(0, outflow) * Math.sqrt(Math.max(0, store.stored) / Math.max(0.05, capacity)) * hydroPriority : 0;\n  return { outflow: Math.max(0, outflow), stored: store.stored, storageChange, floodPeakReduction, hydropowerPotential };\n}\n"""
replace_once('js/world/hydrology.js', reg_anchor, reg_new)

report_anchor = """    h.report = { surfaceInflow: 0, surfaceOutflow: 0, surfaceWithdrawal: 0, waterHealthRisk: 0, riverCount: 0 };\n"""
report_new = """    h.report = { surfaceInflow: 0, surfaceOutflow: 0, surfaceWithdrawal: 0, waterHealthRisk: 0, riverCount: 0, floodPeakReduction: 0, hydropowerPotential: 0 };\n"""
replace_once('js/world/hydrology.js', report_anchor, report_new)

state_anchor = """      h.report.waterHealthRisk = Math.max(h.report.waterHealthRisk, risk);\n      h.report.riverCount += 1;\n"""
state_new = """      h.report.waterHealthRisk = Math.max(h.report.waterHealthRisk, risk);\n      h.report.floodPeakReduction = Math.max(h.report.floodPeakReduction, regulated.floodPeakReduction || 0);\n      h.report.hydropowerPotential += regulated.hydropowerPotential || 0;\n      h.report.riverCount += 1;\n"""
replace_once('js/world/hydrology.js', state_anchor, state_new)

segment_anchor = """        storageChange: regulated.storageChange,\n        pollutionLoad: { ...pollution },\n"""
segment_new = """        storageChange: regulated.storageChange,\n        floodPeakReduction: regulated.floodPeakReduction || 0,\n        hydropowerPotential: regulated.hydropowerPotential || 0,\n        pollutionLoad: { ...pollution },\n"""
replace_once('js/world/hydrology.js', segment_anchor, segment_new)

print('water infrastructure v1 integration applied')
