import { accumulateExperience, skillMultiplier } from './learningByDoing.js?v=20260906-seamanship1';

// Seamanship is practical, shared maritime know-how rather than a discrete
// invention. Experience comes from actually putting people and boats to sea.
// The coefficients are intentionally modest: repeated generations of activity
// matter, while one expedition does not create an instant naval powerhouse.
const BOAT_FISHER_WEIGHT = 1;
const SEA_MERCHANT_WEIGHT = 1.8;
const SCOUTING_SOLDIER_WEIGHT = 2.2;
const NAVAL_RAIDER_WEIGHT = 2.8;

export function seamanshipMultiplier(region) {
  return skillMultiplier(region, 'seamanship');
}

export function recordMaritimeExperience(region, workerEquivalent) {
  accumulateExperience(region, 'seamanship', Math.max(0, Number(workerEquivalent) || 0));
}

function activeSeaMerchantWorkers(region) {
  const ventures = region.tradeEconomy?.ventures;
  if (!Array.isArray(ventures)) return 0;
  return ventures
    .filter((venture) => venture?.mode === 'sea' && !venture.completed)
    .reduce((sum, venture) => sum + Math.max(0,
      Number(venture.merchants ?? venture.personnel ?? venture.workers ?? 0) || 0), 0);
}

export function tickMaritimeExperience(regions, activeRaids = [], elapsedDays = 7) {
  const weekScale = Math.max(0, (Number(elapsedDays) || 0) / 7);
  if (weekScale <= 0) return;

  const raidersByOrigin = new Map();
  for (const raid of activeRaids || []) {
    if (!raid?.viaSea || raid.completed) continue;
    raidersByOrigin.set(raid.attackerId,
      (raidersByOrigin.get(raid.attackerId) || 0) + Math.max(0, Number(raid.personnel) || 0));
  }

  for (const region of regions) {
    const boatFishers = Math.max(0, Number(region.occupations?.boatFisher) || 0);
    const seaMerchants = activeSeaMerchantWorkers(region);
    const scouts = region.scouting?.active && region.scouting.mode === 'sea'
      ? Math.max(0, Number(region.scouting.armyCommitted) || 0)
      : 0;
    const navalRaiders = raidersByOrigin.get(region.id) || 0;

    const workerEquivalent = (
      boatFishers * BOAT_FISHER_WEIGHT +
      seaMerchants * SEA_MERCHANT_WEIGHT +
      scouts * SCOUTING_SOLDIER_WEIGHT +
      navalRaiders * NAVAL_RAIDER_WEIGHT
    ) * weekScale;

    if (workerEquivalent > 0) recordMaritimeExperience(region, workerEquivalent);
  }
}
