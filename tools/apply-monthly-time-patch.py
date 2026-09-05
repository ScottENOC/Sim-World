from pathlib import Path

def patch(path, replacements):
    p=Path(path); s=p.read_text()
    for old,new in replacements:
        if old not in s: raise SystemExit(f'missing anchor in {path}: {old[:120]}')
        s=s.replace(old,new,1)
    p.write_text(s)

patch('js/main.js', [
("  clock.onTick(() => {", "  clock.onTick((time) => {"),
("    tickEconomy(regions, seaRegions, toolTypes, Math.random, clock.tickIndex);", "    tickEconomy(regions, seaRegions, toolTypes, Math.random, clock.tickIndex, time.elapsedDays);"),
("    tickTrade(regions, clock.tickIndex);", "    tickTrade(regions, clock.tickIndex, time);"),
("    tickDemographics(regions, religiousWorld);", "    tickDemographics(regions, religiousWorld, time.elapsedDays);"),
])

patch('js/economy/laborCore.js', [
("import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260905-projects1';", "import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260905-projects1';\nimport { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';"),
("export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null) {", "export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7) {"),
("    allocateAndProduce(region, seaRegionsById, toolTypes, rng);", "    allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays);"),
("function allocateAndProduce(region, seaRegionsById, toolTypes, rng) {", "function allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));"),
("  const humanFoodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK;", "  const humanFoodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK * weekScale;"),
("  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor);", "  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor) * weekScale;"),
("  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER *", "  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER * weekScale *"),
("      const shoreYieldPerWorker = SHORE_FISH_YIELD_PER_WORKER_BASE * stockFraction * fishingSkill;", "      const shoreYieldPerWorker = SHORE_FISH_YIELD_PER_WORKER_BASE * weekScale * stockFraction * fishingSkill;"),
("      const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * (1 + advancedShare * 0.5) *", "      const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * weekScale * (1 + advancedShare * 0.5) *"),
("  const pitchMade = pitchWorkers * PITCH_PER_WORKER;", "  const pitchMade = pitchWorkers * PITCH_PER_WORKER * weekScale;"),
("  const textilesMade = textileWorkers * TEXTILES_PER_WORKER * skillMultiplier(region, 'textiles');", "  const textilesMade = textileWorkers * TEXTILES_PER_WORKER * weekScale * skillMultiplier(region, 'textiles');"),
("  const clothesMade = Math.min(tailors * CLOTHES_PER_TAILOR,", "  const clothesMade = Math.min(tailors * CLOTHES_PER_TAILOR * weekScale,"),
("    const navyBoatsWanted = navyGap * BOAT_MOBILIZATION_RATE;", "    const navyBoatsWanted = navyGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);"),
("    const fishBoatsWanted = fishGap * BOAT_MOBILIZATION_RATE;", "    const fishBoatsWanted = fishGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);"),
("  const oreYieldPerMiner = ORE_YIELD_PER_MINER * miningSkill;", "  const oreYieldPerMiner = ORE_YIELD_PER_MINER * miningSkill * weekScale;"),
("  const bronzePerSmith = BRONZE_PER_SMITH * skillMultiplier(region, 'smithing');", "  const bronzePerSmith = BRONZE_PER_SMITH * weekScale * skillMultiplier(region, 'smithing');"),
("  const ironPerSmith = IRON_PER_SMITH * skillMultiplier(region, 'smithing') * ironReadiness;", "  const ironPerSmith = IRON_PER_SMITH * weekScale * skillMultiplier(region, 'smithing') * ironReadiness;"),
("  const smeltingCapacity = smelters * NONFERROUS_METAL_PER_SMELTER;", "  const smeltingCapacity = smelters * NONFERROUS_METAL_PER_SMELTER * weekScale;"),
("  const potteryByLabor = potteryLaborAvailable * POTTERY_PER_POTTER * potterySkill;", "  const potteryByLabor = potteryLaborAvailable * POTTERY_PER_POTTER * potterySkill * weekScale;"),
("  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * lumberjackEfficiency * resourceAccess, region.forest.currentStock);", "  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * weekScale * lumberjackEfficiency * resourceAccess, region.forest.currentStock);"),
("    foodBalance = Math.min(foodBalance * (1 - storage.spoilage), foodNeeded * storage.weeks);", "    const tickSpoilage = 1 - Math.pow(1 - storage.spoilage, weekScale);\n    foodBalance = Math.min(foodBalance * (1 - tickSpoilage), (foodNeeded / weekScale) * storage.weeks);"),
("      spoilage: storage.spoilage };", "      spoilage: tickSpoilage };"),
])

