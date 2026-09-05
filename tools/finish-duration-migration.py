from pathlib import Path

def patch(path, reps):
    p=Path(path); s=p.read_text()
    for old,new in reps:
        if old not in s:
            raise SystemExit(f'missing anchor in {path}: {old[:120]!r}')
        s=s.replace(old,new,1)
    p.write_text(s)

patch('js/core/simTime.js', [
("export function elapsedWeeks(days) {\n  return days / DAYS_PER_WEEK;\n}\n", "export function elapsedWeeks(days) {\n  return days / DAYS_PER_WEEK;\n}\n\nexport function compoundFraction(weeklyFraction, elapsedDays) {\n  const weeks = Math.max(0, elapsedWeeks(elapsedDays));\n  return 1 - Math.pow(1 - Math.max(0, Math.min(1, weeklyFraction)), weeks);\n}\n\nexport function chanceOverDays(weeklyChance, elapsedDays) {\n  return compoundFraction(weeklyChance, elapsedDays);\n}\n")
])

patch('js/main.js', [
("    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, clock.tickIndex, toolTypes, Math.random);", "    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, clock.tickIndex, toolTypes, Math.random);") ,
("    tickStateFinance(regions);", "    tickStateFinance(regions, time.elapsedDays);"),
("    tickInfrastructureMaintenance(regions);", "    tickInfrastructureMaintenance(regions, time.elapsedDays);"),
("    const constructionEvents = tickConstruction(regions, clock.tickIndex);", "    const constructionEvents = tickConstruction(regions, clock.tickIndex, time.elapsedDays);"),
("    tickSiegeEquipment(regions);", "    tickSiegeEquipment(regions, time.elapsedDays);"),
("    const breakthroughEvents = tickBreakthroughs(regions, clock.tickIndex, Math.random);", "    const breakthroughEvents = tickBreakthroughs(regions, clock.tickIndex, Math.random, time.elapsedDays);"),
])

patch('js/economy/tools.js', [
("export function wearOutTools(region) {", "export function wearOutTools(region) {\n  const weekScale = Math.max(0.01, Number(region._elapsedWeeks) || 1);"),
("    const weeklyRate = 1 - Math.pow(1 - annualRate, 1 / 52);", "    const weeklyRate = 1 - Math.pow(1 - annualRate, weekScale / 52);"),
("  const adoptionCap = Math.max(1, Math.round(headcount * MAX_ADOPTION_RATE_PER_WEEK));", "  const weekScale = Math.max(0.01, Number(region._elapsedWeeks) || 1);\n  const adoptionFraction = 1 - Math.pow(1 - MAX_ADOPTION_RATE_PER_WEEK, weekScale);\n  const adoptionCap = Math.max(1, Math.round(headcount * adoptionFraction));"),
("  const exportToolsWanted = Math.ceil(externalOrders * EXPORT_ORDER_SHARE_PER_WEEK);", "  const exportOrderShare = 1 - Math.pow(1 - EXPORT_ORDER_SHARE_PER_WEEK, weekScale);\n  const exportToolsWanted = Math.ceil(externalOrders * exportOrderShare);"),
])

