const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const AIR_MOBILITY_MODES = Object.freeze({
  AIR_ASSAULT: 'air_assault',
  RAPID_REDEPLOYMENT: 'rapid_redeployment',
});

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.polityId || region?.id || null;
}

export function helicopterLiftCapacity(helicopter) {
  if (!helicopter || helicopter.aircraftType !== 'helicopter' || helicopter.role !== 'transport_helicopter' || helicopter.status === 'destroyed') return 0;
  const stats = helicopter.designStats || {};
  const readiness = clamp((helicopter.condition ?? 1) * (.72 + (helicopter.pilotExperience || 0) * .18));
  // One helicopter object represents one aircraft/crew. Early machines move a small squad;
  // mature heavy transports can move roughly a platoon-sized package per tactical lift cycle.
  return Math.max(0, Math.floor((4 + (stats.troopLift || 0) * 24 + (stats.payload || 0) * 8) * readiness));
}

export function requestCampaignAirlift(origin, helicopter, campaign, targetRegion, {
  mode = AIR_MOBILITY_MODES.RAPID_REDEPLOYMENT,
  targetNodeId = null,
  currentTick = 0,
} = {}) {
  if (!origin || !helicopter || !campaign || !targetRegion) return { requested: false, reason: 'missing_context' };
  if (!Object.values(AIR_MOBILITY_MODES).includes(mode)) return { requested: false, reason: 'unknown_mode' };
  if (helicopter.aircraftType !== 'helicopter' || helicopter.role !== 'transport_helicopter' || helicopter.status === 'destroyed') {
    return { requested: false, reason: 'transport_helicopter_required' };
  }
  const owner = helicopter.ownerActorId || actorId(origin);
  if (campaign.occupationActorId && owner && campaign.occupationActorId !== owner) return { requested: false, reason: 'wrong_campaign_actor' };
  if (campaign.defenderId !== targetRegion.id) return { requested: false, reason: 'campaign_target_mismatch' };
  const capacity = helicopterLiftCapacity(helicopter);
  if (capacity <= 0) return { requested: false, reason: 'no_lift_capacity' };
  campaign.subregional ||= {};
  campaign.subregional.airMobilityOrders ||= [];
  const order = {
    id: `${campaign.id}:airlift:${helicopter.id}:${currentTick}`,
    helicopterId: helicopter.id,
    ownerActorId: owner,
    mode,
    targetNodeId,
    capacity,
    requestedTick: currentTick,
    status: 'awaiting_flight',
  };
  campaign.subregional.airMobilityOrders.push(order);
  helicopter.airMobilityOrderId = order.id;
  helicopter.mission = mode === AIR_MOBILITY_MODES.AIR_ASSAULT ? 'helicopter_air_assault' : 'helicopter_rapid_redeployment';
  helicopter.targetRegionId = targetRegion.id;
  helicopter.missionTargetNodeId = targetNodeId;
  helicopter.status = 'assigned';
  return { requested: true, order };
}

export function landingZoneResistance(region, campaign = null) {
  const army = Math.log1p(Math.max(0, region?.army?.personnel || 0)) / 13;
  const militia = Math.log1p(Math.max(0, region?.emergencyMilitiaPersonnel || 0)) / 13;
  const pressure = clamp(region?.conflictPressure || 0);
  const entrenchment = clamp(region?.modernLandWarfare?.entrenchment || region?.modernTactics?.entrenchment || 0);
  const airDefence = clamp(region?.airDefence?.readiness || region?.airDefence?.capability || 0);
  const campaignShock = campaign?.attackerMorale ? clamp(1 - campaign.attackerMorale) : 0;
  return clamp(.08 + army * .20 + militia * .10 + pressure * .22 + entrenchment * .20 + airDefence * .16 + campaignShock * .04);
}

