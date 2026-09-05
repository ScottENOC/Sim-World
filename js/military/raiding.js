import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260904-weather1';
import { hasDirectContact, learnAbout } from '../core/knowledge.js?v=20260904-weather1';
import { centroidDistanceKm } from '../world/distance.js?v=20260904-weather1';
import { advancedNavyShare, navyTransportCapacity } from './army.js?v=20260904-policy1';
import { militaryReadiness } from '../economy/stateFinance.js?v=20260904-weather1';
import { horseLandSpeedMultiplier, horseMilitaryMultiplier } from '../economy/horses.js?v=20260904-weather1';
import { localPrice } from '../economy/prices.js?v=20260904-weather1';
import { changeAttitude } from '../diplomacy/relations.js?v=20260904-save1';
import { hillFortDefenceMultiplier } from '../economy/construction.js?v=20260904-build1';
import { findLandStagingRegion, recordContingentReturns } from '../politics/polities.js?v=20260904-kingdom1';
import { armyCohesionMultiplier, navalMissionProfile, postureProfile } from './policies.js?v=20260904-policy1';

const LAND_SPEED_KM_PER_WEEK = 120;
const SEA_SPEED_KM_PER_WEEK = 200;
const DEFENDER_HOME_ADVANTAGE = 1.3;
const BASE_LOSS_RATE = 0.25;
const STEAL_BASE_FRACTION = 0.3;
const STABILITY_LOSS_BASE = 0.15;
const RAID_KNOWLEDGE_SUCCESS = 0.35;
const RAID_KNOWLEDGE_REPELLED = 0.75;

export function maxSeaRaidersAvailable(region) {
  return Math.floor(navyTransportCapacity(region) * navalMissionProfile(region).war);
}
export function computeTravelWeeks(attacker, defender, viaSea) {
  const distanceKm = centroidDistanceKm(attacker, defender) ?? 500;
  const speed = viaSea
    ? SEA_SPEED_KM_PER_WEEK * (1 + advancedNavyShare(attacker) * 0.75)
    : LAND_SPEED_KM_PER_WEEK * horseLandSpeedMultiplier(attacker);
  return Math.max(1, Math.ceil(distanceKm / speed));
}

export function canRaid(attacker, defender, regions = null, polities = null) {
  if (attacker.id === defender.id) return { possible: false };
  const staging = regions && polities ? findLandStagingRegion(attacker, defender, regions, polities) :
    (attacker.neighbors.includes(defender.id) ? attacker : null);
  if (staging && (hasDirectContact(attacker, defender) || hasDirectContact(staging, defender))) {
    return { possible: true, viaSea: false, stagingRegionId: staging.id };
  }
  if (!hasDirectContact(attacker, defender) || !hasDirectContact(defender, attacker)) {
    return { possible: false, reason: 'no_contact' };
  }
  const sharedSea = attacker.adjacentSeaIds.some((id) => defender.adjacentSeaIds.includes(id));
  if (sharedSea && maxSeaRaidersAvailable(attacker) > 0) return { possible: true, viaSea: true };
  return { possible: false };
}

let nextRaidId = 1;
export function syncNextRaidId(raids = []) {
  nextRaidId = Math.max(1, ...raids.map((raid) => (Number(raid.id) || 0) + 1));
}

export function launchRaid(attacker, defender, requestedPersonnel, viaSea, currentTick, options = {}) {
  const reach = canRaid(attacker, defender, options.regions, options.polities);
  if (!reach.possible || reach.viaSea !== viaSea) return null;
  let homePersonnel = Math.floor(Math.min(requestedPersonnel, attacker.army.personnel));
  const contingents = viaSea ? [] : (options.contingents || []).filter((contingent) => contingent.personnel > 0);
  let contingentPersonnel = contingents.reduce((sum, contingent) => sum + contingent.personnel, 0);
  if (viaSea) homePersonnel = Math.min(homePersonnel, maxSeaRaidersAvailable(attacker));
  const personnel = homePersonnel + contingentPersonnel;
  if (personnel <= 0) return null;
  const travelWeeks = computeTravelWeeks(attacker, defender, viaSea);
  attacker.army.personnel -= homePersonnel;
  attacker.army.away = (attacker.army.away || 0) + homePersonnel;
  if (attacker.raidEconomy) {
    attacker.raidEconomy.raidsLaunched += 1;
    attacker.raidEconomy.lastRaidTick = currentTick;
  }
  return { id: nextRaidId++, attackerId: attacker.id, defenderId: defender.id, personnel, homePersonnel,
    contingents, viaSea, stagingRegionId: reach.stagingRegionId || attacker.id,
    departTick: currentTick, arriveTick: currentTick + travelWeeks, returnTick: null,
    resolved: false, completed: false, outcome: null };
}