patch('js/economy/horses.js', [
("import { ensureMilitaryPolicy } from '../military/policies.js?v=20260904-policy1';", "import { ensureMilitaryPolicy } from '../military/policies.js?v=20260904-policy1';\nimport { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';"),
("export function tickHorseEconomy(region, workingAge) {", "export function tickHorseEconomy(region, workingAge, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));"),
("  const mortality = weeklyRate(ANNUAL_BASE_MORTALITY) +\n    (1 - clamp01(region.stability ?? 1)) * CRISIS_WEEKLY_MORTALITY;", "  const baselineMortality = 1 - Math.pow(1 - weeklyRate(ANNUAL_BASE_MORTALITY), weekScale);\n  const crisisWeekly = (1 - clamp01(region.stability ?? 1)) * CRISIS_WEEKLY_MORTALITY;\n  const crisisMortality = 1 - Math.pow(1 - crisisWeekly, weekScale);\n  const mortality = 1 - (1 - baselineMortality) * (1 - crisisMortality);"),
("  horses.births = herd * weeklyRate(ANNUAL_BIRTH_RATE) *", "  horses.births = herd * (1 - Math.pow(1 - weeklyRate(ANNUAL_BIRTH_RATE), weekScale)) *"),
("  const released = releaseSurplusRole(region, 'draft', draftWanted) +", "  const oldReleaseRate = WEEKLY_ROLE_RELEASE_RATE;\n  const effectiveReleaseRate = 1 - Math.pow(1 - oldReleaseRate, weekScale);\n  const releaseRole = (role, wanted) => {\n    const surplus = Math.max(0, horses[role] - wanted);\n    const released = surplus * effectiveReleaseRate; horses[role] -= released; region.stockpile.horses += released; return released;\n  };\n  const released = releaseRole('draft', draftWanted) +"),
("    releaseSurplusRole(region, 'transport', transportWanted) +\n    releaseSurplusRole(region, 'war', warWanted);", "    releaseRole('transport', transportWanted) +\n    releaseRole('war', warWanted);"),
("    totalTrainingWanted / (TRAINING_PER_WORKER_PER_WEEK * husbandrySkill));\n  let training = horses.trainers * TRAINING_PER_WORKER_PER_WEEK * husbandrySkill;", "    totalTrainingWanted / (TRAINING_PER_WORKER_PER_WEEK * weekScale * husbandrySkill));\n  let training = horses.trainers * TRAINING_PER_WORKER_PER_WEEK * weekScale * husbandrySkill;"),
("    fodderNeeded: totalHorses(region) * HORSE_FODDER_PER_WEEK,", "    fodderNeeded: totalHorses(region) * HORSE_FODDER_PER_WEEK * weekScale,"),
])

patch('js/economy/laborCore.js', [
("  tickWeather(regions, currentTick, rng);", "  const currentDay = Number.isFinite(currentTick) ? currentTick * elapsedDays : null;\n  tickWeather(regions, currentDay, rng, elapsedDays);"),
("  for (const region of regions) {\n    allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays);", "  for (const region of regions) {\n    region._elapsedWeeks = Math.max(0.01, elapsedWeeks(elapsedDays));\n    allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays);"),
("    applyForestRegrowth(region, regionsById);", "    applyForestRegrowth(region, regionsById, elapsedDays);"),
("    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: FISH_REGROWTH_RATE });", "    const fishRate = 1 - Math.pow(1 - FISH_REGROWTH_RATE, Math.max(0.01, elapsedWeeks(elapsedDays)));\n    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: fishRate });"),
("  const navyWear = wearBoatFleet(region.navy.boats, region.navy.advancedBoats);", "  const navyWear = wearBoatFleet(region.navy.boats, region.navy.advancedBoats, weekScale);"),
("  const fishingWear = wearBoatFleet(region.fishingBoats, region.advancedFishingBoats);", "  const fishingWear = wearBoatFleet(region.fishingBoats, region.advancedFishingBoats, weekScale);"),
("  const potteryBroken = (region.stockpile.pottery || 0) * weeklyAttrition(POTTERY_ANNUAL_BREAKAGE);", "  const potteryBroken = (region.stockpile.pottery || 0) * (1 - Math.pow(1 - weeklyAttrition(POTTERY_ANNUAL_BREAKAGE), weekScale));"),
("  const clothesWornOut = (region.stockpile.clothes || 0) * weeklyAttrition(CLOTHING_ANNUAL_WEAR);", "  const clothesWornOut = (region.stockpile.clothes || 0) * (1 - Math.pow(1 - weeklyAttrition(CLOTHING_ANNUAL_WEAR), weekScale));"),
("  const horseReport = tickHorseEconomy(region, civilianWorkingAge);", "  const horseReport = tickHorseEconomy(region, civilianWorkingAge, elapsedDays);"),
("function wearBoatFleet(total, advanced) {", "function wearBoatFleet(total, advanced, weekScale = 1) {"),
("  const basicLost = basic * weeklyAttrition(BASIC_BOAT_ANNUAL_WEAR);\n  const advancedLost = safeAdvanced * weeklyAttrition(ADVANCED_BOAT_ANNUAL_WEAR);", "  const basicLost = basic * (1 - Math.pow(1 - weeklyAttrition(BASIC_BOAT_ANNUAL_WEAR), weekScale));\n  const advancedLost = safeAdvanced * (1 - Math.pow(1 - weeklyAttrition(ADVANCED_BOAT_ANNUAL_WEAR), weekScale));"),
("  let rate = gap >= 0 ? policy.enter : policy.exit;", "  let rate = gap >= 0 ? policy.enter : policy.exit;\n  const weekScale = Math.max(0.01, Number(region._elapsedWeeks) || 1);"),
("  if (impossible && gap < 0) rate = Math.max(rate, 0.08);", "  if (impossible && gap < 0) rate = Math.max(rate, 0.08);\n  rate = 1 - Math.pow(1 - Math.min(0.95, rate), weekScale);"),
("function applyForestRegrowth(region, regionsById) {", "function applyForestRegrowth(region, regionsById, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));"),
("  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate: FOREST_SPREAD_RATE });", "  const spreadRate = 1 - Math.pow(1 - FOREST_SPREAD_RATE, weekScale);\n  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate });"),
("  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: WOOD_REGROWTH_RATE });", "  const growthRate = 1 - Math.pow(1 - WOOD_REGROWTH_RATE, weekScale);\n  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: growthRate });"),
])

