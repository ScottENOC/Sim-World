import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260904-weather1';
import { militaryReadiness } from '../economy/stateFinance.js?v=20260904-weather1';
import { centroidDistanceKm } from '../world/distance.js?v=20260904-weather1';
import { hasDirectContact } from '../core/knowledge.js?v=20260904-weather1';
import { horseLandSpeedMultiplier, horseMilitaryMultiplier } from '../economy/horses.js?v=20260904-policy1';
import { advancedNavyShare, navyTransportCapacity } from './army.js?v=20260905-infra1';
import { armyCohesionMultiplier, navalMissionProfile, postureProfile } from './policies.js?v=20260904-policy1';
import { findLandStagingRegion, sovereignPolity } from '../politics/polities.js?v=20260904-war1';
import { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement, resolvePartialConquest, transferRegion } from '../politics/continuity.js?v=20260907-continuity1';
import { removeFromBands, syncPopulation } from '../society/demographics.js?v=20260904-weather1';
import { recordCampaignMemories } from '../society/culturalMemory.js?v=20260907-memory1';
import { effectiveInfrastructureCount, hillFortDefenceMultiplier, overlandInfrastructureMultiplier, settlementDefenceMultiplier } from '../economy/construction.js?v=20260905-projects1';
import { returnSiegeTrain, survivingFortBenefit, takeSiegeTrain } from './siegeEquipment.js?v=20260905-siege1';
import { chooseBattlefield, recordCombatExperience, terrainCombatMultiplier } from './terrain.js?v=20260908-terrain1';
import { formationAmphibiousBonus, formationMobilityBonus, formationSiegeBonus } from './formations.js?v=20260908-prof1';
import { marchSpeedMultiplier, moraleShockMultiplier, professionalLogisticsMultiplier, retreatLossMultiplier } from './professionalisation.js?v=20260908-prof1';

export const CAMPAIGN_OBJECTIVES = Object.freeze({
  devastation: { label: 'Destroy the region', pressureRate: 0.8, damageRate: 1.8 },
  subjugation: { label: 'Force submission', pressureRate: 1, damageRate: 0.75 },
  punitive: { label: 'Inflict damage and withdraw', pressureRate: 1.2, damageRate: 1.1 },
  liberation: { label: 'Liberate for an allied claimant', pressureRate: 1, damageRate: 0.55 },
});

const LAND_SPEED_KM_PER_WEEK = 85;
const SEA_SPEED_KM_PER_WEEK = 140;
const DEFENDER_HOME_ADVANTAGE = 1.8;
const MIN_CAMPAIGN_FORCE = 25;
let nextCampaignId = 1;

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function campaignMobility(region) {
  const movement = horseLandSpeedMultiplier(region) * overlandInfrastructureMultiplier(region) *
    marchSpeedMultiplier(region) * (1 + formationMobilityBonus(region));
  return clamp((movement - 0.8) / 1.25);
}

export function syncNextCampaignId(campaigns = []) {
  nextCampaignId = Math.max(1, ...campaigns.map((campaign) => (Number(campaign.id) || 0) + 1));
}

export function campaignTravelWeeks(attacker, defender, viaSea) {
  const distance = centroidDistanceKm(attacker, defender) ?? 500;
  const speed = viaSea
    ? SEA_SPEED_KM_PER_WEEK * (1 + advancedNavyShare(attacker) * 0.5)
    : LAND_SPEED_KM_PER_WEEK * horseLandSpeedMultiplier(attacker) * overlandInfrastructureMultiplier(attacker) *
      marchSpeedMultiplier(attacker) * (1 + formationMobilityBonus(attacker));
  return Math.max(1, Math.ceil(distance / speed));
}

