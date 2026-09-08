import { FLEET_MISSIONS, orderFleetToSea } from './fleets.js?v=20260908-fleets1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null; }
function fleetStrength(fleet) { return (fleet?.ships || []).reduce((sum, ship) => sum + Math.max(0, ship.condition ?? 1), 0); }
function weeksFood(campaign) {
  const s = campaign?.logisticsState;
  return s?.weeklyRequirement > 0 ? Math.max(0, (s.carriedFood || 0) / s.weeklyRequirement) : Infinity;
}

export function coordinateExpeditionRelief(campaign, attacker, defender, fleets = [], regionsById = new Map(), seaRegionsById = new Map(), currentTick = 0) {
  if (!campaign?.viaSea || !campaign.logisticsState) return { directive: 'none' };
  const state = campaign.logisticsState;
  const foodWeeks = weeksFood(campaign);
  const routeReliability = clamp(state.routeReliability ?? 1);
  const danger = state.status === 'starving' ? 1 : state.status === 'severe_shortage' ? 0.82
    : state.status === 'rationing' ? 0.58 : foodWeeks < 2.5 ? 0.48 : routeReliability < 0.6 ? 0.42 : 0;
  if (danger <= 0) {
    campaign.reliefState = { directive: 'none', updatedTick: currentTick };
    return campaign.reliefState;
  }

  const owner = actorId(attacker);
  const targetSeaId = (state.routeSeaIds || []).at(-1) || (defender.adjacentSeaIds || [])[0] || null;
  const candidates = fleets
    .filter((fleet) => fleet.ownerActorId === owner && fleetStrength(fleet) > 0)
    .sort((a, b) => {
      const aSupport = (state.supportFleetIds || []).includes(a.id) ? 1 : 0;
      const bSupport = (state.supportFleetIds || []).includes(b.id) ? 1 : 0;
      return aSupport - bSupport || fleetStrength(b) - fleetStrength(a);
    });

  let dispatched = null;
  if (targetSeaId) {
    for (const fleet of candidates) {
      if ((state.supportFleetIds || []).includes(fleet.id) && fleet.locationType === 'sea' && (state.routeSeaIds || []).includes(fleet.seaRegionId)) continue;
      if (fleet.supply < 0.3 || fleet.fatigue > 0.8) continue;
      if (fleet.locationType === 'sea' && fleet.seaRegionId === targetSeaId) {
        fleet.mission = FLEET_MISSIONS.ESCORT;
        fleet.missionTargetId = campaign.id;
        dispatched = fleet;
        break;
      }
      const order = orderFleetToSea(fleet, targetSeaId, regionsById, seaRegionsById, FLEET_MISSIONS.ESCORT);
      if (order.ordered) {
        fleet.missionTargetId = campaign.id;
        dispatched = fleet;
        break;
      }
    }
  }

  if (dispatched) {
    if (!(state.supportFleetIds || []).includes(dispatched.id)) state.supportFleetIds.push(dispatched.id);
    campaign.reliefState = {
      directive: danger >= 0.8 ? 'urgent_relief' : 'reinforce_supply_route',
      fleetId: dispatched.id,
      targetSeaId,
      danger,
      updatedTick: currentTick,
    };
    return campaign.reliefState;
  }

  const hopeless = state.status === 'starving' && routeReliability < 0.12 && foodWeeks < 0.75;
  const severe = state.status === 'severe_shortage' && routeReliability < 0.08 && foodWeeks < 1.25;
  campaign.reliefState = {
    directive: hopeless ? 'evacuate_if_possible' : severe ? 'prepare_evacuation' : 'relief_unavailable',
    danger,
    targetSeaId,
    updatedTick: currentTick,
  };
  return campaign.reliefState;
}
