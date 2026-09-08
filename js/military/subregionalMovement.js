import { ensureSubregionalControl, occupationSummary } from './subregionalControl.js?v=20260908-subregion1';
import { stanceBetween, WAR_STANCES, warForCampaign } from './warTheatres.js?v=20260908-war1';

export const SUBREGIONAL_OBJECTIVES = Object.freeze({
  port: { label: 'Seize a port', preferred: ['port', 'town', 'city', 'principal_settlement'] },
  capital: { label: 'Race for the principal settlement', preferred: ['city', 'principal_settlement', 'town'] },
  forts: { label: 'Reduce fortified positions', preferred: ['fort', 'city', 'town'] },
  countryside: { label: 'Secure the countryside', preferred: ['village_district', 'town', 'port'] },
  hold: { label: 'Hold current positions', preferred: [] },
  balanced: { label: 'Advance on strategic objectives', preferred: ['port', 'town', 'fort', 'city', 'principal_settlement', 'village_district'] },
});

const CAPTURE_PRESSURE = Object.freeze({ village_district: 0.10, port: 0.22, town: 0.34, fort: 0.55, principal_settlement: 0.68, city: 0.74 });
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function nodeDistance(a, b) {
  if (!a || !b || a.id === b.id) return 0;
  const pair = new Set([a.kind, b.kind]);
  if (pair.has('village_district')) return 1;
  if (pair.has('port')) return 1.15;
  if (pair.has('fort')) return 1.25;
  return 1.05;
}

export function ensureMovementGraph(region) {
  const control = ensureSubregionalControl(region);
  if (control.movementGraph?.version === 1 && control.movementGraph.nodeIds?.length === control.places.length) return control.movementGraph;
  const nodes = control.places;
  const edges = [];
  const principal = nodes.find((n) => ['city', 'principal_settlement'].includes(n.kind)) || nodes[0];
  for (const node of nodes) {
    if (!principal || node.id === principal.id) continue;
    edges.push({ from: principal.id, to: node.id, cost: nodeDistance(principal, node) });
  }
  const rural = nodes.filter((n) => n.kind === 'village_district');
  for (let i = 1; i < rural.length; i++) edges.push({ from: rural[i - 1].id, to: rural[i].id, cost: 0.8 });
  const port = nodes.find((n) => n.kind === 'port');
  const town = nodes.find((n) => n.kind === 'town');
  if (port && town) edges.push({ from: port.id, to: town.id, cost: 0.9 });
  control.movementGraph = { version: 1, nodeIds: nodes.map((n) => n.id), edges };
  return control.movementGraph;
}

function neighbours(graph, id) {
  const result = [];
  for (const edge of graph.edges || []) {
    if (edge.from === id) result.push({ id: edge.to, cost: edge.cost });
    else if (edge.to === id) result.push({ id: edge.from, cost: edge.cost });
  }
  return result;
}

export function routeBetween(region, fromId, toId) {
  const graph = ensureMovementGraph(region);
  if (!fromId || !toId || fromId === toId) return { nodeIds: fromId ? [fromId] : [], cost: 0 };
  const distance = new Map([[fromId, 0]]), previous = new Map(), pending = new Set(graph.nodeIds);
  while (pending.size) {
    let current = null, best = Infinity;
    for (const id of pending) { const d = distance.get(id) ?? Infinity; if (d < best) { best = d; current = id; } }
    if (!current || current === toId) break;
    pending.delete(current);
    for (const next of neighbours(graph, current)) {
      const alt = best + next.cost;
      if (alt < (distance.get(next.id) ?? Infinity)) { distance.set(next.id, alt); previous.set(next.id, current); }
    }
  }
  if (!distance.has(toId)) return { nodeIds: [fromId, toId], cost: 2 };
  const path = [toId];
  while (path[0] !== fromId) path.unshift(previous.get(path[0]));
  return { nodeIds: path, cost: distance.get(toId) };
}

