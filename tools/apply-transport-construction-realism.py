from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, count)
    p.write_text(text)

# Construction: real era-sensitive productivity and honest time/cost estimates.
replace('js/economy/construction.js',
        "import { localPrice } from './prices.js?v=20260904-weather1';\n",
        "import { localPrice } from './prices.js?v=20260904-weather1';\nimport { constructionProductivity } from './constructionProductivity.js?v=20260925-construction-productivity1';\n")
replace('js/economy/construction.js',
        "  const weeks = Math.ceil(spec.workRequired / assigned);\n  const wages = spec.workRequired * type.wagePerWorkerWeek;",
        "  const productivity = constructionProductivity(region, typeId);\n  const weeks = Math.ceil(spec.workRequired / Math.max(0.001, assigned * productivity));\n  const wages = spec.workRequired / Math.max(0.001, productivity) * type.wagePerWorkerWeek;")
replace('js/economy/construction.js',
        "  return { workers: assigned, weeks, wages, supplies, totalCost: wages + supplies,\n    materials: { ...spec.materialsRequired }, scale: spec.scale, monumental: Boolean(type.monumental) };",
        "  return { workers: assigned, weeks, wages, supplies, totalCost: wages + supplies, productivity,\n    materials: { ...spec.materialsRequired }, scale: spec.scale, monumental: Boolean(type.monumental) };")
replace('js/economy/construction.js',
        "    const workers = Math.min(state.workersReserved || 0, remainingWork);\n    const desiredWork = workers * weekScale;\n    const desiredFraction = desiredWork / requiredWork;",
        "    const workers = Math.min(state.workersReserved || 0, remainingWork);\n    const productivity = constructionProductivity(region, project.typeId);\n    const desiredWorkerWeeks = workers * weekScale;\n    const desiredWork = desiredWorkerWeeks * productivity;\n    const desiredFraction = desiredWork / requiredWork;")
replace('js/economy/construction.js',
        "    const fullWageCost = requiredWork * type.wagePerWorkerWeek;",
        "    const fullWageCost = requiredWork / Math.max(0.001, productivity) * type.wagePerWorkerWeek;")
replace('js/economy/construction.js',
        "    const actualWorkers = Math.min(workers, work / weekScale);\n    const fraction = work / requiredWork;\n    const wages = actualWorkers * type.wagePerWorkerWeek * weekScale;",
        "    const workerWeeksUsed = Math.min(desiredWorkerWeeks, work / Math.max(0.001, productivity));\n    const actualWorkers = Math.min(workers, workerWeeksUsed / weekScale);\n    const fraction = work / requiredWork;\n    const wages = workerWeeksUsed * type.wagePerWorkerWeek;")
replace('js/economy/construction.js',
        "    state.lastWeek = { projectId: project.id, workers: project.workersThisWeek, work, wages, supplies, stalledReason: project.stalledReason };",
        "    state.lastWeek = { projectId: project.id, workers: project.workersThisWeek, localWorkers: Math.round(state.localWorkersReserved ?? project.workersThisWeek), importedWorkers: Math.round(state.importedWorkersReserved || 0), productivity, work, wages, supplies, stalledReason: project.stalledReason };")

# Economy wrapper: add transport-constrained construction commuters without duplicating donor labour.
replace('js/economy/labor.js',
        "import { recordMaterialUse, tickCircularEconomy } from './circularEconomy.js?v=20260922-circular1';\n",
        "import { recordMaterialUse, tickCircularEconomy } from './circularEconomy.js?v=20260922-circular1';\nimport { applyConstructionLaborMobility } from './laborMobility.js?v=20260925-labor-mobility1';\n")
replace('js/economy/labor.js',
        "export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {\n  const reservations = [];",
        "export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {\n  applyConstructionLaborMobility(regions);\n  const reservations = [];")
replace('js/economy/labor.js',
        "      const fullWorkingAge = positive(region.demographics?.workingAge);\n      const housingBuilders = Math.min(fullWorkingAge, positive(housingConstruction.workers));",
        "      const outgoingConstructionCommuters = positive(region.laborMobility?.outgoingConstructionWorkers);\n      const constructionState = region.construction;\n      const totalConstructionWorkers = positive(constructionState?.workersReserved);\n      const localConstructionWorkers = positive(constructionState?.localWorkersReserved ?? totalConstructionWorkers);\n      if (constructionState) constructionState.workersReserved = localConstructionWorkers;\n      if (outgoingConstructionCommuters > 0 && region.demographics) region.demographics.workingAge = Math.max(0, positive(region.demographics.workingAge) - outgoingConstructionCommuters);\n      const fullWorkingAge = positive(region.demographics?.workingAge);\n      const housingBuilders = Math.min(fullWorkingAge, positive(housingConstruction.workers));")