export function canCampaign(attacker, defender, campaigns = [], regions = null, polities = null) {
  if (!attacker || !defender || attacker.id === defender.id) return { possible: false, reason: 'same_region' };
  if (campaigns.some((campaign) => !campaign.completed &&
      [campaign.attackerId, campaign.defenderId].some((id) => id === attacker.id || id === defender.id))) {
    return { possible: false, reason: 'already_at_war' };
  }
  const staging = regions && polities ? findLandStagingRegion(attacker, defender, regions, polities)
    : attacker.neighbors.includes(defender.id) ? attacker : null;
  if (staging && (hasDirectContact(attacker, defender) || hasDirectContact(staging, defender))) {
    return { possible: true, viaSea: false, stagingRegionId: staging.id };
  }
  if (!hasDirectContact(attacker, defender) || !hasDirectContact(defender, attacker)) {
    return { possible: false, reason: 'no_contact' };
  }
  const sharedSea = attacker.adjacentSeaIds.some((id) => defender.adjacentSeaIds.includes(id));
  const seaCapacity = Math.floor(navyTransportCapacity(attacker) * navalMissionProfile(attacker).war);
  return sharedSea && seaCapacity >= MIN_CAMPAIGN_FORCE
    ? { possible: true, viaSea: true, seaCapacity }
    : { possible: false, reason: sharedSea ? 'insufficient_fleet' : 'unreachable' };
}

export function launchCampaign(attacker, defender, objective, requestedPersonnel, currentTick, options = {}) {
  if (!CAMPAIGN_OBJECTIVES[objective]) return null;
  const reach = canCampaign(attacker, defender, options.campaigns, options.regions, options.polities);
  if (!reach.possible) return null;
  let personnel = Math.floor(Math.min(requestedPersonnel, attacker.army.personnel));
  if (reach.viaSea) personnel = Math.min(personnel, reach.seaCapacity);
  if (personnel < MIN_CAMPAIGN_FORCE) return null;
  const travelWeeks = campaignTravelWeeks(attacker, defender, reach.viaSea);
  attacker.army.personnel -= personnel;
  attacker.army.away = (attacker.army.away || 0) + personnel;
  const siegeEquipment = takeSiegeTrain(attacker, personnel);
  return {
    id: nextCampaignId++, attackerId: attacker.id, defenderId: defender.id, objective,
    viaSea: reach.viaSea, stagingRegionId: reach.stagingRegionId || attacker.id,
    phase: 'travelling', departTick: currentTick, arriveTick: currentTick + travelWeeks,
    travelWeeks, returnTick: null, completed: false, withdrawRequested: false,
    initialPersonnel: personnel, personnel, militia: 0,
    siegeEquipment,
    beneficiaryPolityId: options.beneficiaryPolityId || null,
    pressure: 0, damage: 0, attackerMorale: 1, defenderMorale: 1, supply: 1,
    attackerCasualties: 0, defenderCasualties: 0, civilianDeaths: 0,
    weeksEngaged: 0, stage: 'marching', lastWeek: null, history: [], outcome: null,
    battlefield: null,
  };
}

export function requestCampaignWithdrawal(campaign) {
  if (!campaign || campaign.completed || campaign.phase === 'returning') return false;
  campaign.withdrawRequested = true;
  return true;
}

export function massMobiliseDefender(campaign, defender, fraction = 0.15) {
  if (!campaign || campaign.completed || campaign.phase !== 'engaged' || campaign.militia > 0) return 0;
  const workingAge = Math.max(0, defender.demographics?.workingAge || 0);
  const available = Math.max(0, workingAge - (defender.army?.personnel || 0) - (defender.navy?.personnel || 0));
  const raised = Math.floor(available * clamp(fraction, 0.05, 0.25));
  if (raised <= 0) return 0;
  campaign.militia = raised;
  defender.emergencyMilitiaPersonnel = raised;
  defender.stability = clamp((defender.stability ?? 1) - raised / Math.max(1, defender.population) * 0.12);
  campaign.defenderMorale = clamp(campaign.defenderMorale + 0.12);
  return raised;
}