export function chooseSubregionalObjective(region, actorId, policy = 'balanced') {
  const control = ensureSubregionalControl(region);
  if (policy === 'hold') return null;
  const preferred = SUBREGIONAL_OBJECTIVES[policy]?.preferred || SUBREGIONAL_OBJECTIVES.balanced.preferred;
  const hostile = control.places.filter((n) => n.controllerActorId !== actorId);
  for (const kind of preferred) {
    const candidates = hostile.filter((n) => n.kind === kind).sort((a, b) => b.strategicValue - a.strategicValue);
    if (candidates[0]) return candidates[0];
  }
  return hostile.sort((a, b) => b.strategicValue - a.strategicValue)[0] || null;
}

export function initialiseCampaignMovement(campaign, region, currentTick) {
  const control = ensureSubregionalControl(region);
  ensureMovementGraph(region);
  const actor = campaign.occupationActorId;
  const held = control.places.filter((n) => n.controllerActorId === actor);
  let start = held.find((n) => campaign.viaSea && n.kind === 'port') || held.find((n) => n.kind === 'village_district') || held[0];
  if (!start) start = control.places.find((n) => n.kind === 'port' && campaign.viaSea) || control.places.find((n) => n.kind === 'village_district') || control.places[0];
  campaign.subregional ||= {};
  campaign.subregional.currentNodeId = start?.id || null;
  campaign.subregional.objectivePolicy ||= campaign.viaSea ? 'port' : 'balanced';
  campaign.subregional.targetNodeId = null;
  campaign.subregional.route = [];
  campaign.subregional.routeIndex = 0;
  campaign.subregional.edgeProgress = 0;
  campaign.subregional.lastMoveTick = currentTick;
  campaign.subregional.previousNodeId = null;
  campaign.subregional.blockedByCampaignId = null;
  return campaign.subregional;
}

export function setCampaignSubregionalObjective(campaign, region, policy) {
  if (!SUBREGIONAL_OBJECTIVES[policy]) return false;
  campaign.subregional ||= {};
  campaign.subregional.objectivePolicy = policy;
  campaign.subregional.targetNodeId = null;
  campaign.subregional.route = [];
  campaign.subregional.routeIndex = 0;
  campaign.subregional.edgeProgress = 0;
  campaign.subregional.blockedByCampaignId = null;
  return true;
}

export function tickCampaignMovement(campaign, region, currentTick, mobility = 1) {
  const control = ensureSubregionalControl(region);
  if (!campaign.subregional?.currentNodeId) initialiseCampaignMovement(campaign, region, currentTick);
  const state = campaign.subregional;
  if (state.blockedByCampaignId) return { moved: false, blocked: true, state, summary: occupationSummary(region) };
  if (state.objectivePolicy === 'hold') return { moved: false, holding: true, state, summary: occupationSummary(region) };
  let target = control.places.find((n) => n.id === state.targetNodeId && n.controllerActorId !== campaign.occupationActorId);
  if (!target) {
    target = chooseSubregionalObjective(region, campaign.occupationActorId, state.objectivePolicy);
    state.targetNodeId = target?.id || null;
    const route = target ? routeBetween(region, state.currentNodeId, target.id) : { nodeIds: [state.currentNodeId], cost: 0 };
    state.route = route.nodeIds;
    state.routeIndex = 0;
    state.edgeProgress = 0;
  }
  if (!target) return { moved: false, complete: true, state, summary: occupationSummary(region) };
  const speed = clamp(0.7 + mobility * 0.65, 0.45, 1.6);
  let budget = speed;
  while (budget > 0 && state.routeIndex < state.route.length - 1) {
    const from = control.places.find((n) => n.id === state.route[state.routeIndex]);
    const to = control.places.find((n) => n.id === state.route[state.routeIndex + 1]);
    const cost = nodeDistance(from, to);
    const remaining = cost - state.edgeProgress;
    if (budget < remaining) { state.edgeProgress += budget; budget = 0; break; }
    budget -= remaining;
    state.routeIndex += 1;
    state.previousNodeId = from?.id || state.currentNodeId;
    state.currentNodeId = to.id;
    state.edgeProgress = 0;
  }
  state.lastMoveTick = currentTick;
  const arrived = state.currentNodeId === state.targetNodeId;
  return { moved: true, arrived, targetNodeId: state.targetNodeId, currentNodeId: state.currentNodeId, state, summary: occupationSummary(region) };
}