replace('js/economy/labor.js',
        "      reservations.push([region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services]);",
        "      reservations.push([region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services, outgoingConstructionCommuters, totalConstructionWorkers]);")
replace('js/economy/labor.js',
        "      for (const [region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services] of reservations) {\n        if (region.demographics) region.demographics.workingAge += housingBuilders + merchants + artists.total + industrialSupport + services;",
        "      for (const [region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services, outgoingConstructionCommuters, totalConstructionWorkers] of reservations) {\n        if (region.demographics) region.demographics.workingAge += housingBuilders + merchants + artists.total + industrialSupport + services + outgoingConstructionCommuters;\n        if (region.construction) region.construction.workersReserved = totalConstructionWorkers;")

# Rail demand helper: each endpoint carries half of its electric traction load.
replace('js/economy/railways.js',
        "export function railwayConnection(regionA, regionB) {",
        "export function regionalRailElectricityDemand(region, elapsedDays = 7) {\n  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;\n  let demand = 0;\n  for (const connection of Object.values(region?.railConnections || {})) {\n    const lines = Object.values(connection?.lines || {});\n    const candidates = lines.length ? lines : [connection];\n    for (const line of candidates) {\n      if (!line || ['construction', 'destroyed'].includes(line.status)) continue;\n      const stock = normaliseRollingStock(line.rollingStock);\n      const electricShare = line.electrification && line.electrification !== RAIL_ELECTRIFICATION.NONE\n        ? stock.electric + stock.highSpeedElectric : 0;\n      if (electricShare <= 0) continue;\n      const km = Math.max(1, Number(line.lengthKm) || Number(connection.lengthKm) || 1);\n      const annual = nonNegative(line.electricityRequiredPerYear || km * .11);\n      const utilisation = Math.max(.15, nonNegative(line.utilisation ?? .5));\n      demand += annual * years * utilisation * electricShare * .5;\n    }\n  }\n  return demand;\n}\n\nexport function railwayConnection(regionA, regionB) {")
replace('js/economy/railways.js',
        "    rollingStock: { ...line.rollingStock },\n    operatorPolityId:",
        "    rollingStock: { ...line.rollingStock },\n    electricityRequiredPerYear: line.electricityRequiredPerYear,\n    utilisation: line.utilisation,\n    operatorPolityId:")

# Electric railway traction becomes a real grid load.
replace('js/economy/electricity.js',
        "import { tickRoadVehicles } from './roadVehicles.js?v=20260923-ev1';\n",
        "import { tickRoadVehicles } from './roadVehicles.js?v=20260923-ev1';\nimport { regionalRailElectricityDemand } from './railways.js?v=20260925-rail-electric1';\n")
replace('js/economy/electricity.js',
        "circularEconomyDemand=nonNegative(region.circularEconomy?.electricityLoad),industrialDemand=baseIndustrialDemand+lightMetalsDemand+strategicNuclearDemand+modernEnergyDemand+fertiliserDemand+controlledAgricultureDemand+waterPumpingDemand+urbanWaterDemand+precisionAgricultureDemand+cropBiotechnologyDemand+livestockDemand+alternativeProteinDemand+aquacultureDemand+circularEconomyDemand;return {householdDemand,industrialDemand,total:householdDemand+industrialDemand,roadVehicleDemand,lightMetalsDemand,strategicNuclearDemand,modernEnergyDemand,fertiliserDemand,controlledAgricultureDemand,waterPumpingDemand,urbanWaterDemand,precisionAgricultureDemand,cropBiotechnologyDemand,livestockDemand,alternativeProteinDemand,aquacultureDemand,circularEconomyDemand};}",
        "circularEconomyDemand=nonNegative(region.circularEconomy?.electricityLoad),railElectricityDemand=regionalRailElectricityDemand(region,elapsedDays),industrialDemand=baseIndustrialDemand+lightMetalsDemand+strategicNuclearDemand+modernEnergyDemand+fertiliserDemand+controlledAgricultureDemand+waterPumpingDemand+urbanWaterDemand+precisionAgricultureDemand+cropBiotechnologyDemand+livestockDemand+alternativeProteinDemand+aquacultureDemand+circularEconomyDemand+railElectricityDemand;return {householdDemand,industrialDemand,total:householdDemand+industrialDemand,roadVehicleDemand,railElectricityDemand,lightMetalsDemand,strategicNuclearDemand,modernEnergyDemand,fertiliserDemand,controlledAgricultureDemand,waterPumpingDemand,urbanWaterDemand,precisionAgricultureDemand,cropBiotechnologyDemand,livestockDemand,alternativeProteinDemand,aquacultureDemand,circularEconomyDemand};}")