export function conflictResourceAccess(region) {
  const pressure = clamp(region.conflictPressure || 0);
  const militiaShare = (region.emergencyMilitiaPersonnel || 0) /
    Math.max(1, region.demographics?.workingAge || region.population || 1);
  return clamp(1 - pressure * 0.65 - militiaShare * 1.8, 0.15, 1);
}

function combatPower(region, personnel, toolTypes, role, supply = 1, morale = 1, siegeTrain = null, terrain = null) {
  const equipment = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds);
  const fortCount = effectiveInfrastructureCount(region, 'hill_fort') +
    effectiveInfrastructureCount(region, 'settlement_walls') * 1.5;
  const fullFortMultiplier = hillFortDefenceMultiplier(region) * settlementDefenceMultiplier(region);
  const fortMultiplier = role === 'defender'
    ? 1 + (fullFortMultiplier - 1) * survivingFortBenefit(siegeTrain, fortCount) : 1;
  const homeAdvantage = role === 'defender'
    ? DEFENDER_HOME_ADVANTAGE * postureProfile(region).raidDefence * fortMultiplier : 1;
  const terrainMultiplier = terrain ? terrainCombatMultiplier(region, terrain) : 1;
  return personnel * equipment * militaryReadiness(region) * armyCohesionMultiplier(region) *
    horseMilitaryMultiplier(region) * terrainMultiplier * homeAdvantage *
    (0.55 + 0.45 * supply) * (0.65 + 0.35 * morale);
}

function navalControl(attacker, defender) {
  const attackerPower = (attacker.navy?.personnel || 0) * navalMissionProfile(attacker).war *
    (1 + advancedNavyShare(attacker));
  const defenderPower = (defender.navy?.personnel || 0) * navalMissionProfile(defender).war *
    (1 + advancedNavyShare(defender));
  return clamp(attackerPower / Math.max(1, attackerPower + defenderPower));
}

function beginReturn(campaign, attacker, defender, currentTick, outcome) {
  if (campaign.weeksEngaged > 0 && (outcome === 'attacker_broke' || outcome === 'withdrawn')) {
    const baseRetreatLoss = outcome === 'attacker_broke' ? 0.055 : 0.022;
    const retreatLoss = Math.min(campaign.personnel, Math.round(campaign.personnel * baseRetreatLoss * retreatLossMultiplier(attacker, currentTick)));
    if (retreatLoss > 0) {
      campaign.personnel -= retreatLoss;
      campaign.attackerCasualties += retreatLoss;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - retreatLoss);
      campaign.retreatLosses = (campaign.retreatLosses || 0) + retreatLoss;
    }
  }
  campaign.phase = 'returning';
  campaign.stage = 'withdrawing';
  campaign.outcome = outcome;
  campaign.returnTick = currentTick + campaignTravelWeeks(attacker, defender, campaign.viaSea);
  defender.conflictPressure = 0;
  defender.emergencyMilitiaPersonnel = 0;
}

function applyCivilianDamage(campaign, defender, pressureGain, attackerShare) {
  const objective = CAMPAIGN_OBJECTIVES[campaign.objective];
  const destruction = clamp((0.001 + pressureGain * 0.05) * objective.damageRate, 0, 0.025);
  for (const key of Object.keys(defender.stockpile || {})) defender.stockpile[key] *= (1 - destruction);
  defender.wallet *= (1 - destruction * 0.7);
  defender.treasury *= (1 - destruction * 0.5);
  defender.stability = clamp(defender.stability - destruction * 0.3);
  campaign.damage = clamp(campaign.damage + destruction);
  if (campaign.objective !== 'devastation') return 0;
  const deaths = Math.min(defender.population,
    defender.population * (0.00012 + campaign.pressure * 0.00028) * attackerShare);
  removeFromBands(defender, deaths);
  syncPopulation(defender);
  campaign.civilianDeaths += deaths;
  return deaths;
}

