from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {text.count(old)}')
    p.write_text(text.replace(old, new))

# 1. Stop benchmarking an obsolete guessed future region count.
p = Path('.github/workflows/performance-calibration.yml')
text = p.read_text()
start = text.find('      - name: Full-world proxy monthly benchmark\n')
end = text.find('      - name: Current-world V8 hotspot profile\n')
if start >= 0 and end > start:
    text = text[:start] + text[end:]
elif 'Full-world proxy monthly benchmark' in text or '2830' in text:
    raise SystemExit('performance calibration proxy block could not be removed safely')
p.write_text(text)

# 2. Profiler: cooperative UI waits are intentional browser time, not simulation work.
replace_once('js/core/performanceProfiler.js',
"""      metrics: Object.create(null),
    };
  }

  function measure(label, fn) {
""",
"""      metrics: Object.create(null),
      cooperativeYieldMs: 0,
    };
  }

  function recordCooperativeYield(durationMs) {
    if (!active || !current) return;
    current.cooperativeYieldMs += Math.max(0, Number(durationMs) || 0);
  }

  function measure(label, fn) {
""", 'profiler yield accumulator')
replace_once('js/core/performanceProfiler.js',
"""    const total = now() - current.start;
    const measured = Object.values(current.stages).reduce((sum, value) => sum + value, 0);
    samples.push({
      total,
      unattributed: Math.max(0, total - measured),
""",
"""    const wallTotal = now() - current.start;
    const cooperativeYieldMs = Math.min(wallTotal, current.cooperativeYieldMs || 0);
    const total = Math.max(0, wallTotal - cooperativeYieldMs);
    const measured = Object.values(current.stages).reduce((sum, value) => sum + value, 0);
    samples.push({
      total,
      wallTotal,
      cooperativeYieldMs,
      unattributed: Math.max(0, total - measured),
""", 'profiler subtract yield')
replace_once('js/core/performanceProfiler.js',
"""    lines.push('TOTAL TICK');
    lines.push(`  last: ${formatMs(totals[totals.length - 1])}`);
""",
"""    lines.push('TOTAL TICK WORK (cooperative UI wait excluded)');
    lines.push(`  last: ${formatMs(totals[totals.length - 1])}`);
""", 'profiler total label')
replace_once('js/core/performanceProfiler.js',
"""    lines.push(`  max:  ${formatMs(Math.max(...totals))}`);
    lines.push('');
    lines.push('SUBSYSTEMS (sorted by average time)');
""",
"""    lines.push(`  max:  ${formatMs(Math.max(...totals))}`);
    const cooperativeWaits = samples.map((sample) => sample.cooperativeYieldMs || 0);
    lines.push(`  cooperative UI wait avg: ${formatMs(average(cooperativeWaits))} · max: ${formatMs(Math.max(...cooperativeWaits))}`);
    lines.push('');
    lines.push('SUBSYSTEMS (sorted by average time)');
""", 'profiler wait reporting')
replace_once('js/core/performanceProfiler.js',
"""    metric,
    endTick,
""",
"""    metric,
    recordCooperativeYield,
    endTick,
""", 'profiler public method')

replace_once('js/main.js',
"""  const yieldForUi = async () => {
    const yieldStartedAt = performance.now();
    do { await nextUiFrame(); } while (clock.isInteractionDeferred());
    clock.recordCooperativeYield(performance.now() - yieldStartedAt);
  };
""",
"""  const yieldForUi = async () => {
    const yieldStartedAt = performance.now();
    do { await nextUiFrame(); } while (clock.isInteractionDeferred());
    const durationMs = performance.now() - yieldStartedAt;
    clock.recordCooperativeYield(durationMs);
    profiler.recordCooperativeYield(durationMs);
  };
""", 'main profiler cooperative wait')

# 3. Trade: chokepoint control is constant during a market-search phase. Cache each
# passage snapshot once per tick instead of rescanning the whole world per route.
replace_once('js/economy/transitTolls.js',
"""function seaRateForTransit(origin, passageIds, regions, regionsById, agreements) {
""",
"""function seaRateForTransit(origin, passageIds, regions, regionsById, agreements, context = null) {
""", 'sea transit context signature')
replace_once('js/economy/transitTolls.js',
"""  for (const passageId of passageIds || []) {
    const snapshot = chokepointControlSnapshot(passageId, regions);
    const controller = snapshot?.controller;
""",
"""  for (const passageId of passageIds || []) {
    let snapshot = context?.chokepointSnapshots?.get(passageId);
    if (snapshot === undefined) {
      snapshot = chokepointControlSnapshot(passageId, regions);
      context?.chokepointSnapshots?.set(passageId, snapshot);
    }
    const controller = snapshot?.controller;
""", 'cache chokepoint snapshot')
replace_once('js/economy/transitTolls.js',
"""export function estimateTransitToll(origin, route, regions, regionsById, agreements = []) {
  if (!route) return { rate: 0, charges: [], reliabilityMultiplier: 1, blocked: false };
  return route.mode === 'sea'
    ? seaRateForTransit(origin, route.passageIds || [], regions, regionsById, agreements)
""",
"""export function estimateTransitToll(origin, route, regions, regionsById, agreements = [], context = null) {
  if (!route) return { rate: 0, charges: [], reliabilityMultiplier: 1, blocked: false };
  return route.mode === 'sea'
    ? seaRateForTransit(origin, route.passageIds || [], regions, regionsById, agreements, context)
""", 'estimate transit context')
replace_once('js/economy/trade.js',
"""function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements) {
""",
"""function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, transitContext = null) {
""", 'trade opportunity context signature')
replace_once('js/economy/trade.js',
"""    const transit = estimateTransitToll(region, route, regions, regionsById, agreements);
""",
"""    const transit = estimateTransitToll(region, route, regions, regionsById, agreements, transitContext);
""", 'trade transit context call')
replace_once('js/economy/trade.js',
"""  let candidateMarketsChecked = 0; let opportunitiesFound = 0; let searchingRegions = 0;
  measureDetail('Trade: market search and launch', () => {
""",
"""  let candidateMarketsChecked = 0; let opportunitiesFound = 0; let searchingRegions = 0;
  const transitContext = { chokepointSnapshots: new Map() };
  measureDetail('Trade: market search and launch', () => {
""", 'trade per-tick transit context')
replace_once('js/economy/trade.js',
"""    const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements);
""",
"""    const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, transitContext);
""", 'trade context propagation')

