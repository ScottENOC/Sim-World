import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';
import { ensureSubregionalControl } from './subregionalControl.js?v=20260908-subregion1';
import { FLEET_MISSIONS } from './fleets.js?v=20260908-fleets1';
import { campaignSupplyCorridor } from './supplyCorridors.js?v=20260908-corridor1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;

const DAILY_FOOD_PER_SOLDIER = 0.08 / 7;
const DEFAULT_CARRIED_WEEKS = 5;

function relevantSeaIds(attacker, defender) {
  const a = new Set(attacker?.adjacentSeaIds || []);
  const shared = (defender?.adjacentSeaIds || []).filter((id) => a.has(id));
  return shared.length ? shared : [...new Set([...(attacker?.adjacentSeaIds || []), ...(defender?.adjacentSeaIds || [])])];
}

function fleetStrength(fleet) {
  return (fleet?.ships || []).reduce((sum, ship) => sum + Math.max(0, ship.condition ?? 1), 0);
}

function fleetOnRoute(fleet, attacker, defender) {
  const seas = new Set(relevantSeaIds(attacker, defender));
  return (fleet.locationType === 'sea' && seas.has(fleet.seaRegionId)) ||
    (fleet.locationType === 'port' && fleet.portRegionId === attacker.id);
}

function supportingFleets(attacker, defender, fleets = []) {
  const actor = actorId(attacker);
  return fleets.filter((fleet) => fleet.ownerActorId === actor && fleetStrength(fleet) > 0 && fleetOnRoute(fleet, attacker, defender));
}

function hostileInterdiction(attacker, defender, fleets = []) {
  const actor = actorId(attacker);
  const seas = new Set(relevantSeaIds(attacker, defender));
  let threat = 0;
  for (const fleet of fleets) {
    if (fleet.ownerActorId === actor || fleetStrength(fleet) <= 0 || fleet.locationType !== 'sea' || !seas.has(fleet.seaRegionId)) continue;
    if (![FLEET_MISSIONS.BLOCKADE, FLEET_MISSIONS.INTERCEPT, FLEET_MISSIONS.PATROL, FLEET_MISSIONS.RAID_SHIPPING].includes(fleet.mission)) continue;
    const mission = fleet.mission === FLEET_MISSIONS.BLOCKADE || fleet.mission === FLEET_MISSIONS.INTERCEPT ? 1 : 0.65;
    threat += fleetStrength(fleet) * mission;
  }
  return threat;
}

function portState(campaign, defender) {
  const control = ensureSubregionalControl(defender);
  const actor = campaign.occupationActorId;
  const port = control.places.find((p) => p.kind === 'port');
  if (!port || port.controllerActorId !== actor) return { captured: false, throughput: 0.28, nodeId: null };
  const harbour = effectiveInfrastructureCount(defender, 'harbour');
  const shipyard = effectiveInfrastructureCount(defender, 'shipyard');
  const navalBase = effectiveInfrastructureCount(defender, 'naval_base');
  const throughput = clamp(0.72 + harbour * 0.12 + shipyard * 0.05 + navalBase * 0.07, 0.72, 1.25);
  return { captured: true, throughput, nodeId: port.id };
}

export function initialiseExpeditionaryLogistics(campaign, attacker, defender, fleets = [], currentTick = 0) {
  if (!campaign?.viaSea) return null;
  const requirementPerWeek = Math.max(1, campaign.personnel * DAILY_FOOD_PER_SOLDIER * 7);
  const fleetList = supportingFleets(attacker, defender, fleets);
  campaign.logisticsState = {
    version: 1,
    supplyMode: 'maritime',
    sourceRegionId: attacker.id,
    portRegionId: defender.id,
    routeSeaIds: relevantSeaIds(attacker, defender),
    supportFleetIds: fleetList.map((f) => f.id),
    weeklyRequirement: requirementPerWeek,
    carriedFood: requirementPerWeek * DEFAULT_CARRIED_WEEKS,
    carriedStores: requirementPerWeek * 3,
    horseFodder: requirementPerWeek * 2.5,
    deliveredLastWeek: 0,
    routeReliability: fleetList.length ? 1 : 0,
    deliveryCapacity: requirementPerWeek,
    localForagingCapacity: 0,
    weeksIsolated: 0,
    isIsolated: fleetList.length === 0,
    rationing: false,
    status: fleetList.length ? 'supplied' : 'living_on_stores',
    lastTick: currentTick,
  };
  return campaign.logisticsState;
}

function localSupply(campaign, defender, requirement, maximumNeeded) {
  if (maximumNeeded <= 0) return 0;
  const control = ensureSubregionalControl(defender);
  const actor = campaign.occupationActorId;
  const ruralShare = clamp(control.ruralControl?.[actor] || 0);
  const stability = clamp(defender.stability ?? 0.7);
  const availableFood = Math.max(0, defender.stockpile?.food || 0);
  const potential = requirement * clamp(ruralShare * 1.35 + (1 - stability) * 0.12, 0, 0.8);
  const taken = Math.min(availableFood, potential, maximumNeeded);
  if (taken > 0) {
    defender.stockpile.food = Math.max(0, availableFood - taken);
    defender.stability = clamp(stability - (taken / Math.max(1, requirement)) * 0.006);
  }
  return taken;
}

