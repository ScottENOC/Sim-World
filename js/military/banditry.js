import { effectivePower } from './army.js?v=20260904-policy1';
import { addWorkingAgePopulation, removeFromBands, syncPopulation } from '../society/demographics.js?v=20260904-weather1';
import { FOOD_PER_PERSON_PER_WEEK } from '../economy/labor.js?v=20260904-weather1';
import { directContactIds } from '../core/knowledge.js?v=20260904-weather1';
import { protectionPowerFor } from '../diplomacy/relations.js?v=20260904-save1';
import { ensureMilitaryPolicy, postureProfile } from './policies.js?v=20260904-policy1';
import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';

// Even with zero army, a bandit group doesn't last forever — disorganized,
// exposed, some natural die-off. Suppression on top of that scales with
// army power relative to bandit numbers, so a real force actively grinds
// bandit population down rather than just capping how bad things get.
const SUPPRESSION_REFERENCE = 0.3;      // max weekly suppression fraction even with overwhelming force

const ARMY_REFERENCE_DENSITY = 0.01; // army power per capita that starts to feel like real protection

const RAID_INTENSITY = 0.25;        // max weekly stockpile loss fraction under total lawlessness
const BANDIT_DEATH_INTENSITY = 0.01; // max weekly death rate on regular population under total lawlessness
const BANDIT_STARVATION_RATE = 0.02;
const BANDIT_DISPERSAL_RATE = 0.03;
const BANDIT_REINTEGRATION_RATE = 0.012;
const CAPTURED_REINTEGRATION_SHARE = 0.35;
const BANDIT_STORE_WEEKS = 4;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lootAppeal(region) {
  const food = Math.max(0, region.stockpile.food || 0);
  const portableWealth = Math.max(0, region.wallet || 0) + Math.max(0, region.treasury || 0);
  const trade = Math.max(0, region.tradeEconomy?.weeklyExports || 0);
  return (food + portableWealth * 5 + trade * 2) * (0.25 + 0.75 * (1 - (region.safetyRating || 0)));
}

function bestDispersalTarget(region, regionsById) {
  const localAppeal = lootAppeal(region);
  let best = null;
  for (const id of directContactIds(region)) {
    const candidate = regionsById.get(id);
    if (!candidate || candidate.id === region.id) continue;
    const landReachable = region.neighbors.includes(candidate.id);
    const sharedSea = region.adjacentSeaIds.some((seaId) => candidate.adjacentSeaIds.includes(seaId));
    const canCrossSea = sharedSea && ((region.navy?.boats || 0) + (region.fishingBoats || 0) >= 1);
    if (!landReachable && !canCrossSea) continue;
    const appeal = lootAppeal(candidate);
    if (appeal > localAppeal * 1.1 && (!best || appeal > best.appeal)) best = { region: candidate, appeal };
  }
  return best?.region || null;
}