# 4. Religious politics: the old helpers repeatedly scanned every region for the
# same religion/polity follower totals and territory lists. Build those exact
# aggregates once per religious-politics tick. No cadence or mechanics change.
replace_once('js/society/medievalReligiousPolitics.js',
"""function actorId(region) { return region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id; }

function followerShareInPolity(religionId, polityId, regions) {
""",
"""function actorId(region) { return region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id; }

let activePoliticsIndex = null;
function buildPoliticsIndex(regions) {
  const regionsByPolity = new Map();
  const populationByPolity = new Map();
  const followersByReligionPolity = new Map();
  const regionById = new Map();
  for (const region of regions) {
    regionById.set(region.id, region);
    const polityId = actorId(region);
    if (!regionsByPolity.has(polityId)) regionsByPolity.set(polityId, []);
    regionsByPolity.get(polityId).push(region);
    const population = Math.max(0, region.population || 0);
    populationByPolity.set(polityId, (populationByPolity.get(polityId) || 0) + population);
    for (const [religionId, share] of Object.entries(region.religion?.shares || {})) {
      const key = `${religionId}\u0000${polityId}`;
      followersByReligionPolity.set(key, (followersByReligionPolity.get(key) || 0) + population * Math.max(0, share || 0));
    }
  }
  return { source: regions, regionsByPolity, populationByPolity, followersByReligionPolity, regionById };
}

function followerShareInPolity(religionId, polityId, regions) {
  if (activePoliticsIndex?.source === regions) {
    const population = activePoliticsIndex.populationByPolity.get(polityId) || 0;
    const followers = activePoliticsIndex.followersByReligionPolity.get(`${religionId}\u0000${polityId}`) || 0;
    return population > 0 ? followers / population : 0;
  }
""", 'religious politics index')
replace_once('js/society/medievalReligiousPolitics.js',
"""function followersInPolity(religionId, polityId, regions) {
  let followers = 0;
""",
"""function followersInPolity(religionId, polityId, regions) {
  if (activePoliticsIndex?.source === regions) return activePoliticsIndex.followersByReligionPolity.get(`${religionId}\u0000${polityId}`) || 0;
  let followers = 0;
""", 'religious followers cache')
replace_once('js/society/medievalReligiousPolitics.js',
"""function polityRegions(polityId, regions) { return regions.filter(region => actorId(region) === polityId); }
function authoritySeatPlace(authority, regions) {
  const seat = regions.find(region => region.id === authority.seatRegionId);
""",
"""function polityRegions(polityId, regions) {
  if (activePoliticsIndex?.source === regions) return activePoliticsIndex.regionsByPolity.get(polityId) || [];
  return regions.filter(region => actorId(region) === polityId);
}
function authoritySeatPlace(authority, regions) {
  const seat = activePoliticsIndex?.source === regions
    ? activePoliticsIndex.regionById.get(authority.seatRegionId)
    : regions.find(region => region.id === authority.seatRegionId);
""", 'religious territory cache')
replace_once('js/society/medievalReligiousPolitics.js',
"""export function tickMedievalReligiousPolitics(regions, religiousWorld, polities, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR); const events=[];
""",
"""export function tickMedievalReligiousPolitics(regions, religiousWorld, polities, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  activePoliticsIndex = buildPoliticsIndex(regions);
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR); const events=[];
""", 'religious index activation')
replace_once('js/society/medievalReligiousPolitics.js',
"""    maybeIssueWarOrPeaceCall(authority,religion,polities,regions,currentTick,years,rng,events,options);
  }
  return events;
}
""",
"""    maybeIssueWarOrPeaceCall(authority,religion,polities,regions,currentTick,years,rng,events,options);
  }
  activePoliticsIndex = null;
  return events;
}
""", 'religious index cleanup')

# 5. Communication: avoid needless temporary arrays/sorts inside the quarterly
# pass. This leaves the same contacts, weights and cadence intact.
replace_once('js/diplomacy/languageCommunication.js',
"""    const traffic = (region.diplomaticMessages || []).filter((m) => (m.departTick ?? -Infinity) >= currentTick - 52).length;
""",
"""    let traffic = 0;
    for (const message of region.diplomaticMessages || []) if ((message.departTick ?? -Infinity) >= currentTick - 52) traffic += 1;
""", 'communication traffic allocation')
replace_once('js/diplomacy/languageCommunication.js',
"""  for (const region of regions) {
    const recent = region.recentTradePartners instanceof Map ? [...region.recentTradePartners.keys()] : [...(region.tradePartnerIds || [])];
    for (const otherId of recent.slice(0, 12)) {
""",
"""  for (const region of regions) {
    const recent = region.recentTradePartners instanceof Map ? region.recentTradePartners.keys() : (region.tradePartnerIds || []);
    let recentCount = 0;
    for (const otherId of recent) {
      if (recentCount++ >= 12) break;
""", 'communication partner iteration')

print('Applied no-regrets iOS hotspot optimisations')
