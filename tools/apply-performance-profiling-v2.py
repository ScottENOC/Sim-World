from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Nation AI: expose nested timings while the existing profiler is active.
# The wrappers are no-ops when profiling is disabled, so ordinary simulation
# behaviour and overhead remain effectively unchanged.
# ---------------------------------------------------------------------------
path = Path('js/ai/nationAi.js')
text = path.read_text()
text = replace_once(text,
"""export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7, options = {}) {
  const baseWeekScale = Math.max(0.01, elapsedDays / 7);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options);
  for (const region of regions) {
""",
"""export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7, options = {}) {
  const baseWeekScale = Math.max(0.01, elapsedDays / 7);
  const profiler = options.profiler;
  const detail = (label, fn) => profiler?.measureDetail ? profiler.measureDetail(`Nation AI: ${label}`, fn) : fn();
  const metric = (label, value) => profiler?.metric?.(`Nation AI ${label}`, value);
  const regionsById = detail('build region index', () => new Map(regions.map((region) => [region.id, region])));
  let aiRegions = 0;
  let strategicReviews = 0;
  detail('campaign management', () => manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options));
  for (const region of regions) {
""", 'nation ai header')
text = replace_once(text,
"""    if (region.controllingActorId !== playerRegionId) {
      activateJointOperations(region, regionsById, agreements, activeCampaigns, polities, currentTick, rng);
    }
    if (region.controllingActorId === playerRegionId) continue;
    // Operational posture stays responsive every monthly world tick.
    chooseAiMilitaryPolicies(region);
    chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns);
""",
"""    if (region.controllingActorId !== playerRegionId) {
      detail('joint operations', () => activateJointOperations(region, regionsById, agreements, activeCampaigns, polities, currentTick, rng));
    }
    if (region.controllingActorId === playerRegionId) continue;
    aiRegions += 1;
    // Operational posture stays responsive every monthly world tick.
    detail('military policy', () => chooseAiMilitaryPolicies(region));
    detail('military strategy', () => chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns));
""", 'nation ai operational calls')
text = replace_once(text,
"""    const strategicWeeks = strategicReviewWeeks(region, currentTick, baseWeekScale);
    if (strategicWeeks <= 0) continue;
    const chance = (weekly) => 1 - Math.pow(1 - weekly, strategicWeeks);
    applyMemoryDrivenNpcPolicy(region, religiousWorld, currentTick, rng, strategicWeeks);
    chooseAiConstruction(region, currentTick, rng);
    chooseAiSiegeTargets(region);
    chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks);
    maybeManageTransitTolls(region, regions, rng);
    maybeAdjustTradeEmbargo(region, regionsById, currentTick);
    maybeScout(region, regionsById, currentTick, rng);
    chooseNpcDiplomatPosting(region, regions, currentTick, rng);
    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));
    const launchedCivilWarCampaign = maybeLaunchCivilWarCampaign(region, regionsById, activeCampaigns, polities, currentTick, rng);
    if (!launchedCivilWarCampaign) maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));
    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK));
  }
}
""",
"""    const strategicWeeks = strategicReviewWeeks(region, currentTick, baseWeekScale);
    if (strategicWeeks <= 0) continue;
    strategicReviews += 1;
    const chance = (weekly) => 1 - Math.pow(1 - weekly, strategicWeeks);
    detail('memory policy', () => applyMemoryDrivenNpcPolicy(region, religiousWorld, currentTick, rng, strategicWeeks));
    detail('construction choice', () => chooseAiConstruction(region, currentTick, rng));
    detail('siege choice', () => chooseAiSiegeTargets(region));
    detail('religion choice', () => chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks));
    detail('transit tolls', () => maybeManageTransitTolls(region, regions, rng));
    detail('trade embargo', () => maybeAdjustTradeEmbargo(region, regionsById, currentTick));
    detail('scouting choice', () => maybeScout(region, regionsById, currentTick, rng));
    detail('diplomat posting', () => chooseNpcDiplomatPosting(region, regions, currentTick, rng));
    detail('agreement choice', () => maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK)));
    const launchedCivilWarCampaign = detail('civil war choice', () => maybeLaunchCivilWarCampaign(region, regionsById, activeCampaigns, polities, currentTick, rng));
    if (!launchedCivilWarCampaign) detail('campaign choice', () => maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK)));
    detail('raid choice', () => maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK)));
  }
  metric('regions evaluated', aiRegions);
  metric('strategic reviews', strategicReviews);
  metric('active campaigns', activeCampaigns.length);
  metric('active raids', activeRaids.length);
}
""", 'nation ai strategic calls')
path.write_text(text)