export function attemptPhysicalOccupation(campaign, region, currentTick, pressure = 0) {
  const control = ensureSubregionalControl(region);
  const node = control.places.find((n) => n.id === campaign.subregional?.currentNodeId);
  if (!node || node.controllerActorId === campaign.occupationActorId) return { captured: false, reason: 'already_controlled', node };
  const threshold = CAPTURE_PRESSURE[node.kind] ?? 0.45;
  if (pressure < threshold) return { captured: false, reason: 'insufficient_pressure', node, threshold };
  node.controllerActorId = campaign.occupationActorId;
  node.occupationMode = 'military';
  node.garrisonActorId = null;
  node.garrisonPersonnel = 0;
  node.capturedTick = currentTick;
  campaign.subregional.targetNodeId = null;
  campaign.subregional.route = [];
  campaign.subregional.routeIndex = 0;
  return { captured: true, node, summary: occupationSummary(region) };
}

export function campaignsAtSameNode(campaigns, defenderRegionId) {
  const groups = new Map();
  for (const campaign of campaigns) {
    if (campaign.completed || campaign.defenderId !== defenderRegionId || campaign.phase !== 'engaged') continue;
    const nodeId = campaign.subregional?.currentNodeId;
    if (!nodeId) continue;
    if (!groups.has(nodeId)) groups.set(nodeId, []);
    groups.get(nodeId).push(campaign);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1).map(([nodeId, group]) => ({ nodeId, campaigns: group }));
}

export function resolveCampaignNodeInteractions(campaigns, wars, defenderRegionId) {
  const events = [];
  for (const group of campaignsAtSameNode(campaigns, defenderRegionId)) {
    for (let i = 0; i < group.campaigns.length; i++) for (let j = i + 1; j < group.campaigns.length; j++) {
      const a = group.campaigns[i], b = group.campaigns[j];
      if (a.occupationActorId === b.occupationActorId) continue;
      const war = warForCampaign(wars || [], a) || warForCampaign(wars || [], b);
      const stanceAB = war ? stanceBetween(war, a.occupationActorId, b.occupationActorId) : WAR_STANCES.AVOID;
      const stanceBA = war ? stanceBetween(war, b.occupationActorId, a.occupationActorId) : WAR_STANCES.AVOID;
      const hostile = stanceAB === WAR_STANCES.HOSTILE || stanceBA === WAR_STANCES.HOSTILE;
      const avoid = !hostile && (stanceAB === WAR_STANCES.AVOID || stanceBA === WAR_STANCES.AVOID);
      if (hostile) {
        a.subregional.blockedByCampaignId = b.id;
        b.subregional.blockedByCampaignId = a.id;
        events.push({ type: 'subregional_armies_confront', nodeId: group.nodeId, campaignAId: a.id, campaignBId: b.id, actorAId: a.occupationActorId, actorBId: b.occupationActorId });
      } else if (avoid) {
        const yielding = Number(a.id) > Number(b.id) ? a : b;
        yielding.subregional.targetNodeId = null;
        yielding.subregional.route = [];
        events.push({ type: 'subregional_army_yields_route', nodeId: group.nodeId, yieldingCampaignId: yielding.id });
      } else {
        events.push({ type: 'subregional_armies_coordinate', nodeId: group.nodeId, campaignAId: a.id, campaignBId: b.id });
      }
    }
  }
  return events;
}

export function raceStatus(campaigns, defenderRegionId) {
  return campaigns.filter((c) => !c.completed && c.defenderId === defenderRegionId).map((campaign) => ({
    campaignId: campaign.id,
    actorId: campaign.occupationActorId,
    currentNodeId: campaign.subregional?.currentNodeId || null,
    targetNodeId: campaign.subregional?.targetNodeId || null,
    objectivePolicy: campaign.subregional?.objectivePolicy || null,
    blockedByCampaignId: campaign.subregional?.blockedByCampaignId || null,
    phase: campaign.phase,
  }));
}
