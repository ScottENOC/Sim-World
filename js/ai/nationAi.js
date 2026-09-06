// Deliberately simple, reactive rules rather than deep planning — these are
// Bronze Age chiefdoms, not general staffs. Every non-player region gets:
// a military target that scales with how threatened it feels, and an
// occasional, cautious evaluation of whether raiding a reachable neighbor
// is clearly worth it. AI only considers regions it has actually met.
import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260904-weather1';
import { canRaid, launchRaid } from '../military/raiding.js?v=20260905-projects1';
import { directContactIds, knowledgeOf, KNOWLEDGE_THRESHOLDS } from '../core/knowledge.js?v=20260904-weather1';
import { militaryReadiness } from '../economy/stateFinance.js?v=20260904-weather1';
import { horseMilitaryMultiplier } from '../economy/horses.js?v=20260904-policy1';
import { activeAgreementBetween, attitudeToward, canDiplomaticallyReach, powerRatio, proposeAgreement } from '../diplomacy/relations.js?v=20260904-save1';
import { demandVassalage } from '../politics/polities.js?v=20260904-war1';
import { chooseAiMilitaryPolicies } from '../military/policies.js?v=20260904-policy1';
import { canCampaign, launchCampaign, massMobiliseDefender, requestCampaignWithdrawal } from '../military/campaigns.js?v=20260905-projects1';
import { chooseAiConstruction } from '../economy/construction.js?v=20260905-projects1';
import { chooseAiSiegeTargets } from '../military/siegeEquipment.js?v=20260905-projects1';
import { chooseAiReligion, religiousWarModifier } from '../society/religion.js?v=20260905-religion1';
import { activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';
import { startScoutingMission } from '../core/scouting.js?v=20260906-scouting1';

// A one-percent peacetime levy is supportable while trade and taxation are
// healthy. Threatened states still expand this through the safety multiplier;
// failed states should lose armies because the collapse removed their means,
// not because the starting establishment was fiscally impossible.
const BASE_ARMY_FRACTION = 0.01;
const THREAT_ARMY_MULTIPLIER = 2.0;
const BASE_NAVY_PER_POPULATION = 50000;
// Most chiefdoms do not campaign every year. Geography, knowledge and a clear
// military advantage still gate the attempt after this roll; roughly 0.5% per
// week gives viable states about a one-in-four annual chance to even consider
// a raid, while repeated winners can still become observed raiding economies.
const RAID_CONSIDERATION_CHANCE_PER_WEEK = 0.005;
const MIN_HOME_ARMY_TO_CONSIDER_RAIDING = 30;
const MIN_SAFETY_TO_CONSIDER_RAIDING = 0.3;
const MIN_ADVANTAGE_TO_RAID = 1.5;
const DEFENDER_HOME_ADVANTAGE = 1.3;
const DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK = 0.0015;
const CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK = 0.0007;
const EMBARGO_REVIEW_INTERVAL = 26;
const STRATEGIC_REVIEW_INTERVAL = 13;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7) {
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
    maybeScout(region, regionsById, currentTick, rng);
    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));
    maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK));
    maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK));
  }
}

function strategicReviewWeeks(region, currentTick, fallbackWeeks) {
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

function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {
  if (!Number.isFinite(currentTick)) return;
  const offset = stableAiHash(region.id) % EMBARGO_REVIEW_INTERVAL;
  const bucket = Math.floor((currentTick - offset) / EMBARGO_REVIEW_INTERVAL);
  if (region._lastEmbargoReviewBucket === bucket || (region._lastEmbargoReviewBucket === undefined && currentTick < offset)) {
    region._lastEmbargoReviewBucket = bucket; return;
  }
  region._lastEmbargoReviewBucket = bucket;
  const existing = activeTradeRestrictions(region);
  const known = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);
  for (const target of known) {
    const actor = tradeActorId(target);
    const hostility = attitudeToward(region, target.id);
    const keyRule = existing.find((rule) => rule.direction === 'trade' && rule.goods === null && rule.counterparties?.includes(actor));
    if (hostility <= -0.72 && !keyRule) {
      setTradeRestriction(region, { direction: 'trade', goods: null, counterparties: [actor], allowed: false }, [...regionsById.values()], currentTick);
    } else if (hostility >= -0.35 && keyRule) {
      setTradeRestriction(region, { direction: 'trade', goods: null, counterparties: [actor], allowed: true }, [...regionsById.values()], currentTick);
    }
  }
}