# ---------------------------------------------------------------------------
# Exploration events: include a human-readable destination for presentation.
# ---------------------------------------------------------------------------
path = Path('js/economy/oceanicExploration.js')
text = path.read_text()
text = replace_once(text,
"""      targetSeaId: route.targetSeaId, seaIds: [...route.seaIds], distanceKm: route.distanceKm,
      successChance, routeReliability: routeState.reliability, discoveredRegionIds,
""",
"""      targetSeaId: route.targetSeaId, targetSeaName: targetSea?.name || route.targetSeaId,
      seaIds: [...route.seaIds], distanceKm: route.distanceKm,
      successChance, routeReliability: routeState.reliability, discoveredRegionIds,
""", 'exploration success event')
text = replace_once(text,
"""    regionId: region.id, polityId: polityIdFor(region), targetSeaId: route.targetSeaId,
    seaIds: [...route.seaIds], distanceKm: route.distanceKm, successChance,
""",
"""    regionId: region.id, polityId: polityIdFor(region), targetSeaId: route.targetSeaId,
    targetSeaName: targetSea?.name || route.targetSeaId,
    seaIds: [...route.seaIds], distanceKm: route.distanceKm, successChance,
""", 'exploration failure event')
path.write_text(text)

# ---------------------------------------------------------------------------
# Main integration: pass profiler into Nation AI and present exploration events.
# ---------------------------------------------------------------------------
path = Path('js/main.js')
text = path.read_text()
text = replace_once(text,
"""    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,
      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions }));
""",
"""    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,
      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions, profiler }));
""", 'main nation ai profiler')

exploration_handlers = """  if (event.type === 'exploration_voyage_success') {
    const coastText = event.discoveredRegionIds?.length
      ? ` The crew also charted ${event.discoveredRegionIds.length} previously unknown coastal ${event.discoveredRegionIds.length === 1 ? 'region' : 'regions'}.`
      : '';
    document.getElementById('event-title').textContent = 'Exploration voyage returns';
    document.getElementById('event-body').textContent = `A maritime expedition reached ${event.targetSeaName || event.targetSeaId || 'previously uncertain waters'} and returned with usable route knowledge after roughly ${Math.round(event.distanceKm || 0).toLocaleString()} km of sailing.${coastText}`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'exploration_voyage_failed' || event.type === 'exploration_voyage_lost') {
    const lost = event.type === 'exploration_voyage_lost' || event.shipLost;
    document.getElementById('event-title').textContent = lost ? 'Exploration voyage lost' : 'Exploration voyage turns back';
    document.getElementById('event-body').textContent = lost
      ? `An expedition attempting to reach ${event.targetSeaName || event.targetSeaId || 'unknown waters'} failed to return. A ship and its accumulated maritime experience have been lost.`
      : `An expedition attempting to reach ${event.targetSeaName || event.targetSeaId || 'unknown waters'} was forced back. The failure still leaves fragmentary knowledge that may help a later voyage.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
"""
text = replace_once(text,
"""  if (event.type === 'religious_variant') {
""",
exploration_handlers + """  if (event.type === 'religious_variant') {
""", 'main exploration event handlers')
text = replace_once(text,
"""    console.warn('Unhandled simulation event', event);
""",
"""    console.warn(`Unhandled simulation event: ${event.type || 'unknown'}`, event);
""", 'main unknown event warning')
path.write_text(text)
