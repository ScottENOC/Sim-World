// Deliberately simple, reactive rules rather than deep planning — these are
// Bronze Age chiefdoms, not general staffs. Every non-player region gets:
// a military target that scales with how threatened it feels, and an
// occasional, cautious evaluation of whether raiding a reachable neighbor
// is clearly worth it. Nothing here is player-aware or player-favoring —
// an AI region sizes up every reachable region, including other AI ones,
// exactly the same way.

import { toolEfficiencyMultiplier } from '../economy/tools.js';
import { canRaid, launchRaid } from '../military/raiding.js';

const BASE_ARMY_FRACTION = 0.02;      // baseline army as a share of working-age population
const THREAT_ARMY_MULTIPLIER = 2.0;   // up to 3x baseline (1 + this) when safety is at its worst
const BASE_NAVY_PER_POPULATION = 50000; // ~1 boat per this many people, coastal regions only

const RAID_CONSIDERATION_CHANCE_PER_WEEK = 0.05; // don't evaluate raiding every single week
const MIN_HOME_ARMY_TO_CONSIDER_RAIDING = 30;
const MIN_SAFETY_TO_CONSIDER_RAIDING = 0.3;       // too risky to send troops away if already unsafe at home
const MIN_ADVANTAGE_TO_RAID = 1.5;                // needs a real edge, not a coin flip
const DEFENDER_HOME_ADVANTAGE = 1.3;              // mirrors raiding.js's own constant, for evaluating targets

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function tickNationAi(regions, playerRegionId, activeRaids, currentTick, toolTypes, rng) {
  for (const region of regions) {
    if (region.controllingActorId === playerRegionId) continue; // player's own region — no AI

    setMilitaryTargets(region);
    maybeRaid(region, regions, activeRaids, currentTick, toolTypes, rng);
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

function maybeRaid(region, allRegions, activeRaids, currentTick, toolTypes, rng) {
  if (region.army.away > 0) return; // already raiding, wait for them home
  if (region.army.personnel < MIN_HOME_ARMY_TO_CONSIDER_RAIDING) return;
  if (region.safetyRating < MIN_SAFETY_TO_CONSIDER_RAIDING) return; // too exposed at home already
  if (rng() > RAID_CONSIDERATION_CHANCE_PER_WEEK) return; // not every region re-evaluates every week

  const ownEquip = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds);
  const ownPower = region.army.personnel * ownEquip;

  let best = null;
  let bestScore = -Infinity;
  for (const target of allRegions) {
    if (target.id === region.id) continue;
    const reach = canRaid(region, target);
    if (!reach.possible) continue;

    const targetEquip = toolEfficiencyMultiplier(target, 'soldier', toolTypes.soldier, target.unlockedTechIds);
    const targetPower = target.army.personnel * targetEquip * DEFENDER_HOME_ADVANTAGE;
    const advantage = ownPower / (targetPower + 1);
    if (advantage < MIN_ADVANTAGE_TO_RAID) continue;

    // Worth the trip? Weight by advantage and how much there visibly is to
    // take — a poor, undefended neighbor isn't as tempting as a rich one.
    const visibleWealth = target.wallet + (target.stockpile.bronze || 0) * 5 + (target.stockpile.gold || 0) * 15;
    const score = advantage * (visibleWealth + 1);
    if (score > bestScore) {
      bestScore = score;
      best = { target, viaSea: reach.viaSea };
    }
  }
  if (!best) return;

  const fraction = 0.5 + rng() * 0.3; // commit 50-80% of home army, never everything
  const requested = Math.floor(region.army.personnel * fraction);
  const raid = launchRaid(region, best.target, requested, best.viaSea, currentTick);
  if (raid) activeRaids.push(raid);
}
