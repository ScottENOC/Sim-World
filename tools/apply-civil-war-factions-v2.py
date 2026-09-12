from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected integration anchor missing in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


civil_war = r'''import { transferRegion } from './continuity.js?v=20260913-civil-war2';
import { canCampaign, launchCampaign } from '../military/campaigns.js?v=20260913-civil-war2';

const DAYS_PER_YEAR = 365.2425;
const REVIEW_WEEKS = 13;
const MIN_SETTLEMENT_WEEKS = 156;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function sovereignTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity?.id);
}

function localState(region) {
  return region.medievalInstitutions || region.medievalPoliticalState || {};
}

function society(region) {
  return region.medievalSociety || {};
}

function polityLegitimacy(polity) {
  return clamp(Math.max(polity?.administration?.legitimacy || 0, polity?.continuity?.legitimacy || 0));
}

function contestedRealm(parent, claimant, regions) {
  const claimantIds = new Set((parent.succession?.claimants || []).map((entry) => entry.id));
  return regions.filter((region) => claimantIds.has(region.successionAlignment) ||
    region.governance?.sovereignPolityId === parent.id || region.governance?.sovereignPolityId === claimant.id ||
    (claimant.continuity?.claims?.[region.id] || 0) >= 0.65);
}

function initialiseFactionState(parent, claimant, regions, currentTick) {
  const crisis = parent.succession?.crisis;
  if (!crisis?.escalated || !claimant) return null;
  crisis.factionPolitics ||= {
    startedTick: currentTick,
    lastReviewTick: currentTick - REVIEW_WEEKS,
    lastDefectionTick: currentTick,
    contestedRegionIds: contestedRealm(parent, claimant, regions).map((region) => region.id),
    defections: [],
    exhaustion: { [parent.id]: 0, [claimant.id]: 0 },
    settlement: null,
  };
  const state = crisis.factionPolitics;
  state.exhaustion ||= {};
  state.exhaustion[parent.id] = clamp(state.exhaustion[parent.id] || 0);
  state.exhaustion[claimant.id] = clamp(state.exhaustion[claimant.id] || 0);
  state.contestedRegionIds ||= contestedRealm(parent, claimant, regions).map((region) => region.id);
  state.defections ||= [];
  return state;
}

function supportFor(region, side, parent, claimant, regions) {
  const local = localState(region);
  const social = society(region);
  const isParent = side.id === parent.id;
  const currentOwner = region.governance?.sovereignPolityId;
  const ownerInertia = currentOwner === side.id ? 0.18 : 0;
  const neighbours = (region.neighbors || []).map((id) => regions.find((candidate) => candidate.id === id)).filter(Boolean);
  const friendlyNeighbours = neighbours.filter((candidate) => candidate.governance?.sovereignPolityId === side.id).length;
  const neighbourSignal = neighbours.length ? friendlyNeighbours / neighbours.length : 0;
  if (isParent) {
    return clamp(ownerInertia +
      (region.governance?.administrativeControl || 0) * 0.20 +
      (1 - clamp(local.grievance || 0)) * 0.17 +
      polityLegitimacy(parent) * 0.22 +
      (parent.institutionalPaths?.bureaucraticService || 0) * 0.10 +
      (region.id === parent.capitalRegionId ? 0.18 : 0) + neighbourSignal * 0.13);
  }
  return clamp(ownerInertia +
    clamp(local.grievance || 0) * 0.17 +
    clamp(local.localIdentity || 0) * 0.15 +
    clamp(region.governance?.autonomy || 0) * 0.10 +
    clamp(local.eliteOrganisation || 0) * 0.10 +
    clamp(social.estates?.privateRetinues || 0) * 0.10 +
    polityLegitimacy(claimant) * 0.18 +
    (region.id === claimant.capitalRegionId ? 0.18 : 0) + neighbourSignal * 0.12);
}

function updateExhaustion(state, polity, territories, elapsedDays) {
  if (!territories.length) return;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const pressure = territories.reduce((sum, region) => sum + clamp(region.conflictPressure || 0), 0) / territories.length;
  const instability = territories.reduce((sum, region) => sum + (1 - clamp(region.stability ?? 0.7)), 0) / territories.length;
  const armyAway = territories.reduce((sum, region) => sum + clamp((region.army?.away || 0) / Math.max(1, (region.army?.away || 0) + (region.army?.personnel || 0))), 0) / territories.length;
  state.exhaustion[polity.id] = clamp((state.exhaustion[polity.id] || 0) + years * (0.05 + pressure * 0.22 + instability * 0.10 + armyAway * 0.12));
}

function maybeDefect(parent, claimant, state, regions, polities, currentTick, rng) {
  if (currentTick - state.lastDefectionTick < REVIEW_WEEKS) return null;
  const contested = new Set(state.contestedRegionIds);
  const candidates = regions.filter((region) => contested.has(region.id) &&
    [parent.id, claimant.id].includes(region.governance?.sovereignPolityId) &&
    region.id !== parent.capitalRegionId && region.id !== claimant.capitalRegionId);
  let best = null;
  for (const region of candidates) {
    const from = region.governance.sovereignPolityId === parent.id ? parent : claimant;
    const to = from.id === parent.id ? claimant : parent;
    const stay = supportFor(region, from, parent, claimant, regions);
    const switchTo = supportFor(region, to, parent, claimant, regions);
    const margin = switchTo - stay;
    const weakHold = 1 - clamp(region.governance?.administrativeControl ?? 0.5);
    const battlefield = clamp(region.conflictPressure || 0);
    const threshold = 0.20 - weakHold * 0.05 - battlefield * 0.04;
    if (margin <= threshold) continue;
    const score = margin + weakHold * 0.15 + battlefield * 0.10;
    if (!best || score > best.score) best = { region, from, to, margin, score };
  }
  if (!best) return null;
  const chance = clamp(0.22 + best.margin * 0.8, 0.2, 0.72);
  if (rng() >= chance) return null;
  const result = transferRegion(best.region, best.from, best.to, regions, polities, currentTick, 'civil_war_defection');
  if (!result.transferred) return null;
  best.region.successionAlignment = best.to.id === claimant.id ? claimant.claimantId : parent.succession?.crisis?.leadingClaimantId;
  state.lastDefectionTick = currentTick;
  const record = { tick: currentTick, regionId: best.region.id, fromPolityId: best.from.id, toPolityId: best.to.id };
  state.defections.push(record);
  return { type: 'civil_war_defection', polityId: parent.id, claimantPolityId: claimant.id, ...record, regionName: best.region.name };
}

function settlementOpportunity(parent, claimant, state, regions, currentTick) {
  const duration = currentTick - (parent.succession?.crisis?.startedTick || currentTick);
  if (duration < MIN_SETTLEMENT_WEEKS || state.settlement) return null;
  const parentTerritories = sovereignTerritories(parent, regions);
  const claimantTerritories = sovereignTerritories(claimant, regions);
  const total = parentTerritories.length + claimantTerritories.length;
  if (!parentTerritories.length || !claimantTerritories.length || total < 2) return null;
  const parentShare = parentTerritories.length / total;
  const stalled = currentTick - state.lastDefectionTick >= 52;
  const exhaustion = ((state.exhaustion[parent.id] || 0) + (state.exhaustion[claimant.id] || 0)) / 2;
  if (!stalled || parentShare < 0.2 || parentShare > 0.8 || exhaustion < 0.22) return null;
  return { parentTerritories, claimantTerritories, parentShare, exhaustion };
}

function applyPartitionSettlement(parent, claimant, state, currentTick) {
  state.settlement = { type: 'negotiated_partition', tick: currentTick, parentPolityId: parent.id, claimantPolityId: claimant.id };
  const crisis = parent.succession.crisis;
  crisis.contested = false;
  crisis.resolved = true;
  crisis.continuityResolved = true;
  crisis.resolvedTick = currentTick;
  crisis.winnerPolityId = null;
  crisis.loserPolityId = null;
  claimant.claimantOfPolityId = null;
  if (claimant.continuity?.successionClaim) {
    claimant.continuity.successionClaim.status = 'settled_partition';
    claimant.continuity.successionClaim.settledTick = currentTick;
  }
  if (parent.continuity) parent.continuity.status = 'sovereign';
  if (claimant.continuity) claimant.continuity.status = 'sovereign';
  return state.settlement;
}

export function tickCivilWarFactionPolitics(parent, polities, regions, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const crisis = parent?.succession?.crisis;
  if (!crisis?.escalated || crisis.continuityResolved || crisis.resolved) return [];
  const claimant = polities.find((candidate) => candidate.id === crisis.claimantPolityId);
  if (!claimant) return [];
  const state = initialiseFactionState(parent, claimant, regions, currentTick);
  if (!state) return [];
  const parentTerritories = sovereignTerritories(parent, regions);
  const claimantTerritories = sovereignTerritories(claimant, regions);
  updateExhaustion(state, parent, parentTerritories, elapsedDays);
  updateExhaustion(state, claimant, claimantTerritories, elapsedDays);
  if (currentTick - state.lastReviewTick < REVIEW_WEEKS) return [];
  state.lastReviewTick = currentTick;
  const events = [];
  const defection = maybeDefect(parent, claimant, state, regions, polities, currentTick, rng);
  if (defection) events.push(defection);
  const opportunity = settlementOpportunity(parent, claimant, state, regions, currentTick);
  if (opportunity) {
    const playerInvolved = options.playerPolityId && [parent.id, claimant.id].includes(options.playerPolityId);
    if (playerInvolved) {
      if (!state.lastSettlementOfferTick || currentTick - state.lastSettlementOfferTick >= 52) {
        state.lastSettlementOfferTick = currentTick;
        events.push({ type: 'civil_war_settlement_available', polityId: parent.id, claimantPolityId: claimant.id,
          exhaustion: opportunity.exhaustion, parentShare: opportunity.parentShare });
      }
    } else {
      const chance = clamp(0.08 + opportunity.exhaustion * 0.35, 0.08, 0.42);
      if (rng() < chance) {
        const settlement = applyPartitionSettlement(parent, claimant, state, currentTick);
        events.push({ type: 'civil_war_settled', polityId: parent.id, claimantPolityId: claimant.id, settlement });
      }
    }
  }
  return events;
}

export function activeCivilWarForPolity(polityId, polities) {
  for (const parent of polities) {
    const crisis = parent.succession?.crisis;
    if (!crisis?.escalated || crisis.continuityResolved || crisis.resolved) continue;
    if (parent.id === polityId || crisis.claimantPolityId === polityId) {
      const claimant = polities.find((candidate) => candidate.id === crisis.claimantPolityId);
      if (claimant) return { parent, claimant, crisis };
    }
  }
  return null;
}

export function maybeLaunchCivilWarCampaign(region, regionsById, campaigns, polities, currentTick, rng = Math.random) {
  const polityId = region.governance?.sovereignPolityId;
  const civilWar = activeCivilWarForPolity(polityId, polities);
  if (!civilWar || region.army?.away > 0 || (region.army?.personnel || 0) < 100) return false;
  const ownSide = polityId === civilWar.parent.id ? civilWar.parent : civilWar.claimant;
  const enemySide = ownSide.id === civilWar.parent.id ? civilWar.claimant : civilWar.parent;
  const existing = campaigns.some((campaign) => !campaign.completed &&
    regionsById.get(campaign.attackerId)?.governance?.sovereignPolityId === ownSide.id &&
    regionsById.get(campaign.defenderId)?.governance?.sovereignPolityId === enemySide.id);
  if (existing) return false;
  const contested = new Set(civilWar.crisis.factionPolitics?.contestedRegionIds || []);
  const targets = [...regionsById.values()].filter((candidate) => candidate.governance?.sovereignPolityId === enemySide.id &&
    (!contested.size || contested.has(candidate.id)));
  let best = null;
  for (const target of targets) {
    const reach = canCampaign(region, target, campaigns, [...regionsById.values()], polities);
    if (!reach.possible) continue;
    const defenders = Math.max(25, target.army?.personnel || (target.population || 0) * 0.006);
    const advantage = (region.army?.personnel || 0) / Math.max(25, defenders * 1.35);
    const strategic = target.id === enemySide.capitalRegionId ? 0.35 : 0;
    const localClaim = ownSide.continuity?.claims?.[target.id] || 0;
    const score = advantage * 0.55 + strategic + localClaim * 0.25 - (target.governance?.administrativeControl || 0) * 0.1;
    if (advantage >= 0.82 && (!best || score > best.score)) best = { target, score, advantage };
  }
  if (!best) return false;
  const factionState = civilWar.crisis.factionPolitics;
  const lastLaunch = factionState?.lastCampaignLaunchTick?.[ownSide.id] ?? -Infinity;
  if (currentTick - lastLaunch < 13) return false;
  const requested = Math.floor(region.army.personnel * clamp(0.55 + Math.min(0.25, best.advantage * 0.08), 0.55, 0.8));
  const campaign = launchCampaign(region, best.target, 'subjugation', requested, currentTick,
    { campaigns, regions: [...regionsById.values()], polities });
  if (!campaign) return false;
  campaign.civilWar = { parentPolityId: civilWar.parent.id, claimantPolityId: civilWar.claimant.id, attackerPolityId: ownSide.id, defenderPolityId: enemySide.id };
  campaigns.push(campaign);
  if (factionState) {
    factionState.lastCampaignLaunchTick ||= {};
    factionState.lastCampaignLaunchTick[ownSide.id] = currentTick;
  }
  return true;
}
'''

