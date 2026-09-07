import { CHOKEPOINTS } from '../world/chokepoints.js?v=20260907-chokepoints1';
import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260905-projects1';
import { attitudeToward, changeAttitude, relationToward } from '../diplomacy/relations.js?v=20260904-save1';
import { tradeActorId } from './tradePolicy.js?v=20260905-policy1';

const MAX_TOLL_RATE = 0.20;
const MAX_TOTAL_ROUTE_TOLL_RATE = 0.30;
const CONTROL_ONSET = 0.28;
const CONTROL_MARGIN = 0.05;
const STRONG_CONTROL = 0.55;
const BLOCKADE_CONTROL = 0.78;
const EXPERIENCE_YEARS = 3;
const EXPERIENCE_DECAY_YEARS = 8;
const TOLL_MEMORY_HALF_LIFE_WEEKS = 156;
const ACCESS_MODES = new Set(['open', 'hostile', 'closed']);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

function ensureTransitState(region) {
  if (!region.transitControl || typeof region.transitControl !== 'object') region.transitControl = {};
  const state = region.transitControl;
  if (!state.chokepoints || typeof state.chokepoints !== 'object') state.chokepoints = {};
  if (!state.policies || typeof state.policies !== 'object') state.policies = {};
  if (!state.roadPolicy || typeof state.roadPolicy !== 'object') {
    state.roadPolicy = { rate: 0, alliesFree: true, exemptActorIds: [] };
  }
  if (!Number.isFinite(state.tollRevenueLifetime)) state.tollRevenueLifetime = 0;
  if (!Number.isFinite(state.tollRevenueThisTick)) state.tollRevenueThisTick = 0;
  return state;
}

function ensureChokepointPolicy(region, id) {
  const state = ensureTransitState(region);
  if (!state.policies[id]) state.policies[id] = {
    rate: 0, alliesFree: true, exemptActorIds: [], access: 'open',
  };
  if (!ACCESS_MODES.has(state.policies[id].access)) state.policies[id].access = 'open';
  return state.policies[id];
}

function haversineKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const toRad = (deg) => deg * Math.PI / 180;
  const [lon1, lat1] = a; const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(Math.max(0, 1 - aa)));
}

export function chokepointsNearRegion(region) {
  return Object.values(CHOKEPOINTS).filter((definition) => {
    if (!definition.controlCenter || !Number.isFinite(definition.controlRadiusKm)) return false;
    if (!(region.adjacentSeaIds || []).some((id) => definition.seas.includes(id))) return false;
    return haversineKm(region.centroid, definition.controlCenter) <= definition.controlRadiusKm;
  });
}

function infrastructureSignal(region) {
  return clamp01(
    effectiveInfrastructureCount(region, 'coastal_fortifications') * 0.36 +
    effectiveInfrastructureCount(region, 'naval_base') * 0.24 +
    effectiveInfrastructureCount(region, 'harbour') * 0.12 +
    effectiveInfrastructureCount(region, 'watchtowers') * 0.10 +
    effectiveInfrastructureCount(region, 'market_customs') * 0.06 +
    effectiveInfrastructureCount(region, 'settlement_walls') * 0.04
  );
}

function fleetSignal(region) {
  const boats = Math.max(0, region.navy?.boats || 0);
  const advanced = Math.max(0, region.navy?.advancedBoats || 0);
  const personnel = Math.max(0, region.navy?.personnel || 0);
  const force = boats * 3 + advanced * 7 + personnel / 12;
  return clamp01(1 - Math.exp(-force / 45));
}

export function tickTransitControl(regions, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays / 365.2425);
  for (const region of regions) {
    const state = ensureTransitState(region);
    state.tollRevenueThisTick = 0;
    const near = new Set(chokepointsNearRegion(region).map((item) => item.id));
    for (const definition of Object.values(CHOKEPOINTS)) {
      const local = state.chokepoints[definition.id] || { experience: 0, potential: 0 };
      local.near = near.has(definition.id);
      if (local.near) {
        const infrastructure = infrastructureSignal(region);
        const fleet = fleetSignal(region);
        const active = clamp01(infrastructure * 0.52 + fleet * 0.68);
        const gain = 1 - Math.exp(-years / EXPERIENCE_YEARS);
        const decay = 1 - Math.exp(-years / EXPERIENCE_DECAY_YEARS);
        local.experience += (active - local.experience) * (active > local.experience ? gain : decay);
        local.infrastructure = infrastructure;
        local.fleet = fleet;
        local.potential = clamp01(infrastructure * 0.45 + fleet * 0.40 + local.experience * 0.15);
      } else {
        const decay = 1 - Math.exp(-years / EXPERIENCE_DECAY_YEARS);
        local.experience += (0 - local.experience) * decay;
        local.infrastructure = 0;
        local.fleet = 0;
        local.potential = local.experience * 0.12;
      }
      state.chokepoints[definition.id] = local;
    }
  }
}