function resolveCampaignWeek(campaign, attacker, defender, polities, regions, currentTick, toolTypes, rng) {
  campaign.weeksEngaged += 1;
  const objective = CAMPAIGN_OBJECTIVES[campaign.objective];
  const control = defender.isCoastal ? navalControl(attacker, defender) : 1;
  const amphibiousPreparation = campaign.viaSea ? 1 + formationAmphibiousBonus(attacker) : 1;
  const coastalFactor = defender.isCoastal
    ? campaign.viaSea ? clamp(control * 1.35 * amphibiousPreparation, 0.25, 1.15) : clamp(0.55 + control * 0.55, 0.55, 1)
    : 1;

  const logistics = professionalLogisticsMultiplier(attacker, currentTick);
  const foodNeeded = campaign.personnel * 0.08;
  const foodSupplied = Math.min(foodNeeded, Math.max(0, attacker.stockpile?.food || 0));
  attacker.stockpile.food = Math.max(0, (attacker.stockpile.food || 0) - foodSupplied);
  const supplySuccess = foodNeeded > 0 ? foodSupplied / foodNeeded : 1;
  const defenderWater = Math.min(0.012, effectiveInfrastructureCount(defender, 'wells_cisterns') * 0.007 +
    effectiveInfrastructureCount(defender, 'canal') * 0.005);
  const supplyDrain = (0.018 + campaign.travelWeeks * 0.0025 + (defender.isCoastal ? (1 - control) * 0.035 : 0)) / logistics;
  campaign.supply = clamp(campaign.supply + supplySuccess * 0.035 * Math.min(1.18, logistics) - supplyDrain - campaign.pressure * 0.008);
  campaign.defenderMorale = clamp(campaign.defenderMorale + defenderWater);

  const terrain = campaign.battlefield?.terrain || 'plains';
  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,
    campaign.attackerMorale, null, terrain);
  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,
    campaign.defenderMorale, campaign.siegeEquipment, terrain);
  if (campaign.pressure >= 0.45) attackerPower *= 1 + formationSiegeBonus(attacker);
  const militiaPower = campaign.militia * 0.24 * postureProfile(defender).raidDefence;
  const defenderPower = defenderArmyPower + militiaPower;
  const totalPower = Math.max(1, attackerPower + defenderPower);
  const attackerShare = attackerPower / totalPower;
  const strengthRatio = attackerPower / Math.max(1, defenderPower);
  const pressureDelta = clamp((strengthRatio - 0.45) * 0.045 * objective.pressureRate * coastalFactor, -0.025, 0.11);
  campaign.pressure = clamp(campaign.pressure + pressureDelta);
  campaign.stage = campaign.pressure < 0.25 ? 'skirmishing'
    : campaign.pressure < 0.55 ? 'encirclement' : campaign.pressure < 0.85 ? 'siege' : 'collapse';

  const intensity = campaign.stage === 'skirmishing' ? 0.008 : campaign.stage === 'encirclement' ? 0.013 : 0.02;
  const variance = () => 0.75 + rng() * 0.5;
  const attackerLosses = Math.min(campaign.personnel,
    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * variance()));
  const defenderLossPool = Math.round((defender.army.personnel + campaign.militia) *
    intensity * attackerShare * variance());
  const militiaWeight = campaign.militia * 1.8;
  const armyWeight = defender.army.personnel;
  const militiaLosses = Math.min(campaign.militia, Math.round(defenderLossPool * militiaWeight /
    Math.max(1, militiaWeight + armyWeight)));
  const defenderLosses = Math.min(defender.army.personnel, defenderLossPool - militiaLosses);

  campaign.personnel -= attackerLosses;
  attacker.army.away = Math.max(0, (attacker.army.away || 0) - attackerLosses);
  defender.army.personnel -= defenderLosses;
  campaign.militia -= militiaLosses;
  defender.emergencyMilitiaPersonnel = campaign.militia;
  if (militiaLosses > 0) {
    defender.demographics.workingAge = Math.max(0, defender.demographics.workingAge - militiaLosses);
    syncPopulation(defender);
  }
  campaign.attackerCasualties += attackerLosses;
  campaign.defenderCasualties += defenderLosses + militiaLosses;

  recordCombatExperience(attacker, currentTick, {
    intensity,
    casualtyShare: attackerLosses / Math.max(1, campaign.initialPersonnel),
    defender: false,
  });
  recordCombatExperience(defender, currentTick, {
    intensity,
    casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses),
    defender: true,
  });

  const lossShock = attackerLosses / Math.max(1, campaign.initialPersonnel);
  campaign.attackerMorale = clamp(campaign.attackerMorale - lossShock * 2.2 * moraleShockMultiplier(attacker, currentTick) -
    (1 - campaign.supply) * 0.035 + Math.max(0, pressureDelta) * 0.08 - (pressureDelta <= 0 ? 0.01 : 0));
  campaign.defenderMorale = clamp(campaign.defenderMorale - Math.max(0, pressureDelta) * 0.5 * moraleShockMultiplier(defender, currentTick) -
    (defenderLosses + militiaLosses) / Math.max(1, defender.population) * 4 * moraleShockMultiplier(defender, currentTick));
  const civilianDeaths = applyCivilianDamage(campaign, defender, Math.max(0, pressureDelta), attackerShare);
  defender.conflictPressure = campaign.pressure;
  const week = { tick: currentTick, stage: campaign.stage, terrain, pressureDelta, pressure: campaign.pressure,
    attackerLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,
    defenderMorale: campaign.defenderMorale, supply: campaign.supply, strengthRatio, navalControl: control };
  campaign.lastWeek = week;
  campaign.history.push(week);
  if (campaign.history.length > 26) campaign.history.shift();

  if (campaign.withdrawRequested) return beginReturn(campaign, attacker, defender, currentTick, 'withdrawn');
  if (campaign.attackerMorale <= 0.12 || campaign.personnel < campaign.initialPersonnel * 0.15) {
    return beginReturn(campaign, attacker, defender, currentTick, 'attacker_broke');
  }
  if (campaign.objective === 'punitive' && (campaign.pressure >= 0.5 || campaign.damage >= 0.18)) {
    return beginReturn(campaign, attacker, defender, currentTick, 'punitive_success');
  }
  if (campaign.objective === 'liberation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    const currentOwner = sovereignPolity(defender, polities);
    const beneficiary = polities.find((p) => p.id === campaign.beneficiaryPolityId);
    if (currentOwner && beneficiary && currentOwner.id !== beneficiary.id) {
      const result = transferRegion(defender, currentOwner, beneficiary, regions, polities, currentTick, 'liberation');
      if (result.transferred) {
        beneficiary.continuity ||= {};
        beneficiary.continuity.status = 'claimant';
        beneficiary.continuity.seatRegionId = defender.id;
        beneficiary.continuity.hostPolityId = null;
        beneficiary.continuity.exilePopulation = 0;
        beneficiary.capitalRegionId = defender.id;
        beneficiary.rulerRegionId = defender.id;
        return beginReturn(campaign, attacker, defender, currentTick, 'liberated');
      }
    }
    return beginReturn(campaign, attacker, defender, currentTick, 'liberation_failed');
  }
  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    return beginReturn(campaign, attacker, defender, currentTick, 'submission_pending');
  }
  if (campaign.objective === 'devastation' && (campaign.pressure >= 0.95 || campaign.damage >= 0.65)) {
    defender.landQuality = Math.max(0.2, defender.landQuality * 0.97);
    return beginReturn(campaign, attacker, defender, currentTick, 'devastated');
  }
}

