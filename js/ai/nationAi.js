// Deliberately simple, reactive rules rather than deep planning — these are
// Bronze Age chiefdoms, not general staffs. Every non-player region gets:
// a military target that scales with how threatened it feels, and an
// occasional, cautious evaluation of whether raiding a reachable neighbor
// is clearly worth it. AI only considers regions it has actually met.
import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260903-mechanics1';
import { canRaid, launchRaid } from '../military/raiding.js?v=20260903-mechanics1';
import { directContactIds, knowledgeOf, KNOWLEDGE_THRESHOLDS } from '../core/knowledge.js?v=20260903-mechanics1';

const BASE_ARMY_FRACTION = 0.02;
const THREAT_ARMY_MULTIPLIER = 2.0;
const BASE_NAVY_PER_POPULATION = 50000;
const RAID_CONSIDERATION_CHANCE_PER_WEEK = 0.05;
const MIN_HOME_ARMY_TO_CONSIDER_RAIDING = 30;
const MIN_SAFETY_TO_CONSIDER_RAIDING = 0.3;
const MIN_ADVANTAGE_TO_RAID = 1.5;
const DEFENDER_HOME_ADVANTAGE = 1.3;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function tickNationAi(regions, playerRegionId, activeRaids, currentTick, toolTypes, rng) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    if (region.controllingActorId === playerRegionId) continue;
    setMilitaryTargets(region);
    maybeRaid(region, regionsById, activeRaids, currentTick, toolTypes, rng);
  }
}

function setMilitaryTargets(region) {
  const threatFactor = 1 + (1 - clamp01(region.safetyRating)) * THREAT_ARMY_MULTIPLIER;
  region.targetArmySize = Math.round(region.demographics.workingAge * BASE_ARMY_FRACTION * threatFactor);

  if (region.isCoastal) {
    const baseline = Math.round(region.population / BASE_NAVY_PER_POPULATION);
    region.targetNavySize = Math.max(region.targetNavySize, baseline);
  }
}

function maybeRaid(region, regionsById, activeRaids, currentTick, toolTypes, rng) {
  if (region.army.away > 0) return;
  if (region.army.personnel < MIN_HOME_ARMY_TO_CONSIDER_RAIDING) return;
  if (region.safetyRating < MIN_SAFETY_TO_CONSIDER_RAIDING) return;
  if (rng() > RAID_CONSIDERATION_CHANCE_PER_WEEK) return;

  const ownEquip = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds);
  const ownPower = region.army.personnel * ownEquip;

  let best = null;
  let bestScore = -Infinity;
  for (const targetId of directContactIds(region)) {
    const target = regionsById.get(targetId);
    if (!target || target.id === region.id) continue;
    const reach = canRaid(region, target);
    if (!reach.possible) continue; // includes the knowledge/fog-of-war check

    const familiarity = knowledgeOf(region, target.id);
    const knowsPopulation = familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION;
    const knowsDetailed = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED;

    // AI cannot inspect hidden military/economic data. With little knowledge it
    // uses broad population-based estimates; only detailed knowledge exposes
    // actual military strength and wealth.
    const estimatedArmy = knowsDetailed
      ? target.army.personnel
      : knowsPopulation
        ? Math.max(10, target.demographics.workingAge * 0.02)
        : Math.max(10, target.population * 0.005);
    const targetEquip = knowsDetailed
      ? toolEfficiencyMultiplier(target, 'soldier', toolTypes.soldier, target.unlockedTechIds)
      : 1;
    const targetPower = estimatedArmy * targetEquip * DEFENDER_HOME_ADVANTAGE;
    const advantage = ownPower / (targetPower + 1);
    if (advantage < MIN_ADVANTAGE_TO_RAID) continue;

    const knownWealth = knowsDetailed
      ? target.wallet + (target.stockpile.bronze || 0) * 5 + (target.stockpile.gold || 0) * 15
      : knowsPopulation
        ? target.population * 0.1
        : 1;
    const score = advantage * (knownWealth + 1);
    if (score > bestScore) {
      bestScore = score;
      best = { target, viaSea: reach.viaSea };
    }
  }

  if (!best) return;
  const fraction = 0.5 + rng() * 0.3;
  const requested = Math.floor(region.army.personnel * fraction);
  const raid = launchRaid(region, best.target, requested, best.viaSea, currentTick);
  if (raid) activeRaids.push(raid);
}
