import { ensureSubregionalControl, requiredGarrison } from './subregionalControl.js?v=20260908-subregion1';
import { routeBetween } from './subregionalMovement.js?v=20260908-movement1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function controlledPort(control, actor) {
  return control.places.find((node) => node.kind === 'port' && node.controllerActorId === actor) || null;
}

export function campaignSupplyCorridor(campaign, region) {
  const control = ensureSubregionalControl(region);
  const actor = campaign?.occupationActorId;
  const currentId = campaign?.subregional?.currentNodeId;
  const port = controlledPort(control, actor);
  if (!campaign?.viaSea || !actor || !port) {
    return { open: false, reliability: 0, portNodeId: port?.id || null, route: [], brokenNodeId: null, weakNodeId: null };
  }
  // Before the army has moved inland there is no internal line to cut: the port/beachhead is the supply head.
  if (!currentId || currentId === port.id) {
    return { open: true, reliability: 1, portNodeId: port.id, route: [port.id], brokenNodeId: null, weakNodeId: null };
  }
  const route = routeBetween(region, port.id, currentId).nodeIds;
  let reliability = 1;
  let brokenNodeId = null;
  let weakNodeId = null;
  for (const nodeId of route) {
    if (nodeId === currentId) continue; // field army physically secures its present location
    const node = control.places.find((item) => item.id === nodeId);
    if (!node || node.controllerActorId !== actor) {
      reliability *= 0.05;
      brokenNodeId ||= nodeId;
      continue;
    }
    if (node.id === port.id && node.controllerActorId === actor) continue;
    const need = requiredGarrison(region, node);
    const ratio = (node.garrisonActorId === actor ? node.garrisonPersonnel || 0 : 0) / Math.max(1, need);
    if (node.occupationMode === 'military' && ratio < 0.55) {
      reliability *= clamp(0.35 + ratio * 0.8, 0.35, 0.78);
      weakNodeId ||= node.id;
    }
  }
  return { open: reliability >= 0.25 && !brokenNodeId, reliability: clamp(reliability), portNodeId: port.id, route, brokenNodeId, weakNodeId };
}

export function garrisonCapturedNode(campaign, attacker, region, node, currentTick) {
  if (!campaign || !attacker || !node || node.controllerActorId !== campaign.occupationActorId) return { assigned: 0, required: 0 };
  const floor = clamp(attacker.militaryStrategy?.garrisonFloor ?? 0.65, 0.1, 1);
  const required = Math.max(10, Math.ceil(requiredGarrison(region, node) * Math.max(0.55, floor)));
  const reserve = Math.max(25, Math.ceil((campaign.initialPersonnel || campaign.personnel || 0) * 0.18));
  const available = Math.max(0, (campaign.personnel || 0) - reserve);
  const assigned = Math.min(required, available);
  if (assigned <= 0) return { assigned: 0, required };
  campaign.personnel -= assigned;
  campaign.garrisonedPersonnel = (campaign.garrisonedPersonnel || 0) + assigned;
  node.garrisonActorId = campaign.occupationActorId;
  node.garrisonPersonnel = (node.garrisonPersonnel || 0) + assigned;
  node.garrisonAssignedTick = currentTick;
  return { assigned, required };
}

export function supplyCorridorTarget(campaign, region) {
  const status = campaignSupplyCorridor(campaign, region);
  return status.brokenNodeId || status.weakNodeId || status.portNodeId || null;
}