export function tickBanditry(regions, toolTypes, agreements = []) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const movements = [];
  for (const region of regions) {
    const policy = ensureMilitaryPolicy(region);
    const posture = postureProfile(region);
    const alliedProtection = protectionPowerFor(region.id, agreements);
    const watchtowerPower = (region.population || 0) * 0.0025 * effectiveInfrastructureCount(region, 'watchtowers');
    const power = (effectivePower(region, toolTypes) + alliedProtection + watchtowerPower) * posture.localPower;
    const banditPop = region.banditPopulation;
    const totalLocal = region.population + banditPop;
    const banditPressure = totalLocal > 0 ? banditPop / totalLocal : 0;

    // Diminishing-returns defense: army power matters a lot at first, less
    // for each additional unit beyond what the population size warrants.
    const armyDefense = power / (power + region.population * ARMY_REFERENCE_DENSITY + 1);
    region.safetyRating = clamp01(1 - banditPressure * (1 - armyDefense));

    // Suppression — this is what finally gives the ever-growing bandit
    // number from last pass somewhere to go.
    const suppressionRate = power > 0 ? power / (power + banditPop + 1) : 0;
    const punishmentSuppression = policy.raiderTreatment === 'punish' ? 1.25 : 1;
    const suppressed = Math.min(banditPop, banditPop * suppressionRate * SUPPRESSION_REFERENCE * punishmentSuppression);
    region.banditPopulation = Math.max(0, banditPop - suppressed);
    const baseCaptured = suppressed * CAPTURED_REINTEGRATION_SHARE * (0.25 + 0.75 * region.stability);
    const capturedReturn = policy.raiderTreatment === 'reintegrate' ? baseCaptured * 1.7
      : policy.raiderTreatment === 'recruit' ? baseCaptured * 0.3 : 0;
    const recruited = policy.raiderTreatment === 'recruit' ? baseCaptured * 1.15 : 0;
    addWorkingAgePopulation(region, capturedReturn + recruited);
    region.army.personnel += recruited;

    // Ongoing raiding: bandits steal from the stockpile and cause some
    // deaths, both scaled down by how safe the region currently is (a
    // strong army suppresses the *impact*, not just the eventual headcount).
    const severity = banditPressure * (1 - region.safetyRating);
    const raidLossFraction = RAID_INTENSITY * severity / posture.settlementProtection;
    let foodLooted = 0;
    if (raidLossFraction > 0) {
      for (const key of Object.keys(region.stockpile)) {
        if (key === 'food') foodLooted = Math.max(0, region.stockpile[key]) * raidLossFraction;
        region.stockpile[key] *= (1 - raidLossFraction);
      }
      // Caravans, coin hoards and merchant credit are unusually exposed when
      // the state cannot control the roads. This directly weakens a failed
      // region's ability to replace scarce tools or equip an army.
      const tradeExposure = policy.defensivePosture === 'trade_routes' ? 0.45 : 1;
      region.wallet *= (1 - raidLossFraction * 0.1 * tradeExposure);
      region.treasury *= (1 - raidLossFraction * 0.15 * tradeExposure);
    }

    // Bandits eat from what they seized, holding at most a few weeks of food.
    // A countryside stripped of food and portable wealth therefore stops
    // supporting an ever-growing permanent bandit population.
    const activeBandits = region.banditPopulation;
    region.banditFoodStores = Math.min(
      activeBandits * FOOD_PER_PERSON_PER_WEEK * BANDIT_STORE_WEEKS,
      Math.max(0, region.banditFoodStores || 0) + foodLooted
    );
    const foodNeed = activeBandits * FOOD_PER_PERSON_PER_WEEK;
    const foodEaten = Math.min(foodNeed, region.banditFoodStores);
    region.banditFoodStores -= foodEaten;
    const livelihoodShortfall = foodNeed > 0 ? 1 - foodEaten / foodNeed : 0;

    const density = region.areaSqKm > 0 ? region.population / region.areaSqKm : Infinity;
    const landRoom = clamp01(1 - density / 6);
    const civilianOpportunity = clamp01(region.stability * 0.65 + landRoom * 0.35);
    const reintegrated = Math.min(region.banditPopulation,
      region.banditPopulation * BANDIT_REINTEGRATION_RATE * civilianOpportunity * (0.25 + livelihoodShortfall));
    region.banditPopulation -= reintegrated;
    addWorkingAgePopulation(region, reintegrated);

    const target = livelihoodShortfall > 0.1 ? bestDispersalTarget(region, regionsById) : null;
    const dispersing = target
      ? Math.min(region.banditPopulation, region.banditPopulation * BANDIT_DISPERSAL_RATE * livelihoodShortfall)
      : 0;
    region.banditPopulation -= dispersing;
    if (dispersing > 0) movements.push({ from: region, to: target, count: dispersing });

    const starved = Math.min(region.banditPopulation,
      region.banditPopulation * BANDIT_STARVATION_RATE * livelihoodShortfall);
    region.banditPopulation -= starved;

    const banditDeathRate = BANDIT_DEATH_INTENSITY * severity / posture.settlementProtection;
    if (banditDeathRate > 0) {
      removeFromBands(region, region.population * banditDeathRate);
      syncPopulation(region);
    }
    region.report.banditry = {
      foodLooted, foodEaten, livelihoodShortfall, suppressed,
      reintegrated: reintegrated + capturedReturn, recruited,
      punished: Math.max(0, suppressed - capturedReturn - recruited),
      dispersed: dispersing, starved, alliedProtection,
      defensivePosture: policy.defensivePosture, raiderTreatment: policy.raiderTreatment,
    };
  }
  // Apply transfers after all destinations have been assessed so loop order
  // cannot let newly arrived groups raid twice in the same week.
  for (const movement of movements) {
    const borderControl = postureProfile(movement.to).borderControl;
    const arrived = movement.count / borderControl;
    movement.to.banditPopulation += arrived;
    movement.to.banditFoodStores = (movement.to.banditFoodStores || 0);
  }
}
