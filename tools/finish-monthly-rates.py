from pathlib import Path

def patch(path, reps):
    p=Path(path); s=p.read_text()
    for old,new in reps:
        if old not in s: raise SystemExit(f'missing anchor {path}: {old[:120]!r}')
        s=s.replace(old,new,1)
    p.write_text(s)

patch('js/economy/trade.js', [
("function staggeredDue(region, currentTick, interval) {\n  if (!Number.isFinite(currentTick)) return true;\n  return currentTick % interval === stableHash(region.id) % interval;\n}", """function staggeredDue(region, currentTick, interval) {
  if (!Number.isFinite(currentTick)) return true;
  // A monthly scheduler jumps over several calendar weeks at once. Remember
  // which stagger bucket was last serviced instead of requiring an exact
  // modulo hit that may never occur.
  if (!region._tradeCadenceBuckets || typeof region._tradeCadenceBuckets !== 'object') region._tradeCadenceBuckets = {};
  const offset = stableHash(region.id) % interval;
  const bucket = Math.floor((currentTick - offset) / interval);
  const key = String(interval);
  const previous = region._tradeCadenceBuckets[key];
  region._tradeCadenceBuckets[key] = bucket;
  if (previous === undefined) return currentTick >= offset;
  return bucket > previous;
}""")
])

patch('js/society/religion.js', [
("function updateLeaders(world, currentTick) {", "function updateLeaders(world, currentTick, weekScale = 1) {"),
("  for (const key of Object.keys(world.grievances)) world.grievances[key] *= 0.999;", "  for (const key of Object.keys(world.grievances)) world.grievances[key] *= Math.pow(0.999, weekScale);"),
("function applyReligionPolitics(region, world, currentTick) {", "function applyReligionPolitics(region, world, currentTick, weekScale = 1) {"),
("  state.unrest += (targetUnrest - state.unrest) * 0.02;\n  region.stability = clamp((region.stability ?? 1) - state.unrest * 0.00015);", "  const unrestAdjustment = 1 - Math.pow(1 - 0.02, weekScale);\n  state.unrest += (targetUnrest - state.unrest) * unrestAdjustment;\n  region.stability = clamp((region.stability ?? 1) - state.unrest * 0.00015 * weekScale);"),
("export function chooseAiReligion(region, world, currentTick, rng = Math.random) {", "export function chooseAiReligion(region, world, currentTick, rng = Math.random, weekScale = 1) {\n  const chance = (weekly) => 1 - Math.pow(1 - weekly, Math.max(0.01, weekScale));"),
("  if (!state.stateReligionId && share >= 0.62 && rng() < 0.0008) state.stateReligionId = dominant.id;", "  if (!state.stateReligionId && share >= 0.62 && rng() < chance(0.0008)) state.stateReligionId = dominant.id;"),
("  if (state.stateReligionId && (state.shares[state.stateReligionId] || 0) < 0.18 && rng() < 0.01) {", "  if (state.stateReligionId && (state.shares[state.stateReligionId] || 0) < 0.18 && rng() < chance(0.01)) {"),
("  if (state.unrest > 0.16) state.tolerance = clamp(state.tolerance + 0.002);\n  else if (state.stateReligionId && share > 0.8) state.tolerance = clamp(state.tolerance - 0.0002);", "  if (state.unrest > 0.16) state.tolerance = clamp(state.tolerance + 0.002 * weekScale);\n  else if (state.stateReligionId && share > 0.8) state.tolerance = clamp(state.tolerance - 0.0002 * weekScale);"),
("  if (!dominant.adminCentreRegionId && dominant.holyCityRegionId === region.id && rng() < 0.001) {", "  if (!dominant.adminCentreRegionId && dominant.holyCityRegionId === region.id && rng() < chance(0.001)) {"),
("  if (state.stateReligionId && share > 0.7 && region.population > 8000 && rng() < 0.000002) {", "  if (state.stateReligionId && share > 0.7 && region.population > 8000 && rng() < chance(0.000002)) {"),
("  const issued = updateLeaders(world, currentTick);", "  const issued = updateLeaders(world, currentTick, weekScale);"),
("    applyReligionPolitics(region, world, currentTick);", "    applyReligionPolitics(region, world, currentTick, weekScale);"),
])