export function chokepointControlSnapshot(id, regions = []) {
  const definition = CHOKEPOINTS[id];
  if (!definition) return null;
  const relevant = regions.filter((region) => chokepointsNearRegion(region).some((item) => item.id === id));
  const byActor = new Map();
  for (const region of relevant) {
    const actorId = tradeActorId(region);
    const local = ensureTransitState(region).chokepoints[id] || { potential: 0, experience: 0, fleet: 0, infrastructure: 0 };
    const entry = byActor.get(actorId) || {
      actorId, shoreRegions: 0, totalPotential: 0, maxPotential: 0,
      fleet: 0, infrastructure: 0, experience: 0, controllerRegionId: region.id,
    };
    entry.shoreRegions += 1;
    entry.totalPotential += local.potential || 0;
    entry.fleet += local.fleet || 0;
    entry.infrastructure += local.infrastructure || 0;
    entry.experience += local.experience || 0;
    if ((local.potential || 0) >= entry.maxPotential) {
      entry.maxPotential = local.potential || 0;
      entry.controllerRegionId = region.id;
    }
    byActor.set(actorId, entry);
  }
  const totalShore = Math.max(1, relevant.length);
  const contenders = [...byActor.values()].map((entry) => {
    const shoreShare = entry.shoreRegions / totalShore;
    const count = Math.max(1, entry.shoreRegions);
    entry.score = clamp01(
      shoreShare * 0.18 +
      (entry.infrastructure / count) * 0.30 +
      (entry.fleet / count) * 0.34 +
      (entry.experience / count) * 0.18
    );
    return entry;
  }).sort((a, b) => b.score - a.score);
  const leader = contenders[0] || null;
  const runnerUp = contenders[1] || null;
  const controlled = Boolean(leader && leader.score >= CONTROL_ONSET && (!runnerUp || leader.score - runnerUp.score >= CONTROL_MARGIN));
  return { id, label: definition.label, controlled, controller: controlled ? leader : null, contenders };
}

export function setChokepointTollPolicy(region, id, {
  rate = 0, alliesFree = true, exemptActorIds = [], access = 'open',
} = {}) {
  if (!CHOKEPOINTS[id]) return null;
  const policy = ensureChokepointPolicy(region, id);
  policy.rate = clamp(rate, 0, MAX_TOLL_RATE);
  policy.alliesFree = alliesFree !== false;
  policy.exemptActorIds = [...new Set((exemptActorIds || []).filter(Boolean))];
  policy.access = ACCESS_MODES.has(access) ? access : 'open';
  return policy;
}

export function setRoadTollPolicy(region, { rate = 0, alliesFree = true, exemptActorIds = [] } = {}) {
  const policy = ensureTransitState(region).roadPolicy;
  policy.rate = clamp(rate, 0, MAX_TOLL_RATE);
  policy.alliesFree = alliesFree !== false;
  policy.exemptActorIds = [...new Set((exemptActorIds || []).filter(Boolean))];
  return policy;
}

export function roadTollPolicy(region) { return ensureTransitState(region).roadPolicy; }
export function chokepointTollPolicy(region, id) { return ensureChokepointPolicy(region, id); }

function actorsAllied(actorA, actorB, agreements = [], regionsById = new Map()) {
  if (!actorA || !actorB || actorA === actorB) return true;
  return agreements.some((agreement) => {
    if (!agreement?.active || agreement.type !== 'military_support') return false;
    const a = regionsById.get(agreement.fromId); const b = regionsById.get(agreement.toId);
    if (!a || !b) return false;
    const left = tradeActorId(a); const right = tradeActorId(b);
    return (left === actorA && right === actorB) || (left === actorB && right === actorA);
  });
}

function policyExempts(policy, payerActor, controllerActor, agreements, regionsById) {
  if (!policy || payerActor === controllerActor) return true;
  if ((policy.exemptActorIds || []).includes(payerActor)) return true;
  return policy.alliesFree && actorsAllied(payerActor, controllerActor, agreements, regionsById);
}

function roadRateForTransit(origin, pathIds, regionsById, agreements) {
  const payerActor = tradeActorId(origin);
  let total = 0;
  const charges = [];
  for (const id of (pathIds || []).slice(1, -1)) {
    const region = regionsById.get(id);
    if (!region || !operationalInfrastructure(region, 'road_network')) continue;
    const controllerActor = tradeActorId(region);
    const policy = roadTollPolicy(region);
    if (policyExempts(policy, payerActor, controllerActor, agreements, regionsById)) continue;
    const enforcement = clamp01(0.35 + effectiveInfrastructureCount(region, 'market_customs') * 0.35 + effectiveInfrastructureCount(region, 'watchtowers') * 0.20);
    const rate = policy.rate * enforcement;
    if (rate <= 0) continue;
    charges.push({ kind: 'road', controllerRegionId: region.id, controllerActor, rate });
    total += rate;
  }
  return { rate: Math.min(MAX_TOTAL_ROUTE_TOLL_RATE, total), charges, reliabilityMultiplier: 1, blocked: false };
}