export function tickRaids(raids, regionsById, currentTick, toolTypes, rng) {
  const events = [];
  for (const raid of raids) {
    if (!raid.resolved && currentTick >= raid.arriveTick) {
      const attacker = regionsById.get(raid.attackerId);
      const defender = regionsById.get(raid.defenderId);
      const outcome = resolveCombat(attacker, defender, raid.personnel, toolTypes, rng, raid.viaSea);
      const won = outcome.attackerRatio > 0.5;
      if (!defender.militaryThreat) defender.militaryThreat = { lastRaidedTick: null, recentRaids: 0 };
      defender.militaryThreat.lastRaidedTick = currentTick;
      defender.militaryThreat.recentRaids = Math.min(10, (defender.militaryThreat.recentRaids || 0) + 1);
      // The victim remembers even an unsuccessful raid. The attacker also
      // becomes somewhat more contemptuous, particularly after a victory.
      changeAttitude(defender, attacker.id, won ? -0.45 : -0.32, 'raided', currentTick);
      changeAttitude(attacker, defender.id, won ? -0.1 : -0.04, 'raid', currentTick);
      if (attacker.raidEconomy) {
        if (won) attacker.raidEconomy.raidsWon += 1;
        attacker.raidEconomy.totalLootValue += outcome.lootValue;
        attacker.raidEconomy.totalCasualties += outcome.attackerLosses;
      }
      const knowledgeGained = won ? RAID_KNOWLEDGE_SUCCESS : RAID_KNOWLEDGE_REPELLED;
      learnAbout(defender, attacker, knowledgeGained, currentTick);
      // Captives, deserters and observed equipment can carry techniques in
      // either direction. As with refugees this creates exposure, not an
      // immediate technology unlock.
      if (defender.unlockedTechIds.has('iron_smelting')) {
        attacker.ironWorkingExposure = Math.min(10,
          (attacker.ironWorkingExposure || 0) + 0.01 * Math.max(0.05, defender.ironWorkingReadiness || 0));
      }
      if (attacker.unlockedTechIds.has('iron_smelting')) {
        defender.ironWorkingExposure = Math.min(10,
          (defender.ironWorkingExposure || 0) + 0.01 * Math.max(0.05, attacker.ironWorkingReadiness || 0));
      }
      outcome.defenderKnowledgeGained = knowledgeGained;
      outcome.defenderLearnedOrigin = true;
      raid.outcome = outcome;
      raid.resolved = true;
      raid.returnTick = currentTick + computeTravelWeeks(attacker, defender, raid.viaSea);
      events.push({ type: 'raid_resolved', raid, attackerName: attacker.name, defenderName: defender.name, outcome });
    }
    if (raid.resolved && !raid.completed && currentTick >= raid.returnTick) {
      const attacker = regionsById.get(raid.attackerId);
      const survivalRate = raid.personnel > 0 ? raid.outcome.attackerSurvivors / raid.personnel : 0;
      const homeSent = raid.homePersonnel ?? raid.personnel;
      const homeReturned = Math.min(homeSent, Math.round(homeSent * survivalRate));
      attacker.army.personnel += homeReturned;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - homeSent);
      for (const contingent of raid.contingents || []) {
        const vassal = regionsById.get(contingent.regionId);
        if (!vassal) continue;
        const returned = Math.min(contingent.personnel, Math.round(contingent.personnel * survivalRate));
        vassal.army.personnel += returned;
        vassal.army.away = Math.max(0, (vassal.army.away || 0) - contingent.personnel);
        recordContingentReturns(vassal, contingent.personnel, returned);
      }
      raid.completed = true;
    }
  }
  return { remaining: raids.filter((r) => !r.completed), events };
}

function resolveCombat(attacker, defender, raidingPersonnel, toolTypes, rng, viaSea = false) {
  const attackerEquip = toolEfficiencyMultiplier(attacker, 'soldier', toolTypes.soldier, attacker.unlockedTechIds);
  const defenderEquip = toolEfficiencyMultiplier(defender, 'soldier', toolTypes.soldier, defender.unlockedTechIds);
  const maritimeAssaultBonus = viaSea ? 1 + advancedNavyShare(attacker) * 0.5 : 1;
  const attackerPower = raidingPersonnel * attackerEquip * maritimeAssaultBonus * militaryReadiness(attacker) *
    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker));
  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE *
    postureProfile(defender).raidDefence * militaryReadiness(defender) *
    armyCohesionMultiplier(defender) * horseMilitaryMultiplier(defender) * hillFortDefenceMultiplier(defender);
  const totalPower = attackerPower + defenderPower;
  const attackerRatio = totalPower > 0 ? attackerPower / totalPower : 0.5;
  const variance = () => 0.7 + rng() * 0.6;
  const attackerLossFraction = Math.min(1, BASE_LOSS_RATE * (1 - attackerRatio) * variance());
  const defenderLossFraction = Math.min(1, BASE_LOSS_RATE * attackerRatio * variance());
  const attackerLosses = Math.round(raidingPersonnel * attackerLossFraction);
  const defenderLosses = Math.round(defender.army.personnel * defenderLossFraction);
  const attackerSurvivors = Math.max(0, raidingPersonnel - attackerLosses);
  defender.army.personnel = Math.max(0, defender.army.personnel - defenderLosses);
  const stealFraction = Math.min(0.9, STEAL_BASE_FRACTION * attackerRatio * (0.5 + rng()));
  const looted = {};
  let stockLootValue = 0;
  for (const key of Object.keys(defender.stockpile)) {
    const amount = (defender.stockpile[key] || 0) * stealFraction;
    if (amount > 0.01) {
      stockLootValue += amount * localPrice(defender, key);
      defender.stockpile[key] -= amount;
      attacker.stockpile[key] = (attacker.stockpile[key] || 0) + amount;
      looted[key] = amount;
    }
  }
  const walletStolen = defender.wallet * stealFraction;
  const treasuryStolen = defender.treasury * stealFraction;
  defender.wallet -= walletStolen;
  defender.treasury -= treasuryStolen;
  attacker.wallet += walletStolen + treasuryStolen;
  const stabilityLoss = STABILITY_LOSS_BASE * attackerRatio;
  defender.stability = Math.max(0, defender.stability - stabilityLoss);
  const lootValue = stockLootValue + walletStolen + treasuryStolen;
  return { attackerRatio, attackerLosses, defenderLosses, attackerSurvivors, looted, walletStolen,
    treasuryStolen, stabilityLoss,
    maritimeAssaultBonus, lootValue };
}
