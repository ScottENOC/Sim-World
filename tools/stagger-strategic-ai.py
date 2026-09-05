from pathlib import Path
p=Path('js/ai/nationAi.js'); s=p.read_text()
s=s.replace("const EMBARGO_REVIEW_INTERVAL = 26;", "const EMBARGO_REVIEW_INTERVAL = 26;\nconst STRATEGIC_REVIEW_INTERVAL = 13;", 1)
old="""export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const chance = (weekly) => 1 - Math.pow(1 - weekly, weekScale);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng);
  for (const region of regions) {
    if (region.controllingActorId === playerRegionId) continue;
    chooseAiMilitaryPolicies(region);
    setMilitaryTargets(region);
    chooseAiConstruction(region, currentTick, rng);
    chooseAiSiegeTargets(region);
    chooseAiReligion(region, religiousWorld, currentTick, rng, weekScale);
    maybeAdjustTradeEmbargo(region, regionsById, currentTick);
    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));
    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));
    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK));
  }
}"""
new="""export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7) {
  const baseWeekScale = Math.max(0.01, elapsedDays / 7);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng);
  for (const region of regions) {
    if (region.controllingActorId === playerRegionId) continue;
    // Operational posture stays responsive every monthly world tick.
    chooseAiMilitaryPolicies(region);
    setMilitaryTargets(region);

    // Strategic choices are much slower-moving. Spread quarterly reviews over
    // stable cohorts so a large world does not make every ruler reconsider
    // construction, religion and foreign policy in the same month.
    const strategicWeeks = strategicReviewWeeks(region, currentTick, baseWeekScale);
    if (strategicWeeks <= 0) continue;
    const chance = (weekly) => 1 - Math.pow(1 - weekly, strategicWeeks);
    chooseAiConstruction(region, currentTick, rng);
    chooseAiSiegeTargets(region);
    chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks);
    maybeAdjustTradeEmbargo(region, regionsById, currentTick);
    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));
    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));
    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK));
  }
}"""
if old not in s: raise SystemExit('tickNationAi anchor missing')
s=s.replace(old,new,1)
anchor="""function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {"""
helper="""function strategicReviewWeeks(region, currentTick, fallbackWeeks) {
  if (!Number.isFinite(currentTick)) return fallbackWeeks;
  const offset = stableAiHash(region.id) % STRATEGIC_REVIEW_INTERVAL;
  const bucket = Math.floor((currentTick - offset) / STRATEGIC_REVIEW_INTERVAL);
  if (!Number.isFinite(region._lastStrategicAiTick)) {
    if (currentTick < offset) return 0;
    region._lastStrategicAiTick = currentTick;
    region._lastStrategicAiBucket = bucket;
    return fallbackWeeks;
  }
  if (region._lastStrategicAiBucket === bucket) return 0;
  const elapsed = Math.max(fallbackWeeks, currentTick - region._lastStrategicAiTick);
  region._lastStrategicAiTick = currentTick;
  region._lastStrategicAiBucket = bucket;
  return elapsed;
}

function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {"""
if anchor not in s: raise SystemExit('embargo anchor missing')
s=s.replace(anchor,helper,1)
p.write_text(s)