(ROOT / 'js/politics/civilWarFactions.js').write_text(civil_war)

replace_once(
    'js/politics/medievalStateSystems.js',
    "import { linkSuccessionClaimant, reconcileSuccessionContinuity } from './successionContinuityBridge.js?v=20260913-succession-continuity1';\n",
    "import { linkSuccessionClaimant, reconcileSuccessionContinuity } from './successionContinuityBridge.js?v=20260913-succession-continuity1';\nimport { tickCivilWarFactionPolitics } from './civilWarFactions.js?v=20260913-civil-war2';\n",
)
replace_once(
    'js/politics/medievalStateSystems.js',
    "export function tickMedievalStateSystems(polities, regions, currentTick, elapsedDays = 30, rng = Math.random) {",
    "export function tickMedievalStateSystems(polities, regions, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {",
)
replace_once(
    'js/politics/medievalStateSystems.js',
    "    if (succession.crisis?.escalated) {\n      const continuityEvent = reconcileSuccessionContinuity(polity, polities, regions, currentTick);\n      if (continuityEvent) events.push(continuityEvent);\n    }",
    "    if (succession.crisis?.escalated) {\n      events.push(...tickCivilWarFactionPolitics(polity, polities, regions, currentTick, elapsedDays, rng, options));\n      const continuityEvent = reconcileSuccessionContinuity(polity, polities, regions, currentTick);\n      if (continuityEvent) events.push(continuityEvent);\n    }",
)