patch('js/world/weather.js', [
("export function seasonalFarmMultiplier(region, currentTick) {\n  if (currentTick === null || currentTick === undefined) return 1;", "export function seasonalFarmMultiplier(region, currentDay) {\n  if (currentDay === null || currentDay === undefined) return 1;"),
("  const week = ((currentTick % 52) + 52) % 52;\n  const peakWeek = latitude < 0 ? 8 : 34;\n  return 1 + amplitude * Math.cos(2 * Math.PI * (week - peakWeek) / 52);", "  const dayOfYear = ((currentDay % 365.2425) + 365.2425) % 365.2425;\n  const peakDay = latitude < 0 ? 56 : 238;\n  return 1 + amplitude * Math.cos(2 * Math.PI * (dayOfYear - peakDay) / 365.2425);"),
("export function tickWeather(regions, currentTick, rng = Math.random) {\n  if (currentTick === null || currentTick === undefined) {", "export function tickWeather(regions, currentDay, rng = Math.random, elapsedDays = 7) {\n  if (currentDay === null || currentDay === undefined) {"),
("  world.global = clamp(world.global * 0.96 + centredNoise(rng) * 0.16, -1.5, 1.5);", "  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const globalMemory = Math.pow(0.96, weekScale);\n  world.global = clamp(world.global * globalMemory + centredNoise(rng) * 0.16 * Math.sqrt(weekScale), -1.5, 1.5);"),
("    const next = clamp(previous * 0.90 + centredNoise(rng) * 0.24 + world.global * 0.04, -1.8, 1.8);", "    const cellMemory = Math.pow(0.90, weekScale);\n    const next = clamp(previous * cellMemory + centredNoise(rng) * 0.24 * Math.sqrt(weekScale) + world.global * 0.04, -1.8, 1.8);"),
("      seasonalMultiplier: seasonalFarmMultiplier(region, currentTick), condition };", "      seasonalMultiplier: seasonalFarmMultiplier(region, currentDay), condition };"),
])