export function tickExpeditionaryLogistics(campaign, attacker, defender, fleets = [], currentTick = 0) {
  if (!campaign?.viaSea) return { active: false, supplyFraction: 1, combatMultiplier: 1, movementMultiplier: 1 };
  const state = campaign.logisticsState || initialiseExpeditionaryLogistics(campaign, attacker, defender, fleets, currentTick);
  const requirement = Math.max(1, campaign.personnel * DAILY_FOOD_PER_SOLDIER * 7);
  state.weeklyRequirement = requirement;

  const support = (fleets || []).filter((f) => state.supportFleetIds.includes(f.id) && fleetStrength(f) > 0 && fleetOnRoute(f, attacker, defender));
  const supportPower = support.reduce((sum, f) => sum + fleetStrength(f), 0);
  const threat = hostileInterdiction(attacker, defender, fleets);
  const escortRatio = supportPower / Math.max(1, supportPower + threat);
  const port = portState(campaign, defender);
  const routePresence = supportPower > 0 ? 1 : 0;
  const missionBonus = support.some((f) => [FLEET_MISSIONS.ESCORT, FLEET_MISSIONS.PATROL, FLEET_MISSIONS.INTERCEPT].includes(f.mission)) ? 0.12 : 0;
  state.routeReliability = clamp(routePresence * (0.3 + escortRatio * 0.62 + missionBonus), 0, 1);
  const corridor = campaignSupplyCorridor(campaign, defender);
  state.internalCorridorReliability = port.captured ? corridor.reliability : 1;
  state.corridorBrokenNodeId = port.captured ? corridor.brokenNodeId : null;
  state.corridorWeakNodeId = port.captured ? corridor.weakNodeId : null;
  state.routeReliability = clamp(state.routeReliability * state.internalCorridorReliability);
  state.deliveryCapacity = requirement * port.throughput * state.routeReliability;

  const sourceFood = Math.max(0, attacker.stockpile?.food || 0);
  const delivered = Math.min(sourceFood, state.deliveryCapacity);
  attacker.stockpile.food = Math.max(0, sourceFood - delivered);
  state.deliveredLastWeek = delivered;

  const reserveWeeks = state.carriedFood / Math.max(1, requirement);
  const localNeed = state.routeReliability < 0.75 || reserveWeeks < 2
    ? Math.max(0, requirement - delivered)
    : 0;
  const foraged = localSupply(campaign, defender, requirement, localNeed);
  state.localForagingCapacity = foraged;
  state.carriedFood += delivered + foraged;
  const consumed = Math.min(state.carriedFood, requirement);
  state.carriedFood = Math.max(0, state.carriedFood - consumed);
  const supplyFraction = clamp(consumed / requirement);

  state.isIsolated = state.routeReliability < 0.08;
  state.weeksIsolated = state.isIsolated ? state.weeksIsolated + 1 : Math.max(0, state.weeksIsolated - 1);
  state.rationing = supplyFraction < 0.82 || (state.carriedFood / requirement) < 1.5;
  state.status = supplyFraction >= 0.95 ? (state.isIsolated ? 'living_on_stores' : 'supplied')
    : supplyFraction >= 0.7 ? 'rationing'
    : supplyFraction >= 0.35 ? 'severe_shortage' : 'starving';
  state.lastTick = currentTick;

  const combatMultiplier = supplyFraction >= 0.95 ? 1
    : supplyFraction >= 0.7 ? 0.94
    : supplyFraction >= 0.35 ? 0.78 : 0.55;
  const movementMultiplier = supplyFraction >= 0.95 ? 1
    : supplyFraction >= 0.7 ? 0.9
    : supplyFraction >= 0.35 ? 0.68 : 0.45;
  const moraleDelta = supplyFraction >= 0.95 ? 0 : supplyFraction >= 0.7 ? -0.01 : supplyFraction >= 0.35 ? -0.035 : -0.08;
  const attritionRate = supplyFraction >= 0.7 ? 0 : supplyFraction >= 0.35 ? 0.0025 : 0.009;

  return { active: true, state, port, supplyFraction, combatMultiplier, movementMultiplier, moraleDelta, attritionRate, delivered, foraged };
}

export function expeditionarySupplySummary(campaign) {
  const s = campaign?.logisticsState;
  if (!s) return null;
  const weeksFood = s.weeklyRequirement > 0 ? s.carriedFood / s.weeklyRequirement : 0;
  return {
    status: s.status,
    weeksFood,
    routeReliability: s.routeReliability,
    internalCorridorReliability: s.internalCorridorReliability ?? 1,
    corridorBrokenNodeId: s.corridorBrokenNodeId || null,
    corridorWeakNodeId: s.corridorWeakNodeId || null,
    deliveredLastWeek: s.deliveredLastWeek,
    localForagingCapacity: s.localForagingCapacity,
    isIsolated: s.isIsolated,
    weeksIsolated: s.weeksIsolated,
    supportFleetIds: [...(s.supportFleetIds || [])],
  };
}
