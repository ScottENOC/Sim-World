import { toolEfficiencyMultiplier } from '../economy/tools.js';

// Sea raids need transport capacity, not just a shared sea — a boat can
// carry more than just its own crew.
const RAIDERS_PER_BOAT = 10;

// Travel takes real time, at different paces overland vs by sea, using the
// same centroid distances trade already reads. This is what makes "sending
// the army raiding means it's not home defending" a genuine tradeoff rather
// than a free action — the round trip can take months.
const LAND_SPEED_KM_PER_WEEK = 120;
const SEA_SPEED_KM_PER_WEEK = 200;

const DEFENDER_HOME_ADVANTAGE = 1.3; // fortification, local knowledge, short supply lines
const BASE_LOSS_RATE = 0.25;         // max casualties the losing side takes in a lopsided fight
const STEAL_BASE_FRACTION = 0.3;     // max fraction of stockpile/wallet lost in a total rout
const STABILITY_LOSS_BASE = 0.15;

export function maxSeaRaidersAvailable(region) {
  return Math.floor(region.navy.boats * RAIDERS_PER_BOAT);
}

export function computeTravelWeeks(attacker, defender, viaSea) {
  const distanceKm = attacker.distanceKm[defender.id] || 500;
  const speed = viaSea ? SEA_SPEED_KM_PER_WEEK : LAND_SPEED_KM_PER_WEEK;
  return Math.max(1, Math.ceil(distanceKm / speed));
}

// Can attacker even reach defender? Land-adjacent always works; otherwise
// needs a shared sea AND enough navy to carry at least one raider.
export function canRaid(attacker, defender) {
  if (attacker.id === defender.id) return { possible: false };
  if (attacker.neighbors.includes(defender.id)) return { possible: true, viaSea: false };
  const sharedSea = attacker.adjacentSeaIds.some((id) => defender.adjacentSeaIds.includes(id));
  if (sharedSea && maxSeaRaidersAvailable(attacker) > 0) return { possible: true, viaSea: true };
  return { possible: false };
}

let nextRaidId = 1;

// Deducts personnel from the attacker's home army immediately (they're
// marked "away" — see army.js's adjustArmySize for why that matters for
// recruitment) and queues a raid to resolve on arrival.
export function launchRaid(attacker, defender, requestedPersonnel, viaSea, currentTick) {
  let personnel = Math.min(requestedPersonnel, attacker.army.personnel);
  if (viaSea) personnel = Math.min(personnel, maxSeaRaidersAvailable(attacker));
  personnel = Math.floor(personnel);
  if (personnel <= 0) return null;

  const travelWeeks = computeTravelWeeks(attacker, defender, viaSea);
  attacker.army.personnel -= personnel;
  attacker.army.away = (attacker.army.away || 0) + personnel;

  return {
    id: nextRaidId++,
    attackerId: attacker.id,
    defenderId: defender.id,
    personnel,
    viaSea,
    departTick: currentTick,
    arriveTick: currentTick + travelWeeks,
    returnTick: null, // set once combat resolves — survivors still have to march/sail home
    resolved: false,
    completed: false,
    outcome: null,
  };
}

// Call every tick with the current list of in-flight raids. Returns the
// still-active raids (completed ones are dropped) plus any events that
// happened this tick, for the UI to show as an auto-pausing popup.
export function tickRaids(raids, regionsById, currentTick, toolTypes, rng) {
  const events = [];
  for (const raid of raids) {
    if (!raid.resolved && currentTick >= raid.arriveTick) {
      const attacker = regionsById.get(raid.attackerId);
      const defender = regionsById.get(raid.defenderId);
      const outcome = resolveCombat(attacker, defender, raid.personnel, toolTypes, rng);
      raid.outcome = outcome;
      raid.resolved = true;
      raid.returnTick = currentTick + computeTravelWeeks(attacker, defender, raid.viaSea);
      events.push({ type: 'raid_resolved', raid, attackerName: attacker.name, defenderName: defender.name, outcome });
    }
    if (raid.resolved && !raid.completed && currentTick >= raid.returnTick) {
      const attacker = regionsById.get(raid.attackerId);
      attacker.army.personnel += raid.outcome.attackerSurvivors;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - raid.personnel);
      raid.completed = true;
    }
  }
  return { remaining: raids.filter((r) => !r.completed), events };
}

function resolveCombat(attacker, defender, raidingPersonnel, toolTypes, rng) {
  const attackerEquip = toolEfficiencyMultiplier(attacker, 'soldier', toolTypes.soldier, attacker.unlockedTechIds);
  const defenderEquip = toolEfficiencyMultiplier(defender, 'soldier', toolTypes.soldier, defender.unlockedTechIds);

  const attackerPower = raidingPersonnel * attackerEquip;
  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE;
  const totalPower = attackerPower + defenderPower;
  // totalPower === 0 (e.g. an unarmed raid on an undefended region) still
  // needs SOME resolution — treat it as an even coin flip in power terms,
  // letting the RNG variance below decide the details.
  const attackerRatio = totalPower > 0 ? attackerPower / totalPower : 0.5;

  const variance = () => 0.7 + rng() * 0.6; // ±30%, so a nominally-stronger side can still get unlucky
  const attackerLossFraction = Math.min(1, BASE_LOSS_RATE * (1 - attackerRatio) * variance());
  const defenderLossFraction = Math.min(1, BASE_LOSS_RATE * attackerRatio * variance());

  const attackerLosses = Math.round(raidingPersonnel * attackerLossFraction);
  const defenderLosses = Math.round(defender.army.personnel * defenderLossFraction);
  const attackerSurvivors = Math.max(0, raidingPersonnel - attackerLosses);
  defender.army.personnel = Math.max(0, defender.army.personnel - defenderLosses);

  // Loot scales with how dominant the attack was, with its own randomness —
  // a decisive win doesn't guarantee a maximal haul.
  const stealFraction = Math.min(0.9, STEAL_BASE_FRACTION * attackerRatio * (0.5 + rng()));
  const looted = {};
  for (const key of Object.keys(defender.stockpile)) {
    const amount = (defender.stockpile[key] || 0) * stealFraction;
    if (amount > 0.01) {
      defender.stockpile[key] -= amount;
      attacker.stockpile[key] = (attacker.stockpile[key] || 0) + amount;
      looted[key] = amount;
    }
  }
  const walletStolen = defender.wallet * stealFraction;
  defender.wallet -= walletStolen;
  attacker.wallet += walletStolen;

  const stabilityLoss = STABILITY_LOSS_BASE * attackerRatio;
  defender.stability = Math.max(0, defender.stability - stabilityLoss);

  return { attackerRatio, attackerLosses, defenderLosses, attackerSurvivors, looted, walletStolen, stabilityLoss };
}