function maybeScout(region, regionsById, currentTick, rng) {
  if (region.scouting?.active) return;
  const contacts = directContactIds(region).size;
  const demand = region.marketDemand || {};
  const unmet = ['food', 'bronze', 'copper', 'wood', 'clothing']
    .reduce((sum, key) => sum + Math.max(0, Number(demand[key]) || 0), 0);
  const population = Math.max(1, region.population || 1);
  const shortagePressure = Math.min(1, unmet / Math.max(50, population * 0.02));
  const tradeExperience = (region.recentTradePartners?.size || 0) > 0 ||
    (region.occupations?.trader || 0) > 0 ||
    (region.tradeEconomy?.exportIncomeEma || 0) + (region.tradeEconomy?.importSpendEma || 0) > 20;

  // No omniscient catch-up motive. A truly isolated, self-sufficient society
  // does not know that unseen foreigners have better technology. Scouting is
  // attractive when rulers already understand trade, feel a local shortage,
  // or have remarkably few known neighbours despite maintaining armed forces.
  if (!tradeExperience && shortagePressure < 0.15 && contacts >= 2) return;
  const isolation = Math.max(0, 1 - contacts / 5);
  const motive = shortagePressure * 0.55 + (tradeExperience ? 0.25 : 0) + isolation * 0.2;
  if (motive < 0.18 || rng() > Math.min(0.65, motive)) return;

  startScoutingMission(region, [...regionsById.values()], currentTick, rng, 'auto');
}

function stableAiHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function manageCampaigns(campaigns, regionsById, playerRegionId, rng) {
  for (const campaign of campaigns) {
    if (campaign.phase !== 'engaged') continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) continue;
    if (defender.controllingActorId !== playerRegionId && campaign.militia <= 0 &&
        (campaign.pressure >= 0.18 || campaign.defenderMorale < 0.65)) {
      massMobiliseDefender(campaign, defender, 0.1 + rng() * 0.1);
    }
    if (attacker.controllingActorId !== playerRegionId &&
        (campaign.attackerMorale < 0.28 || (campaign.supply < 0.3 && campaign.pressure < 0.45))) {
      requestCampaignWithdrawal(campaign);
    }
  }
}

function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0 || region.army.personnel < 100) return;
  if (rng() > considerationChance) return;
  const candidates = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);
  let best = null;
  for (const target of candidates) {
    const reach = canCampaign(region, target, activeCampaigns, [...regionsById.values()], polities);
    if (!reach.possible) continue;
    const familiarity = knowledgeOf(region, target.id);
    const estimatedDefenders = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED
      ? target.army.personnel : familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION
        ? target.demographics.workingAge * 0.015 : target.population * 0.006;
    const advantage = region.army.personnel / Math.max(25, estimatedDefenders * 1.8);
    if (advantage < 1.35) continue;
    const hostility = -attitudeToward(region, target.id);
    const religiousPressure = religiousWarModifier(region, target, religiousWorld, currentTick);
    if (religiousPressure < 0.5 && hostility < 0.7) continue;
    const score = (advantage + hostility + (target.wallet || 0) / Math.max(1, target.population) * 0.01) * religiousPressure;
    if (!best || score > best.score) best = { target, score, advantage };
  }
  if (!best) return;
  const objective = best.advantage > 2.4 && rng() < 0.35 ? 'subjugation'
    : attitudeToward(region, best.target.id) < -0.65 ? 'devastation' : 'punitive';
  const requested = Math.floor(region.army.personnel * (0.65 + rng() * 0.25));
  const campaign = launchCampaign(region, best.target, objective, requested, currentTick,
    { campaigns: activeCampaigns, regions: [...regionsById.values()], polities });
  if (campaign) activeCampaigns.push(campaign);
}

function maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, considerationChance = DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK) {
  if (rng() > considerationChance) return;
  const candidates = [...directContactIds(region)]
    .map((id) => regionsById.get(id))
    .filter((target) => target && target.id !== playerRegionId && canDiplomaticallyReach(region, target));
  if (candidates.length === 0) return;

  // Aid a friendly neighbour in real disorder; otherwise strong chiefdoms
  // occasionally turn an obvious imbalance into tribute or resource access.
  const aidTarget = candidates
    .filter((target) => target.banditPopulation > target.population * 0.02 && attitudeToward(region, target.id) > 0.2)
    .sort((a, b) => b.banditPopulation / Math.max(1, b.population) - a.banditPopulation / Math.max(1, a.population))[0];
  if (aidTarget && !activeAgreementBetween(agreements, region.id, aidTarget.id, 'military_support')) {
    const personnel = Math.floor(Math.min(region.army.personnel * 0.15, aidTarget.banditPopulation * 0.5));
    proposeAgreement('military_support', region, aidTarget, agreements, toolTypes, currentTick, { personnel });
    return;
  }

  const weakTargets = candidates
    .map((target) => ({ target, ratio: powerRatio(region, target, toolTypes) }))
    .filter(({ target, ratio }) => ratio >= 1.6 && attitudeToward(region, target.id) < 0.45 &&
      !activeAgreementBetween(agreements, region.id, target.id))
    .sort((a, b) => b.ratio - a.ratio);
  if (weakTargets.length === 0) return;
  if (weakTargets[0].ratio >= 2.2 && rng() < 0.2) {
    demandVassalage(region, weakTargets[0].target, polities, toolTypes, currentTick, [...regionsById.values()]);
    return;
  }
  const type = rng() < 0.65 ? 'tribute' : 'resource_access';
  proposeAgreement(type, region, weakTargets[0].target, agreements, toolTypes, currentTick);
}

function setMilitaryTargets(region) {
  const threatFactor = 1 + (1 - clamp01(region.safetyRating)) * THREAT_ARMY_MULTIPLIER;
  region.targetArmySize = Math.round(region.demographics.workingAge * BASE_ARMY_FRACTION * threatFactor);

  if (region.isCoastal) {
    const baseline = Math.round(region.population / BASE_NAVY_PER_POPULATION);
    region.targetNavySize = Math.max(region.targetNavySize, baseline);
  }
}

function maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = RAID_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0) return;
  if (region.army.personnel < MIN_HOME_ARMY_TO_CONSIDER_RAIDING) return;
  if (region.safetyRating < MIN_SAFETY_TO_CONSIDER_RAIDING) return;
  if (rng() > considerationChance) return;

  const ownEquip = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds);
  const ownPower = region.army.personnel * ownEquip * militaryReadiness(region) * horseMilitaryMultiplier(region);

  let best = null;
  let bestScore = -Infinity;
  for (const targetId of directContactIds(region)) {
    const target = regionsById.get(targetId);
    if (!target || target.id === region.id) continue;
    const reach = canRaid(region, target, [...regionsById.values()], polities);
    if (!reach.possible) continue; // includes the knowledge/fog-of-war check

    const familiarity = knowledgeOf(region, target.id);
    const knowsPopulation = familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION;
    const knowsDetailed = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED;

    // AI cannot inspect hidden military/economic data. With little knowledge it
    // uses broad population-based estimates; only detailed knowledge exposes
    // actual military strength and wealth.
    const estimatedArmy = knowsDetailed
      ? target.army.personnel * militaryReadiness(target)
      : knowsPopulation
        ? Math.max(10, target.demographics.workingAge * 0.02)
        : Math.max(10, target.population * 0.005);
    const targetEquip = knowsDetailed
      ? toolEfficiencyMultiplier(target, 'soldier', toolTypes.soldier, target.unlockedTechIds)
      : 1;
    const targetPower = estimatedArmy * targetEquip * DEFENDER_HOME_ADVANTAGE;
    const advantage = ownPower / (targetPower + 1);
    if (advantage < MIN_ADVANTAGE_TO_RAID) continue;

    const attitude = attitudeToward(region, target.id);
    // Friendly cultures are rarely selected merely because they are rich;
    // grudges make an otherwise marginal target more attractive.
    if (attitude > 0.65 && advantage < MIN_ADVANTAGE_TO_RAID * 2) continue;

    const knownWealth = knowsDetailed
      ? target.wallet + (target.stockpile.bronze || 0) * 5 + (target.stockpile.gold || 0) * 15
      : knowsPopulation
        ? target.population * 0.1
        : 1;
    const hostilityMultiplier = Math.max(0.2, 1 - attitude * 0.8);
    const religiousPressure = religiousWarModifier(region, target, religiousWorld, currentTick);
    if (religiousPressure < 0.5 && attitude > -0.7) continue;
    const score = advantage * (knownWealth + 1) * hostilityMultiplier * religiousPressure;
    if (score > bestScore) {
      bestScore = score;
      best = { target, viaSea: reach.viaSea };
    }
  }

  if (!best) return;
  const fraction = 0.5 + rng() * 0.3;
  const requested = Math.floor(region.army.personnel * fraction);
  const raid = launchRaid(region, best.target, requested, best.viaSea, currentTick,
    { regions: [...regionsById.values()], polities });
  if (raid) activeRaids.push(raid);
}