patch('js/economy/trade.js', [
("const MARKET_TURNAROUND_WEEKS = 1;", "const MARKET_TURNAROUND_DAYS = 7;"),
("    const oneWayWeeks = Math.max(1, Math.ceil(geometry.distanceKm / (SEA_KM_PER_WEEK * sea.speedMultiplier)));\n    return {\n      mode: 'sea',\n      oneWayWeeks,\n      roundTripWeeks: oneWayWeeks * 2 + MARKET_TURNAROUND_WEEKS,", "    const oneWayDays = Math.max(1, geometry.distanceKm / (SEA_KM_PER_WEEK * sea.speedMultiplier) * 7);\n    return {\n      mode: 'sea',\n      oneWayDays,\n      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,"),
("  const oneWayWeeks = Math.max(1, Math.ceil(geometry.distanceKm / (LAND_KM_PER_WEEK * land.speedMultiplier)));\n  return {\n    mode: 'land',\n    oneWayWeeks,\n    roundTripWeeks: oneWayWeeks * 2 + MARKET_TURNAROUND_WEEKS,", "  const oneWayDays = Math.max(1, geometry.distanceKm / (LAND_KM_PER_WEEK * land.speedMultiplier) * 7);\n  return {\n    mode: 'land',\n    oneWayDays,\n    roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,"),
("      const score = (gap * habitBoost) / Math.max(1, route.roundTripWeeks);", "      const score = (gap * habitBoost) / Math.max(1, route.roundTripDays / 7);"),
("function processVentures(regions, regionsById, currentTick) {\n  if (!Number.isFinite(currentTick)) return;", "function processVentures(regions, regionsById, currentTick, time) {\n  if (!Number.isFinite(currentTick)) return;\n  const currentDay = Number.isFinite(time?.endDay) ? time.endDay : currentTick * 7;"),
("      if (!venture.arrived && currentTick >= venture.arrivalTick) {", "      const arrivalDay = Number.isFinite(venture.arrivalDay) ? venture.arrivalDay : (venture.arrivalTick || currentTick) * 7;\n      const returnDay = Number.isFinite(venture.returnDay) ? venture.returnDay : (venture.returnTick || currentTick) * 7;\n      if (!venture.arrived && currentDay >= arrivalDay) {"),
("          venture.arrived = true;\n          remaining.push(venture);\n          continue;", "          venture.arrived = true;"),
("      if (currentTick >= venture.returnTick) {", "      if (currentDay >= returnDay) {"),
("function launchVentures(region, opportunities, currentTick) {", "function launchVentures(region, opportunities, currentTick, time) {\n  const departureDay = Number.isFinite(time?.endDay) ? time.endDay : currentTick * 7;"),
("      departureTick: currentTick,\n      arrivalTick: currentTick + opp.route.oneWayWeeks,\n      returnTick: currentTick + opp.route.roundTripWeeks,", "      departureTick: currentTick,\n      departureDay,\n      arrivalDay: departureDay + opp.route.oneWayDays,\n      returnDay: departureDay + opp.route.roundTripDays,"),
("export function tickTrade(regions, currentTick = null) {", "export function tickTrade(regions, currentTick = null, time = null) {"),
("  processVentures(regions, regionsById, currentTick);", "  processVentures(regions, regionsById, currentTick, time);"),
("    launchVentures(region, opportunities, currentTick);", "    launchVentures(region, opportunities, currentTick, time);"),
])

patch('tools/calibrate.mjs', [
("const baseSeed = Number(option('base-seed', 0x12345678)) >>> 0;", "const baseSeed = Number(option('base-seed', 0x12345678)) >>> 0;\nconst worldScale = Math.max(1, Math.floor(Number(option('scale', 1))));\nconst daysPerTick = Math.max(1, Number(option('days-per-tick', 30)));"),
("function makeWorld(rng) {\n  const regions = meta.map((m) => {", "function makeWorld(rng) {\n  const scaledMeta = [];\n  for (let copy = 0; copy < worldScale; copy++) for (const m of meta) scaledMeta.push({ ...m, id: `${m.id}__${copy}`, neighbors: m.neighbors.map(id => `${id}__${copy}`) });\n  const regions = scaledMeta.map((m) => {"),
("    const endowment = resources[m.id];", "    const baseId = m.id.replace(/__\\d+$/, '');\n    const endowment = resources[baseId];"),
("  const seas = seaMeta.map((m) => {", "  const seas = Array.from({length: worldScale}, (_, copy) => seaMeta.map((m) => ({...m, id: `${m.id}__${copy}`, adjacentLand: m.adjacentLand.map(id => `${id}__${copy}`)}))).flat().map((m) => {"),
("  for (let tick = 1; tick <= years * 52; tick += 1) {", "  const ticksPerYear = Math.ceil(365.2425 / daysPerTick);\n  let elapsedDays = 0;\n  for (let tick = 1; tick <= years * ticksPerYear; tick += 1) {\n    const startDay = elapsedDays; elapsedDays += daysPerTick;\n    const time = { tickIndex: tick, startDay, endDay: elapsedDays, elapsedDays: daysPerTick, resolution: 'benchmark' };"),
("    tickEconomy(regions, seas, toolTypes, rng, tick);", "    tickEconomy(regions, seas, toolTypes, rng, tick, daysPerTick);"),
("    tickTrade(regions, tick);", "    tickTrade(regions, tick, time);"),
("    tickDemographics(regions, religiousWorld);", "    tickDemographics(regions, religiousWorld, daysPerTick);"),
("  configuration: { years, seedCount, snapshotYears, baseSeed },", "  configuration: { years, seedCount, snapshotYears, baseSeed, worldScale, daysPerTick },"),
])