patch('js/economy/stateFinance.js', [
("export function tickStateFinance(regions) {", "export function tickStateFinance(regions, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const revenueAlpha = 1 - Math.pow(1 - REVENUE_EMA_ALPHA, weekScale);"),
("      Math.max(0, region.wallet || 0) * WEEKLY_WEALTH_TAX_RATE * collectionEffectiveness", "      Math.max(0, region.wallet || 0) * WEEKLY_WEALTH_TAX_RATE * weekScale * collectionEffectiveness"),
("    finance.revenueEma += (revenue - finance.revenueEma) * REVENUE_EMA_ALPHA;", "    const weeklyEquivalentRevenue = revenue / weekScale;\n    finance.revenueEma += (weeklyEquivalentRevenue - finance.revenueEma) * revenueAlpha;"),
("    const grossAdministrationDue = Math.max(0, region.population) * CIVIL_ADMIN_PER_PERSON_PER_WEEK;", "    const grossAdministrationDue = Math.max(0, region.population) * CIVIL_ADMIN_PER_PERSON_PER_WEEK * weekScale;"),
("    const payrollDue = Math.max(0, region.army.personnel || 0) * SOLDIER_UPKEEP_PER_WEEK +\n      Math.max(0, region.navy.personnel || 0) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK;", "    const payrollDue = (Math.max(0, region.army.personnel || 0) * SOLDIER_UPKEEP_PER_WEEK +\n      Math.max(0, region.navy.personnel || 0) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK) * weekScale;"),
("      finance.arrearsWeeks += 1;\n      region.stability = Math.max(0, region.stability - ARREARS_STABILITY_PENALTY * (1 - payRatio));", "      finance.arrearsWeeks += weekScale;\n      region.stability = Math.max(0, region.stability - ARREARS_STABILITY_PENALTY * weekScale * (1 - payRatio));"),
("      finance.arrearsWeeks = Math.max(0, finance.arrearsWeeks - 1);", "      finance.arrearsWeeks = Math.max(0, finance.arrearsWeeks - weekScale);"),
("    const readinessAdjustment = payRatio < finance.readiness ? 0.08 : 0.02;\n    finance.readiness += (payRatio - finance.readiness) * readinessAdjustment;", "    const readinessWeekly = payRatio < finance.readiness ? 0.08 : 0.02;\n    const readinessAdjustment = 1 - Math.pow(1 - readinessWeekly, weekScale);\n    finance.readiness += (payRatio - finance.readiness) * readinessAdjustment;"),
("      const desertionRate = MAX_WEEKLY_DESERTION * (1 - payRatio);", "      const desertionRate = (1 - Math.pow(1 - MAX_WEEKLY_DESERTION, weekScale)) * (1 - payRatio);"),
("      operatingRevenue * PROCUREMENT_REVENUE_SHARE + region.treasury * PROCUREMENT_TREASURY_SHARE", "      operatingRevenue * weekScale * PROCUREMENT_REVENUE_SHARE + region.treasury * PROCUREMENT_TREASURY_SHARE"),
])

patch('js/economy/construction.js', [
("export function tickConstruction(regions, currentTick) {", "export function tickConstruction(regions, currentTick, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);"),
("    const workers = Math.min(state.workersReserved || 0, remainingWork);\n    const desiredFraction = workers / requiredWork;", "    const workers = Math.min(state.workersReserved || 0, remainingWork);\n    const desiredWork = workers * weekScale;\n    const desiredFraction = desiredWork / requiredWork;"),
("    const actualWorkers = Math.min(workers, work);", "    const actualWorkers = Math.min(workers, work / weekScale);"),
("    const wages = actualWorkers * type.wagePerWorkerWeek;", "    const wages = actualWorkers * type.wagePerWorkerWeek * weekScale;"),
("export function tickInfrastructureMaintenance(regions) {", "export function tickInfrastructureMaintenance(regions, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);"),
("      const materialNeeds = Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * rate / 52]));", "      const materialNeeds = Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * rate / 52 * weekScale]));"),
("      let cost = workerNeed * type.wagePerWorkerWeek;", "      let cost = workerNeed * type.wagePerWorkerWeek * weekScale;"),
("      asset.condition = clamp(asset.condition + ratio * 0.00015 - (1 - ratio) * 0.002, 0, 1);", "      asset.condition = clamp(asset.condition + ratio * 0.00015 * weekScale - (1 - ratio) * 0.002 * weekScale, 0, 1);"),
])