patch('js/ai/nationAi.js', [
("export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng) {", "export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const chance = (weekly) => 1 - Math.pow(1 - weekly, weekScale);"),
("    chooseAiReligion(region, religiousWorld, currentTick, rng);", "    chooseAiReligion(region, religiousWorld, currentTick, rng, weekScale);"),
("    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng);", "    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));"),
("    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng);", "    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));"),
("    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng);", "    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK));"),
("function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {\n  if (!Number.isFinite(currentTick) || currentTick % EMBARGO_REVIEW_INTERVAL !== stableAiHash(region.id) % EMBARGO_REVIEW_INTERVAL) return;", """function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {
  if (!Number.isFinite(currentTick)) return;
  const offset = stableAiHash(region.id) % EMBARGO_REVIEW_INTERVAL;
  const bucket = Math.floor((currentTick - offset) / EMBARGO_REVIEW_INTERVAL);
  if (region._lastEmbargoReviewBucket === bucket || (region._lastEmbargoReviewBucket === undefined && currentTick < offset)) {
    region._lastEmbargoReviewBucket = bucket; return;
  }
  region._lastEmbargoReviewBucket = bucket;"""),
("function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng) {", "function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) {"),
("  if (rng() > CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) return;", "  if (rng() > considerationChance) return;"),
("function maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng) {", "function maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, considerationChance = DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK) {"),
("  if (rng() > DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK) return;", "  if (rng() > considerationChance) return;"),
("function maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng) {", "function maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = RAID_CONSIDERATION_CHANCE_PER_WEEK) {"),
("  if (rng() > RAID_CONSIDERATION_CHANCE_PER_WEEK) return;", "  if (rng() > considerationChance) return;"),
])

patch('js/military/banditry.js', [
("export function tickBanditry(regions, toolTypes, agreements = []) {", "export function tickBanditry(regions, toolTypes, agreements = [], elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const fractionOverPeriod = (weeklyFraction) => 1 - Math.pow(1 - clamp01(weeklyFraction), weekScale);"),
("    const suppressed = Math.min(banditPop, banditPop * suppressionRate * SUPPRESSION_REFERENCE * punishmentSuppression);", "    const weeklySuppression = clamp01(suppressionRate * SUPPRESSION_REFERENCE * punishmentSuppression);\n    const suppressed = Math.min(banditPop, banditPop * fractionOverPeriod(weeklySuppression));"),
("    const raidLossFraction = RAID_INTENSITY * severity / posture.settlementProtection;", "    const raidLossFraction = fractionOverPeriod(RAID_INTENSITY * severity / posture.settlementProtection);"),
("    const foodNeed = activeBandits * FOOD_PER_PERSON_PER_WEEK;", "    const foodNeed = activeBandits * FOOD_PER_PERSON_PER_WEEK * weekScale;"),
("    const reintegrated = Math.min(region.banditPopulation,\n      region.banditPopulation * BANDIT_REINTEGRATION_RATE * civilianOpportunity * (0.25 + livelihoodShortfall));", "    const reintegrated = Math.min(region.banditPopulation,\n      region.banditPopulation * fractionOverPeriod(BANDIT_REINTEGRATION_RATE * civilianOpportunity * (0.25 + livelihoodShortfall)));"),
("      ? Math.min(region.banditPopulation, region.banditPopulation * BANDIT_DISPERSAL_RATE * livelihoodShortfall)", "      ? Math.min(region.banditPopulation, region.banditPopulation * fractionOverPeriod(BANDIT_DISPERSAL_RATE * livelihoodShortfall))"),
("    const starved = Math.min(region.banditPopulation,\n      region.banditPopulation * BANDIT_STARVATION_RATE * livelihoodShortfall);", "    const starved = Math.min(region.banditPopulation,\n      region.banditPopulation * fractionOverPeriod(BANDIT_STARVATION_RATE * livelihoodShortfall));"),
("    const banditDeathRate = BANDIT_DEATH_INTENSITY * severity / posture.settlementProtection;", "    const banditDeathRate = fractionOverPeriod(BANDIT_DEATH_INTENSITY * severity / posture.settlementProtection);"),
])

patch('js/main.js', [
("    tickBanditry(regions, toolTypes, agreements);", "    tickBanditry(regions, toolTypes, agreements, time.elapsedDays);"),
("      religiousWorld, calendarWeek, toolTypes, Math.random);", "      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays);"),
])

patch('tools/calibrate.mjs', [
("    tickBanditry(regions, toolTypes, agreements);", "    tickBanditry(regions, toolTypes, agreements, time.elapsedDays);"),
("      religiousWorld, calendarWeek, toolTypes, rng);", "      religiousWorld, calendarWeek, toolTypes, rng, time.elapsedDays);"),
])