export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random, options = {}) {
  const events = [];
  const regionList = [...regionsById.values()];
  for (const campaign of campaigns) {
    if (campaign.completed) continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) { campaign.completed = true; continue; }
    if (!Number.isFinite(campaign.lastProcessedTick)) campaign.lastProcessedTick = campaign.departTick;

    if (campaign.phase === 'travelling' && campaign.withdrawRequested) {
      campaign.phase = 'returning'; campaign.stage = 'withdrawing'; campaign.outcome = 'withdrawn';
      const elapsedOutbound = Math.max(1, Math.min(currentTick, campaign.arriveTick) - campaign.departTick);
      campaign.returnTick = currentTick + elapsedOutbound;
      events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
    if (campaign.phase === 'travelling' && currentTick >= campaign.arriveTick) {
      campaign.phase = 'engaged'; campaign.stage = 'skirmishing';
      campaign.lastProcessedTick = Math.max(campaign.lastProcessedTick, campaign.arriveTick - 1);
      campaign.battlefield ||= chooseBattlefield({
        attacker,
        defender,
        currentTick: campaign.arriveTick,
        attackerMobility: campaignMobility(attacker),
        defenderMobility: campaignMobility(defender),
      }, rng);
      events.push({ type: 'campaign_arrived', campaign, attackerName: attacker.name, defenderName: defender.name,
        terrain: campaign.battlefield.terrain });
    }
    while (campaign.phase === 'engaged' && campaign.lastProcessedTick < currentTick) {
      const combatWeek = campaign.lastProcessedTick + 1;
      resolveCampaignWeek(campaign, attacker, defender, polities, regionList, combatWeek, toolTypes, rng);
      campaign.lastProcessedTick = combatWeek;
      if (campaign.phase === 'returning') {
        events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
        break;
      }
    }
    if (campaign.phase === 'returning' && campaign.outcome === 'submission_pending' && !campaign.settlementResolved && !campaign.settlementQueued) {
      const attackerPolity = sovereignPolity(attacker, polities);
      const defenderPolity = sovereignPolity(defender, polities);
      const partial = attackerPolity && defenderPolity
        ? resolvePartialConquest(attacker, defender, polities, regionList, currentTick) : null;
      if (partial) {
        campaign.settlementResolved = true;
        campaign.settlementQueued = true;
        campaign.outcome = partial.wasCapital ? 'capital_lost' : 'region_lost';
        events.push({ type: 'claimant_retreat', campaign, ...partial, attackerName: attacker.name, defenderName: defender.name });
      }
      const playerPolityId = options.playerPolityId || null;
      const playerInvolved = playerPolityId && (attackerPolity?.id === playerPolityId || defenderPolity?.id === playerPolityId);
      if (!partial && attackerPolity && defenderPolity && playerInvolved) {
        const playerRole = attackerPolity.id === playerPolityId ? 'conqueror' : 'defeated';
        let offer = null;
        if (playerRole === 'defeated') {
          const type = chooseNpcConquestOffer(attacker, defender, polities, regionList);
          offer = createConquestSettlementOffer(attacker, defender, type, polities, regionList, currentTick);
        }
        campaign.settlementQueued = true;
        events.push({ type: 'settlement_required', campaign, attackerName: attacker.name, defenderName: defender.name,
          attackerId: attacker.id, defenderId: defender.id, attackerPolityId: attackerPolity.id,
          defenderPolityId: defenderPolity.id, playerRole, offer });
      } else if (!partial && attackerPolity && defenderPolity) {
        const type = chooseNpcConquestOffer(attacker, defender, polities, regionList);
        const offer = createConquestSettlementOffer(attacker, defender, type, polities, regionList, currentTick);
        const result = resolveNpcSettlement(offer, polities, regionList, currentTick);
        campaign.settlementResolved = true;
        campaign.settlementQueued = true;
        campaign.settlement = offer;
        campaign.settlementResult = result;
        campaign.outcome = 'submission';
        events.push({ type: 'settlement_resolved', campaign, offer, result, attackerName: attacker.name, defenderName: defender.name });
      }
    }
    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {
      attacker.army.personnel += campaign.personnel;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - campaign.personnel);
      returnSiegeTrain(attacker, campaign.siegeEquipment);
      campaign.completed = true; campaign.phase = 'completed';
      recordCampaignMemories(campaign, attacker, defender, currentTick);
      events.push({ type: 'campaign_returned', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
  }
  return { remaining: campaigns.filter((campaign) => !campaign.completed), events };
}