replace_once(
    'js/ai/nationAi.js',
    "import { activateJointOperations } from '../military/jointOperations.js?v=20260909-joint-ops1';\n",
    "import { activateJointOperations } from '../military/jointOperations.js?v=20260909-joint-ops1';\nimport { maybeLaunchCivilWarCampaign } from '../politics/civilWarFactions.js?v=20260913-civil-war2';\n",
)
replace_once(
    'js/ai/nationAi.js',
    "    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));\n    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));\n",
    "    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));\n    const launchedCivilWarCampaign = maybeLaunchCivilWarCampaign(region, regionsById, activeCampaigns, polities, currentTick, rng);\n    if (!launchedCivilWarCampaign) maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));\n",
)

replace_once(
    'js/main.js',
    "import { tickNationAi } from './ai/nationAi.js?v=20260905-projects1';",
    "import { tickNationAi } from './ai/nationAi.js?v=20260913-civil-war2';",
)
replace_once(
    'js/main.js',
    "import { tickMedievalStateSystems } from './politics/medievalStateSystems.js?v=20260912-medieval2';",
    "import { tickMedievalStateSystems } from './politics/medievalStateSystems.js?v=20260913-civil-war2';",
)
replace_once(
    'js/main.js',
    "tickMedievalStateSystems(polities, regions, calendarWeek, time.elapsedDays, Math.random)",
    "tickMedievalStateSystems(polities, regions, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId })",
)