replace('js/economy/electricity.js',
        "industrialDemand:demand.industrialDemand,roadVehicleDemand:demand.roadVehicleDemand||0,lightMetalsDemand:",
        "industrialDemand:demand.industrialDemand,roadVehicleDemand:demand.roadVehicleDemand||0,railElectricityDemand:demand.railElectricityDemand||0,lightMetalsDemand:")

# Mobile infrastructure panel: make labour sourcing/productivity visible.
replace('js/ui/mobileGameplayControls.js',
        "} from '../economy/construction.js?v=20260905-projects1';\n",
        "} from '../economy/construction.js?v=20260905-projects1';\nimport { constructionProductivityBreakdown } from '../economy/constructionProductivity.js?v=20260925-construction-productivity1';\n")
replace('js/ui/mobileGameplayControls.js',
        "function renderInfrastructureModal(sim, region) {",
        "function labourSummary(region) {\n  const mobility = region?.laborMobility || {};\n  const state = ensureConstruction(region);\n  const workingAge = Math.round(Number(region?.demographics?.workingAge) || 0);\n  const occupations = Object.entries(region?.report || {})\n    .map(([key, value]) => [key, Math.round(Number(value?.workers) || 0)])\n    .filter(([, workers]) => workers > 0)\n    .sort((a, b) => b[1] - a[1])\n    .slice(0, 8);\n  const sources = (mobility.constructionSources || []).map((source) => `${esc(source.regionName)}: ${Math.round(source.workers).toLocaleString()} by ${esc(source.mode)}`).join(' · ');\n  return `<div class=\"mobile-build-summary\"><strong>Labour</strong>\n    <div class=\"mobile-build-muted\">Working age ${workingAge.toLocaleString()} · local builders ${Math.round(state.localWorkersReserved ?? state.workersReserved ?? 0).toLocaleString()} · incoming commuters ${Math.round(mobility.incomingConstructionWorkers || 0).toLocaleString()} · outgoing commuters ${Math.round(mobility.outgoingConstructionWorkers || 0).toLocaleString()}</div>\n    ${sources ? `<div class=\"mobile-build-muted\">Construction labour sources: ${sources}</div>` : ''}\n    ${occupations.length ? `<div class=\"mobile-build-muted\">Current work: ${occupations.map(([key, workers]) => `${esc(key.replaceAll('_', ' '))} ${workers.toLocaleString()}`).join(' · ')}</div>` : ''}\n  </div>`;\n}\n\nfunction renderInfrastructureModal(sim, region) {")
replace('js/ui/mobileGameplayControls.js',
        "    <div class=\"mobile-build-summary\">\n      <strong>Construction</strong>",
        "    ${labourSummary(region)}\n    <div class=\"mobile-build-summary\">\n      <strong>Construction</strong>")
replace('js/ui/mobileGameplayControls.js',
        "          <div class=\"mobile-build-muted\">${Math.round(project.targetWorkers || 0)} target workers${project.stalledReason ? ` · stalled: ${esc(String(project.stalledReason).replaceAll('_', ' '))}` : ''}</div>",
        "          <div class=\"mobile-build-muted\">${Math.round(project.targetWorkers || 0)} target workers · ${Math.round(state.localWorkersReserved ?? state.workersReserved ?? 0)} local · ${Math.round(state.importedWorkersReserved || 0)} commuting${project.stalledReason ? ` · stalled: ${esc(String(project.stalledReason).replaceAll('_', ' '))}` : ''}</div>\n          <div class=\"mobile-build-muted\">Current productivity: ${constructionProductivityBreakdown(region, project.typeId).total.toFixed(2)}× effective work per worker-week</div>")
replace('js/ui/mobileGameplayControls.js',
        "if (detail) detail.innerHTML = `${esc(entry.type.description || '')}<br><strong>Materials:</strong> ${esc(materialText(entry.type.materials))} · <strong>Work:</strong> ${Math.round(entry.type.workRequired || 0).toLocaleString()} worker-weeks`;",
        "if (detail) { const productivity = constructionProductivityBreakdown(region, entry.type.id).total; detail.innerHTML = `${esc(entry.type.description || '')}<br><strong>Materials:</strong> ${esc(materialText(entry.type.materials))} · <strong>Base work:</strong> ${Math.round(entry.type.workRequired || 0).toLocaleString()} worker-weeks · <strong>Current productivity:</strong> ${productivity.toFixed(2)}×`; }")

print('Transport, commuting and modern construction source migration applied.')
