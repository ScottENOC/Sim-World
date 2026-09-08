import { ensureSubregionalControl, requiredGarrison } from './subregionalControl.js?v=20260908-subregion1';
import { campaignSupplyCorridor } from './supplyCorridors.js?v=20260908-corridor1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;

function weakestCorridorNode(campaign, defender) {
  const status = campaignSupplyCorridor(campaign, defender);
  if (!status.route?.length) return { status, node: null, garrisonRatio: 1 };
  const control = ensureSubregionalControl(defender);
  const attackerActor = campaign.occupationActorId;
  let best = null;
  for (const nodeId of status.route) {
    if (nodeId === campaign.subregional?.currentNodeId || nodeId === status.portNodeId) continue;
    const node = control.places.find((p) => p.id === nodeId);
    if (!node || node.controllerActorId !== attackerActor) continue;
    const need = requiredGarrison(defender, node);
    const held = node.garrisonActorId === attackerActor ? Math.max(0, node.garrisonPersonnel || 0) : 0;
    const ratio = held / Math.max(1, need);
    if (!best || ratio < best.garrisonRatio) best = { node, garrisonRatio: ratio };
  }
  return { status, node: best?.node || null, garrisonRatio: best?.garrisonRatio ?? 1 };
}

export function chooseDefensiveCounterLogistics(campaign, attacker, defender, currentTick, rng = Math.random) {
  if (!campaign?.viaSea || !campaign.logisticsState) return { directive: 'normal' };
  const state = campaign.logisticsState;
  const defenderActor = actorId(defender);
  const attackerActor = campaign.occupationActorId;
  const defenderArmy = Math.max(0, defender.army?.personnel || 0);
  const attackerArmy = Math.max(1, campaign.personnel || 1);
  const { status: corridor, node, garrisonRatio } = weakestCorridorNode(campaign, defender);
  const shortage = state.status === 'starving' ? 1 : state.status === 'severe_shortage' ? 0.72 : state.status === 'rationing' ? 0.4 : 0.1;

  campaign.defenderLogisticsDirective = 'contain';
  campaign.defenderAvoidBattle = shortage >= 0.72;

  // Prefer cutting a weak inland link rather than attacking the whole field army.
  if (node && defenderArmy > 20) {
    const localAdvantage = defenderArmy / Math.max(1, defenderArmy + attackerArmy);
    const weakness = clamp(1 - garrisonRatio);
    const chance = clamp(0.08 + localAdvantage * 0.42 + weakness * 0.38 + shortage * 0.12, 0.05, 0.78);
    if (rng() < chance) {
      node.controllerActorId = defenderActor;
      node.occupationMode = 'sovereign';
      node.garrisonActorId = null;
      node.garrisonPersonnel = 0;
      node.contested = true;
      node.capturedTick = currentTick;
      campaign.defenderLogisticsDirective = 'cut_corridor';
      campaign.lastCounterLogisticsAction = { type: 'corridor_cut', nodeId: node.id, tick: currentTick };
      return { directive: 'cut_corridor', success: true, nodeId: node.id, chance, corridor };
    }
    campaign.defenderLogisticsDirective = 'probe_corridor';
    return { directive: 'probe_corridor', success: false, nodeId: node.id, chance, corridor };
  }

  // If the invader is already living locally, target its dispersed foragers.
  const foragingShare = (state.localForagingCapacity || 0) / Math.max(1, state.weeklyRequirement || 1);
  if (foragingShare > 0.08 && defenderArmy > 0) {
    const rural = clamp(ensureSubregionalControl(defender).ruralControl?.[defenderActor] || 0);
    const harassmentAttrition = clamp(0.0005 + foragingShare * 0.004 + rural * 0.0015, 0, 0.006);
    campaign.defenderLogisticsDirective = 'harass_foragers';
    campaign.counterLogisticsAttritionRate = harassmentAttrition;
    return { directive: 'harass_foragers', harassmentAttrition, corridor };
  }

  // Deny stores only when an undersupplied enemy is plausibly going to seize them.
  const food = Math.max(0, defender.stockpile?.food || 0);
  if (shortage >= 0.4 && campaign.pressure >= 0.35 && food > (state.weeklyRequirement || 1) * 1.5) {
    const denied = Math.min(food * 0.06, (state.weeklyRequirement || 1) * (0.35 + shortage * 0.45));
    defender.stockpile.food = Math.max(0, food - denied);
    defender.stability = clamp((defender.stability ?? 0.7) - denied / Math.max(1, food) * 0.025);
    campaign.defenderLogisticsDirective = 'deny_stores';
    campaign.lastCounterLogisticsAction = { type: 'stores_denied', food: denied, tick: currentTick };
    return { directive: 'deny_stores', deniedFood: denied, corridor };
  }

  return { directive: campaign.defenderAvoidBattle ? 'contain_and_wait' : 'contain', corridor };
}

export function counterLogisticsCombatProfile(campaign) {
  const avoid = Boolean(campaign?.defenderAvoidBattle);
  return {
    intensityMultiplier: avoid ? 0.72 : 1,
    attackerPressureMultiplier: avoid ? 0.88 : 1,
    extraAttackerAttritionRate: Math.max(0, campaign?.counterLogisticsAttritionRate || 0),
  };
}