patch('js/technology/breakthroughs.js', [
("export function tickBreakthroughs(regions, currentTick, rng = Math.random) {", "export function tickBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const chance = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), weekScale);"),
("  const ironDiscoveries = regions.filter((region) => rng() < ironSmeltingChance(region, regionsById, currentTick));", "  const ironDiscoveries = regions.filter((region) => rng() < chance(ironSmeltingChance(region, regionsById, currentTick)));"),
("  const boatDiscoveries = regions.filter((region) => rng() < advancedBoatbuildingChance(region, regionsById, currentTick));", "  const boatDiscoveries = regions.filter((region) => rng() < chance(advancedBoatbuildingChance(region, regionsById, currentTick)));"),
("  const hillFortDiscoveries = regions.filter((region) => rng() < hillFortChance(region, regionsById));", "  const hillFortDiscoveries = regions.filter((region) => rng() < chance(hillFortChance(region, regionsById)));"),
("  const catapultDiscoveries = regions.filter((region) => rng() < catapultChance(region, regionsById, currentTick));", "  const catapultDiscoveries = regions.filter((region) => rng() < chance(catapultChance(region, regionsById, currentTick)));"),
("  const waterDiscoveries = regions.filter((region) => rng() < waterManagementChance(region, regionsById));", "  const waterDiscoveries = regions.filter((region) => rng() < chance(waterManagementChance(region, regionsById)));"),
("  const shaftDiscoveries = regions.filter((region) => rng() < shaftMiningChance(region, regionsById));", "  const shaftDiscoveries = regions.filter((region) => rng() < chance(shaftMiningChance(region, regionsById)));"),
("  const drainageDiscoveries = regions.filter((region) => rng() < mineDrainageChance(region, regionsById));", "  const drainageDiscoveries = regions.filter((region) => rng() < chance(mineDrainageChance(region, regionsById)));"),
("    advanceIronIndustry(region);\n    // Travelling craftspeople cease to be a permanent lottery ticket.\n    region.ironWorkingExposure = Math.max(0, (region.ironWorkingExposure || 0) * 0.99);", "    for (let i = 0; i < Math.max(1, Math.floor(weekScale)); i++) advanceIronIndustry(region);\n    const readinessRemainder = weekScale - Math.floor(weekScale);\n    if (readinessRemainder > 0 && region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) {\n      const before = region.ironWorkingReadiness; advanceIronIndustry(region);\n      region.ironWorkingReadiness = before + (region.ironWorkingReadiness - before) * readinessRemainder;\n    }\n    // Travelling craftspeople cease to be a permanent lottery ticket.\n    region.ironWorkingExposure = Math.max(0, (region.ironWorkingExposure || 0) * Math.pow(0.99, weekScale));"),
])

patch('js/military/siegeEquipment.js', [
("export function tickSiegeEquipment(regions) {", "export function tickSiegeEquipment(regions, elapsedDays = 7) {\n  const maxBuilds = Math.max(1, Math.floor(elapsedDays / 7));"),
("  for (const region of regions) {\n    const state = ensureSiegeEquipment(region);\n    const type = nextWantedType(region);", "  for (const region of regions) {\n    const state = ensureSiegeEquipment(region);\n    let buildsRemaining = maxBuilds;\n    while (buildsRemaining-- > 0) {\n    const type = nextWantedType(region);"),
("    state.lastWeek = { built: type.id, metal, cost };\n  }\n}", "    state.lastWeek = { built: type.id, metal, cost };\n    }\n  }\n}"),
])

# Benchmark should advance exactly the requested number of historical days, using a short final tick.
p=Path('tools/calibrate.mjs'); s=p.read_text()
old="""  const ticksPerYear = Math.ceil(365.2425 / daysPerTick);\n  let elapsedDays = 0;\n  for (let tick = 1; tick <= years * ticksPerYear; tick += 1) {\n    const startDay = elapsedDays; elapsedDays += daysPerTick;\n    const time = { tickIndex: tick, startDay, endDay: elapsedDays, elapsedDays: daysPerTick, resolution: 'benchmark' };"""
new="""  const targetDays = years * 365.2425;\n  let elapsedDays = 0;\n  let tick = 0;\n  while (elapsedDays < targetDays - 0.001) {\n    tick += 1;\n    const startDay = elapsedDays;\n    const thisTickDays = Math.min(daysPerTick, targetDays - elapsedDays);\n    elapsedDays += thisTickDays;\n    const time = { tickIndex: tick, startDay, endDay: elapsedDays, elapsedDays: thisTickDays, resolution: 'benchmark' };"""
if old not in s: raise SystemExit('calibrate loop anchor missing')
s=s.replace(old,new,1)
s=s.replace("tickEconomy(regions, seas, toolTypes, rng, tick, daysPerTick);","tickEconomy(regions, seas, toolTypes, rng, tick, time.elapsedDays);",1)
s=s.replace("tickDemographics(regions, religiousWorld, daysPerTick);","tickDemographics(regions, religiousWorld, time.elapsedDays);",1)
s=s.replace("tickStateFinance(regions);","tickStateFinance(regions, time.elapsedDays);",1)
s=s.replace("tickInfrastructureMaintenance(regions);","tickInfrastructureMaintenance(regions, time.elapsedDays);",1)
s=s.replace("tickConstruction(regions, tick);","tickConstruction(regions, tick, time.elapsedDays);",1)
s=s.replace("tickSiegeEquipment(regions);","tickSiegeEquipment(regions, time.elapsedDays);",1)
s=s.replace("tickBreakthroughs(regions, tick, rng);","tickBreakthroughs(regions, tick, rng, time.elapsedDays);",1)
p.write_text(s)