function seaRateForTransit(origin, passageIds, regions, regionsById, agreements) {
  const payerActor = tradeActorId(origin);
  let total = 0;
  let reliabilityMultiplier = 1;
  let blocked = false;
  const charges = [];
  for (const passageId of passageIds || []) {
    const snapshot = chokepointControlSnapshot(passageId, regions);
    const controller = snapshot?.controller;
    if (!snapshot?.controlled || !controller) continue;
    const controllerRegion = regionsById.get(controller.controllerRegionId);
    if (!controllerRegion) continue;
    const policy = chokepointTollPolicy(controllerRegion, passageId);
    const exempt = policyExempts(policy, payerActor, controller.actorId, agreements, regionsById);
    if (!exempt) {
      const enforcement = clamp01((controller.score - CONTROL_ONSET) / (1 - CONTROL_ONSET) * 0.75 + 0.25);
      const rate = policy.rate * enforcement;
      if (rate > 0) {
        charges.push({ kind: 'chokepoint', passageId, controllerRegionId: controllerRegion.id, controllerActor: controller.actorId, rate });
        total += rate;
      }
      const hostile = attitudeToward(controllerRegion, origin.id) <= -0.5;
      const shouldInterdict = policy.access === 'closed' || (policy.access === 'hostile' && hostile);
      if (shouldInterdict && controller.score >= STRONG_CONTROL) {
        const interdiction = clamp01((controller.score - STRONG_CONTROL) / (1 - STRONG_CONTROL));
        reliabilityMultiplier *= Math.max(0.18, 1 - interdiction * 0.72);
        if (controller.score >= BLOCKADE_CONTROL && (policy.access === 'closed' || hostile)) blocked = true;
      }
    }
  }
  return {
    rate: Math.min(MAX_TOTAL_ROUTE_TOLL_RATE, total), charges,
    reliabilityMultiplier: clamp01(reliabilityMultiplier), blocked,
  };
}

export function estimateTransitToll(origin, route, regions, regionsById, agreements = []) {
  if (!route) return { rate: 0, charges: [], reliabilityMultiplier: 1, blocked: false };
  return route.mode === 'sea'
    ? seaRateForTransit(origin, route.passageIds || [], regions, regionsById, agreements)
    : roadRateForTransit(origin, route.pathIds || [], regionsById, agreements);
}

function recordTollFriction(payer, controller, effectiveRate, currentTick) {
  if (!payer || !controller || payer.id === controller.id || effectiveRate <= 0) return;
  const relation = relationToward(payer, controller.id);
  const memory = relation.transitTollMemory || { resentment: 0, lastTick: currentTick };
  const weeks = Number.isFinite(currentTick) && Number.isFinite(memory.lastTick)
    ? Math.max(0, currentTick - memory.lastTick) : 0;
  const retention = Math.pow(0.5, weeks / TOLL_MEMORY_HALF_LIFE_WEEKS);
  const decayed = (memory.resentment || 0) * retention;
  const target = Math.min(0.12, effectiveRate * 0.55);
  const next = Math.max(decayed, target);
  const delta = Math.max(0, next - decayed);
  if (delta > 0.0001) changeAttitude(payer, controller.id, -delta, 'transit_toll', currentTick);
  relation.transitTollMemory = { resentment: next, lastTick: currentTick };
}

export function collectTransitTolls(origin, transit, cargoValue, regionsById, currentTick = null) {
  if (!origin || !transit || cargoValue <= 0 || transit.rate <= 0) return 0;
  const intended = cargoValue * transit.rate;
  let remaining = Math.min(intended, Math.max(0, origin.wallet || 0));
  let paid = 0;
  for (const charge of transit.charges || []) {
    if (remaining <= 0) break;
    const controller = regionsById.get(charge.controllerRegionId);
    if (!controller) continue;
    const share = transit.rate > 0 ? charge.rate / transit.rate : 0;
    const amount = Math.min(remaining, intended * share);
    if (amount <= 0) continue;
    origin.wallet = Math.max(0, (origin.wallet || 0) - amount);
    controller.treasury = (controller.treasury || 0) + amount;
    const state = ensureTransitState(controller);
    state.tollRevenueThisTick += amount;
    state.tollRevenueLifetime += amount;
    recordTollFriction(origin, controller, charge.rate, currentTick);
    remaining -= amount;
    paid += amount;
  }
  return paid;
}

export function transitPolicySummary(region, regions = []) {
  const state = ensureTransitState(region);
  const nearby = chokepointsNearRegion(region).map((definition) => {
    const snapshot = chokepointControlSnapshot(definition.id, regions);
    const policy = chokepointTollPolicy(region, definition.id);
    const local = state.chokepoints[definition.id] || {};
    return { id: definition.id, label: definition.label, policy, local,
      control: snapshot?.controller?.controllerRegionId === region.id ? snapshot.controller.score : 0,
      controlledByUs: snapshot?.controller?.controllerRegionId === region.id };
  });
  return { roadPolicy: roadTollPolicy(region), nearby, tollRevenueThisTick: state.tollRevenueThisTick,
    tollRevenueLifetime: state.tollRevenueLifetime };
}
