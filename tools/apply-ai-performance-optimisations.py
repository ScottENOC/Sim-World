from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Strategic planning: build world-scale indexes once per Nation AI pass instead
# of scanning all regions/agreements once per ruler.
# ---------------------------------------------------------------------------
path = Path('js/military/strategicPlanning.js')
text = path.read_text()
text = replace_once(text,
"import { availableVassalLevies } from '../politics/polities.js?v=20260904-war1';",
"import { availableVassalLevies, vassalLevyOffer } from '../politics/polities.js?v=20260904-war1';",
'strategy polity import')
anchor = "function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id; }\n"
addition = anchor + """

export function buildMilitaryStrategyContext(regions = [], agreements = [], polities = [], currentTick = 0, activeCampaigns = []) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const politiesById = new Map(polities.map((polity) => [polity.id, polity]));
  const territoriesByPolity = new Map();
  for (const region of regions) {
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    if (!polityId) continue;
    let list = territoriesByPolity.get(polityId);
    if (!list) { list = []; territoriesByPolity.set(polityId, list); }
    list.push(region);
  }
  // Preserve activeAgreementBetween's preference for war commitments over
  // ordinary military support, but index the result once for all rulers.
  const supportByRegion = new Map();
  const setSupport = (regionId, otherId, agreement) => {
    let map = supportByRegion.get(regionId);
    if (!map) { map = new Map(); supportByRegion.set(regionId, map); }
    const existing = map.get(otherId);
    if (!existing || (agreement.type === 'war_commitment' && existing.type !== 'war_commitment')) map.set(otherId, agreement);
  };
  for (const agreement of agreements) {
    if (!agreement?.active || !['war_commitment', 'military_support'].includes(agreement.type)) continue;
    setSupport(agreement.fromId, agreement.toId, agreement);
    setSupport(agreement.toId, agreement.fromId, agreement);
  }
  return { regions, agreements, polities, currentTick, activeCampaigns, regionsById, politiesById, territoriesByPolity, supportByRegion };
}
"""
text = replace_once(text, anchor, addition, 'strategy context insertion')
text = replace_once(text,
"function vassalContribution(region, regions, polities, currentTick, assumption) {\n  const factor = SUPPORT_FACTOR[assumption] ?? 0;\n  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };\n  const offers = availableVassalLevies(region, regions, polities, currentTick) || [];",
"function vassalContribution(region, regions, polities, currentTick, assumption, strategyContext = null) {\n  const factor = SUPPORT_FACTOR[assumption] ?? 0;\n  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };\n  let offers;\n  if (strategyContext) {\n    const polityId = region.governance?.sovereignPolityId || region.polityId;\n    const polity = strategyContext.politiesById.get(polityId);\n    const subjects = polity?.capitalRegionId === region.id\n      ? (strategyContext.territoriesByPolity.get(polityId) || []).filter((subject) => subject.id !== region.id)\n      : [];\n    offers = subjects.map((subject) => ({ region: subject, ...vassalLevyOffer(subject, region, currentTick) }));\n  } else {\n    offers = availableVassalLevies(region, regions, polities, currentTick) || [];\n  }",
'vassal indexed contribution')
old_ally = """function allyContribution(region, regions, agreements, assumption) {
  const factor = SUPPORT_FACTOR[assumption] ?? 0;
  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };
  let nominal = 0; let expected = 0; const sources = [];
  for (const other of regions) {
    if (other.id === region.id) continue;
    const active = activeAgreementBetween(agreements, region.id, other.id, 'war_commitment') || activeAgreementBetween(agreements, region.id, other.id, 'military_support');
    if (!active) continue;
    const personnel = active.type === 'war_commitment'
      ? Math.max(0, active.personnel || 0)
      : Math.max(0, Math.min(active.personnel || 0, (other.army?.personnel || 0) * 0.45));
    if (personnel <= 0) continue;
    const attitude = clamp((attitudeToward(other, region.id) + 1) / 2);
    const confidence = clamp(0.35 + attitude * 0.5 + (active.type === 'war_commitment' ? 0.15 : 0));
    nominal += personnel;
    const discounted = personnel * factor * confidence;
    expected += discounted;
    sources.push({ regionId: other.id, nominal: personnel, expected: discounted, confidence, agreementId: active.id });
  }
  return { nominal, expected, sources };
}
"""
new_ally = """function allyContribution(region, regions, agreements, assumption, strategyContext = null) {
  const factor = SUPPORT_FACTOR[assumption] ?? 0;
  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };
  let nominal = 0; let expected = 0; const sources = [];
  const indexed = strategyContext?.supportByRegion.get(region.id);
  const candidates = indexed
    ? [...indexed.entries()].map(([otherId, active]) => ({ other: strategyContext.regionsById.get(otherId), active }))
    : regions.map((other) => ({
        other,
        active: other.id === region.id ? null : activeAgreementBetween(agreements, region.id, other.id, 'war_commitment') || activeAgreementBetween(agreements, region.id, other.id, 'military_support'),
      }));
  for (const { other, active } of candidates) {
    if (!other || !active) continue;
    const personnel = active.type === 'war_commitment'
      ? Math.max(0, active.personnel || 0)
      : Math.max(0, Math.min(active.personnel || 0, (other.army?.personnel || 0) * 0.45));
    if (personnel <= 0) continue;
    const attitude = clamp((attitudeToward(other, region.id) + 1) / 2);
    const confidence = clamp(0.35 + attitude * 0.5 + (active.type === 'war_commitment' ? 0.15 : 0));
    nominal += personnel;
    const discounted = personnel * factor * confidence;
    expected += discounted;
    sources.push({ regionId: other.id, nominal: personnel, expected: discounted, confidence, agreementId: active.id });
  }
  return { nominal, expected, sources };
}
"""
text = replace_once(text, old_ally, new_ally, 'ally indexed contribution')
text = replace_once(text,
"  const { regions = [], polities = [], agreements = [], activeCampaigns = [], currentTick = 0 } = context;\n  const target = regions.find((r) => r.id === strategy.targetRegionId) || null;",
"  const { regions = [], polities = [], agreements = [], activeCampaigns = [], currentTick = 0, strategyContext = null } = context;\n  const target = strategyContext?.regionsById.get(strategy.targetRegionId) || regions.find((r) => r.id === strategy.targetRegionId) || null;",
'review target lookup')
text = replace_once(text,
"  const vassals = vassalContribution(region, regions, polities, currentTick, strategy.vassalAssumption);\n  const allies = allyContribution(region, regions, agreements, strategy.allyAssumption);",
"  const vassals = vassalContribution(region, regions, polities, currentTick, strategy.vassalAssumption, strategyContext);\n  const allies = allyContribution(region, regions, agreements, strategy.allyAssumption, strategyContext);",
'review indexed support')
old_choose = """export function chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns = []) {
  const strategy = ensureMilitaryStrategy(region);
  const known = [...directContactIds(region)].map((id) => regions.find((r) => r.id === id)).filter(Boolean);
"""
new_choose = """export function chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns = [], strategyContext = null) {
  const strategy = ensureMilitaryStrategy(region);
  const ctx = strategyContext || buildMilitaryStrategyContext(regions, agreements, polities, currentTick, activeCampaigns);
  const known = [...directContactIds(region)].map((id) => ctx.regionsById.get(id)).filter(Boolean);
"""
text = replace_once(text, old_choose, new_choose, 'choose indexed contacts')
text = replace_once(text,
"  reviewMilitaryStrategy(region, { regions, agreements, polities, currentTick, activeCampaigns });",
"  reviewMilitaryStrategy(region, { regions, agreements, polities, currentTick, activeCampaigns, strategyContext: ctx });",
'choose indexed review')
path.write_text(text)