# Add a focused regression covering durable multi-region factions, defections,
# negotiated settlements and campaign generation through the normal engine.
test = r'''import assert from 'node:assert/strict';
import { tickCivilWarFactionPolitics, maybeLaunchCivilWarCampaign } from '../js/politics/civilWarFactions.js';

function region(id, owner, neighbors = []) {
  return {
    id, name: id, population: 10000, neighbors, adjacentSeaIds: [], controllingActorId: owner,
    governance: { sovereignPolityId: owner, localPolityId: owner, relationship: 'delegated', autonomy: 0.55, administrativeControl: 0.45 },
    medievalInstitutions: { grievance: 0.25, localIdentity: 0.45, eliteOrganisation: 0.45 },
    medievalSociety: { estates: { privateRetinues: 0.35 } },
    stability: 0.62, conflictPressure: 0.2,
    army: { personnel: 500, away: 0 }, navy: { personnel: 0, boats: 0 },
    demographics: { workingAge: 5000 }, unlockedTechIds: new Set(), stockpile: {}, construction: { assets: [] },
    militaryPolicy: {}, recentTradePartners: new Map(), knowledge: new Map(),
    coordinates: { lat: 0, lon: Number(id.replace(/\D/g,'')) || 0 },
  };
}

const parent = { id: 'realm', name: 'Realm', capitalRegionId: 'r0', administration: { legitimacy: 0.62 }, institutionalPaths: { bureaucraticService: 0.55 }, continuity: { legitimacy: 0.62, claims: {} }, succession: { claimants: [{ id: 'heir', kind: 'designated_heir' }, { id: 'rival', kind: 'provincial_claimant' }], crisis: { startedTick: 0, escalated: true, claimantPolityId: 'rival_state', leadingClaimantId: 'heir', contested: true } } };
const claimant = { id: 'rival_state', name: 'Rival', capitalRegionId: 'r2', claimantId: 'rival', claimantOfPolityId: 'realm', administration: { legitimacy: 0.58 }, continuity: { status: 'claimant', legitimacy: 0.58, claims: { r0: 0.68, r1: 0.96, r2: 0.96 }, successionClaim: { status: 'contesting' } } };
const r0 = region('r0', 'realm', ['r1']);
const r1 = region('r1', 'realm', ['r0','r2']);
const r2 = region('r2', 'rival_state', ['r1']);
r0.successionAlignment = 'heir'; r1.successionAlignment = 'rival'; r2.successionAlignment = 'rival';
// Make r1's local elite strongly favour the challenger despite incumbent control.
r1.medievalInstitutions.grievance = 0.95; r1.medievalInstitutions.localIdentity = 0.95; r1.medievalInstitutions.eliteOrganisation = 0.9;
r1.medievalSociety.estates.privateRetinues = 0.9; r1.governance.administrativeControl = 0.15; r1.governance.autonomy = 0.9;
const polities = [parent, claimant]; const regions = [r0, r1, r2];
let events = tickCivilWarFactionPolitics(parent, polities, regions, 20, 120, () => 0);
assert.equal(parent.succession.crisis.factionPolitics.contestedRegionIds.length, 3, 'civil war should retain the whole contested realm');
assert(events.some((event) => event.type === 'civil_war_defection'), 'regional elites should be able to defect between claimant factions');
assert.equal(r1.governance.sovereignPolityId, 'rival_state');

// The claimant should prosecute the war through an ordinary campaign object.
claimant.continuity.claims.r0 = 0.9;
r2.knowledge.set('r1', { level: 1 }); r1.knowledge.set('r2', { level: 1 });
r2.knowledge.set('r0', { level: 1 }); r0.knowledge.set('r2', { level: 1 });
const campaigns = [];
const launched = maybeLaunchCivilWarCampaign(r2, new Map(regions.map((r) => [r.id, r])), campaigns, polities, 40, () => 0);
assert.equal(launched, true, 'claimant should be able to launch a normal campaign against the rival faction');
assert.equal(campaigns.length, 1);
assert.equal(campaigns[0].objective, 'subjugation');
assert.equal(campaigns[0].civilWar.parentPolityId, 'realm');

// A long, exhausted stalemate can settle without deleting either political identity.
parent.succession.crisis.factionPolitics.lastDefectionTick = 100;
parent.succession.crisis.factionPolitics.lastReviewTick = 240;
parent.succession.crisis.factionPolitics.exhaustion.realm = 0.8;
parent.succession.crisis.factionPolitics.exhaustion.rival_state = 0.8;
events = tickCivilWarFactionPolitics(parent, polities, regions, 260, 30, () => 0, { playerPolityId: null });
assert(events.some((event) => event.type === 'civil_war_settled'), 'exhausted stalemates should permit negotiated settlement');
assert.equal(parent.succession.crisis.factionPolitics.settlement.type, 'negotiated_partition');
assert.equal(claimant.continuity.status, 'sovereign');
assert.equal(parent.continuity.status, 'sovereign');

console.log('civil war factions v2 regression passed');
'''
(ROOT / 'tools/test-civil-war-factions-v2.mjs').write_text(test)

print('Applied civil war factions v2 integration')