function matchingEffect(region, order, currentTick) {
  const effect = region?.rotaryWingEffects;
  if (!effect || effect.tick == null) return null;
  // Campaigns resolve before aviation in a world tick, so consume the previous aviation pulse.
  if (effect.tick < order.requestedTick || currentTick - effect.tick > 2) return null;
  const strength = order.mode === AIR_MOBILITY_MODES.AIR_ASSAULT ? effect.troopLift : effect.rapidRedeployment;
  if (!(strength > 0)) return null;
  return { effect, strength: clamp(strength) };
}

export function consumeCampaignAirMobility(campaign, region, currentTick) {
  const state = campaign?.subregional;
  const orders = state?.airMobilityOrders || [];
  if (!orders.length) return { consumed: false, mobilityMultiplier: 1 };
  let mobilityMultiplier = 1;
  let consumed = false;
  for (const order of orders) {
    if (order.status !== 'awaiting_flight') continue;
    const match = matchingEffect(region, order, currentTick);
    if (!match) {
      if (currentTick - order.requestedTick > 3) order.status = 'expired';
      continue;
    }
    const opposition = landingZoneResistance(region, campaign);
    const deliveredFraction = clamp(.92 - opposition * .48 + match.strength * .12, .25, 1);
    const delivered = Math.max(0, Math.min(order.capacity, Math.floor(order.capacity * deliveredFraction)));
    const casualties = Math.max(0, Math.min(campaign.personnel || 0, order.capacity - delivered));
    if (casualties > 0) {
      campaign.personnel = Math.max(0, (campaign.personnel || 0) - casualties);
      campaign.attackerCasualties = (campaign.attackerCasualties || 0) + casualties;
      campaign.airAssaultCasualties = (campaign.airAssaultCasualties || 0) + casualties;
    }
    if (order.mode === AIR_MOBILITY_MODES.RAPID_REDEPLOYMENT) {
      const share = delivered / Math.max(1, campaign.personnel || delivered || 1);
      mobilityMultiplier = Math.max(mobilityMultiplier, 1 + clamp(.20 + match.strength * .55 + share * .55, 0, .95));
      state.lastRapidRedeployment = { tick: currentTick, personnel: delivered, helicopterId: order.helicopterId };
    } else if (order.targetNodeId && delivered > 0) {
      state.airMobileDetachment = {
        nodeId: order.targetNodeId,
        personnel: delivered,
        helicopterId: order.helicopterId,
        insertedTick: currentTick,
        opposition,
        status: 'landed',
      };
    }
    order.status = 'consumed';
    order.resolvedTick = currentTick;
    order.deliveredPersonnel = delivered;
    order.casualties = casualties;
    consumed = true;
  }
  state.airMobilityOrders = orders.filter(order => !['expired'].includes(order.status) || currentTick - (order.requestedTick || 0) <= 8);
  return { consumed, mobilityMultiplier, detachment: state.airMobileDetachment || null };
}

export function airAssaultOccupationCandidate(campaign, region, pressure = 0) {
  const detachment = campaign?.subregional?.airMobileDetachment;
  if (!detachment || detachment.status !== 'landed' || detachment.personnel <= 0) return null;
  const node = region?.subregionalControl?.places?.find?.(place => place.id === detachment.nodeId) ||
    region?.militaryControl?.places?.find?.(place => place.id === detachment.nodeId) || null;
  if (!node || node.controllerActorId === campaign.occupationActorId) return null;
  const forceShare = clamp(detachment.personnel / Math.max(1, campaign.personnel || detachment.personnel));
  const effectivePressure = clamp(pressure * (.52 + Math.sqrt(forceShare) * .70) * (1 - detachment.opposition * .18));
  return { node, detachment, effectivePressure, forceShare };
}

export function markAirAssaultOccupationResolved(campaign, captured = false, currentTick = null) {
  const detachment = campaign?.subregional?.airMobileDetachment;
  if (!detachment) return;
  detachment.status = captured ? 'lodgement_established' : 'holding_landing_zone';
  detachment.resolvedTick = currentTick;
}