# ---------------------------------------------------------------------------
# Scouting: reuse the region index and pre-index coastal regions by sea. This
# preserves the candidate set while avoiding full-world coastal scans.
# ---------------------------------------------------------------------------
path = Path('js/core/scouting.js')
text = path.read_text()
anchor = "function angularDifference(a, b) {\n  return Math.abs(((a - b + 540) % 360) - 180);\n}\n"
addition = anchor + """

export function buildScoutingContext(regions = [], regionsById = null) {
  const byId = regionsById instanceof Map ? regionsById : new Map(regions.map((region) => [region.id, region]));
  const coastalBySea = new Map();
  const orderById = new Map();
  regions.forEach((region, index) => {
    orderById.set(region.id, index);
    if (!region.isCoastal) return;
    for (const seaId of region.adjacentSeaIds || []) {
      let list = coastalBySea.get(seaId);
      if (!list) { list = []; coastalBySea.set(seaId, list); }
      list.push(region);
    }
  });
  return { regionsById: byId, coastalBySea, orderById };
}
"""
text = replace_once(text, anchor, addition, 'scouting context insertion')
text = replace_once(text,
"export function scoutingCandidates(region, regions, mode = 'auto', heading = null) {\n  if (!region) return [];\n  const byId = new Map(regions.map((candidate) => [candidate.id, candidate]));",
"export function scoutingCandidates(region, regions, mode = 'auto', heading = null, scoutingContext = null) {\n  if (!region) return [];\n  const context = scoutingContext || buildScoutingContext(regions);\n  const byId = context.regionsById;",
'scouting reuse context')
old_sea = """  if (mode !== 'land' && region.isCoastal && (region.navy?.boats || 0) >= 1) {
    const maxRange = navalRangeKm(region);
    for (const target of regions) {
      if (target.id === region.id || !target.isCoastal || hasDirectContact(region, target)) continue;
      const seas = sharedSeaIds(region, target);
"""
new_sea = """  if (mode !== 'land' && region.isCoastal && (region.navy?.boats || 0) >= 1) {
    const maxRange = navalRangeKm(region);
    const nearbyCoasts = new Map();
    for (const seaId of region.adjacentSeaIds || []) {
      for (const target of context.coastalBySea.get(seaId) || []) nearbyCoasts.set(target.id, target);
    }
    const orderedTargets = [...nearbyCoasts.values()].sort((a, b) => (context.orderById.get(a.id) ?? 0) - (context.orderById.get(b.id) ?? 0));
    for (const target of orderedTargets) {
      if (target.id === region.id || hasDirectContact(region, target)) continue;
      const seas = sharedSeaIds(region, target);
"""
text = replace_once(text, old_sea, new_sea, 'scouting indexed coastal candidates')
text = replace_once(text,
"export function startScoutingMission(region, regions, currentTick, rng = Math.random, mode = 'auto', heading = null) {",
"export function startScoutingMission(region, regions, currentTick, rng = Math.random, mode = 'auto', heading = null, scoutingContext = null) {",
'scouting mission context signature')
text = replace_once(text,
"  let candidates = scoutingCandidates(region, regions, mode, chosenHeading);",
"  let candidates = scoutingCandidates(region, regions, mode, chosenHeading, scoutingContext);",
'scouting mission context use')
path.write_text(text)

# ---------------------------------------------------------------------------
# Nation AI: build those contexts once per pass and reuse them for 1,500+ NPCs.
# ---------------------------------------------------------------------------
path = Path('js/ai/nationAi.js')
text = path.read_text()
text = replace_once(text,
"import { startScoutingMission } from '../core/scouting.js?v=20260906-scouting1';",
"import { buildScoutingContext, startScoutingMission } from '../core/scouting.js?v=20260906-scouting1';",
'nation scouting import')
text = replace_once(text,
"import { chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';",
"import { buildMilitaryStrategyContext, chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';",
'nation strategy import')
text = replace_once(text,
"  const regionsById = detail('build region index', () => new Map(regions.map((region) => [region.id, region])));\n  let aiRegions = 0;",
"  const regionsById = detail('build region index', () => new Map(regions.map((region) => [region.id, region])));\n  const militaryStrategyContext = detail('military strategy context', () => buildMilitaryStrategyContext(regions, agreements, polities, currentTick, activeCampaigns));\n  const scoutingContext = detail('scouting context', () => buildScoutingContext(regions, regionsById));\n  let aiRegions = 0;",
'nation shared contexts')
text = replace_once(text,
"    detail('military strategy', () => chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns));",
"    detail('military strategy', () => chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns, militaryStrategyContext));",
'nation strategy context call')
text = replace_once(text,
"    detail('scouting choice', () => maybeScout(region, regionsById, currentTick, rng));",
"    detail('scouting choice', () => maybeScout(region, regionsById, currentTick, rng, scoutingContext));",
'nation scouting context call')
text = replace_once(text,
"function maybeScout(region, regionsById, currentTick, rng) {",
"function maybeScout(region, regionsById, currentTick, rng, scoutingContext = null) {",
'nation maybeScout signature')
text = replace_once(text,
"  startScoutingMission(region, [...regionsById.values()], currentTick, rng, 'auto');",
"  startScoutingMission(region, [...regionsById.values()], currentTick, rng, 'auto', null, scoutingContext);",
'nation scouting mission call')
path.write_text(text)

# ---------------------------------------------------------------------------
# Disease events: they were valid player events but had no renderer, which made
# the generic fallback warn and the normal event auto-pause look like a crash.
# ---------------------------------------------------------------------------
path = Path('js/main.js')
text = path.read_text()
disease_handlers = """  if (event.type === 'disease_recognised' || event.type === 'disease_outbreak') {
    const prevalencePct = Math.max(0, Number(event.prevalence) || 0) * 100;
    const deaths = Math.max(0, Number(event.deaths) || 0);
    const recognised = event.type === 'disease_recognised';
    document.getElementById('event-title').textContent = recognised ? `${event.pathogenLabel || 'Disease'} recognised` : `${event.pathogenLabel || 'Disease'} outbreak`;
    document.getElementById('event-body').textContent = recognised
      ? `Local authorities now recognise an outbreak of ${event.pathogenLabel || 'disease'}. Estimated prevalence is ${prevalencePct.toFixed(1)}%${deaths >= 1 ? `, with about ${Math.round(deaths).toLocaleString()} recent deaths` : ''}.`
      : `${event.pathogenLabel || 'Disease'} is spreading locally. Estimated prevalence has reached ${prevalencePct.toFixed(1)}%${deaths >= 1 ? `, with about ${Math.round(deaths).toLocaleString()} recent deaths` : ''}.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
"""
text = replace_once(text,
"  if (event.type === 'exploration_voyage_success') {",
disease_handlers + "  if (event.type === 'exploration_voyage_success') {",
'main disease event handlers')
path.write_text(text)
