import { ensureCorporateCapitalState, corporateVentureCapacityMultiplier } from './corporateCapital.js?v=20260914-exploration1';
import { maritimeSkillLevel, recordMaritimePractice, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260914-exploration1';
import { provisioningPractice } from '../military/oceanicProvisioning.js?v=20260914-exploration1';
import { ensureRenaissanceState } from '../society/renaissanceNetworks.js?v=20260914-exploration1';
import { CHOKEPOINTS } from '../world/chokepoints.js?v=20260914-exploration1';

const WEEKS_PER_YEAR = 365.2425 / 7;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const polityIdFor = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id;
const seaGraphCache = new WeakMap();

function haversineKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const toRad = Math.PI / 180;
  const lat1 = a[1] * toRad, lat2 = b[1] * toRad;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function addEdge(graph, a, b, distanceKm, kind = 'open') {
  if (!a || !b || a === b) return;
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  const addOne = (from, to) => {
    const list = graph.get(from);
    const existing = list.find((edge) => edge.seaId === to);
    if (!existing) list.push({ seaId: to, distanceKm, kind });
    else if (distanceKm < existing.distanceKm) Object.assign(existing, { distanceKm, kind });
  };
  addOne(a, b);
  addOne(b, a);
}

export function buildExplorationSeaGraph(seaRegions = []) {
  if (seaGraphCache.has(seaRegions)) return seaGraphCache.get(seaRegions);
  const graph = new Map(seaRegions.map((sea) => [sea.id, []]));
  const byId = new Map(seaRegions.map((sea) => [sea.id, sea]));
  const byLand = new Map();
  for (const sea of seaRegions) {
    for (const landId of sea.adjacentLand || []) {
      if (!byLand.has(landId)) byLand.set(landId, []);
      byLand.get(landId).push(sea.id);
    }
  }

  // Sea basins that touch the same coastal simulation region are normally
  // physically contiguous. Keep the distance ceiling to avoid a huge region
  // spanning a peninsula accidentally bridging remote waters.
  for (const ids of byLand.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i]), b = byId.get(ids[j]);
        const distance = haversineKm(a?.centroid, b?.centroid);
        if (distance <= 850) addEdge(graph, ids[i], ids[j], distance, 'coastal');
      }
    }
  }

  // Preserve explicitly modelled straits even when a land polygon separates
  // the two sea centroids. This keeps political chokepoints meaningful.
  for (const chokepoint of Object.values(CHOKEPOINTS)) {
    const ids = (chokepoint.seas || []).filter((id) => byId.has(id));
    for (let i = 0; i < ids.length - 1; i++) {
      const a = byId.get(ids[i]), b = byId.get(ids[i + 1]);
      addEdge(graph, ids[i], ids[i + 1], haversineKm(a?.centroid, b?.centroid), 'chokepoint');
    }
  }

  // Ocean/island basins often share no land feature. Give only under-connected
  // seas a small number of nearest open-water links, so the graph stays sparse
  // and we do not build an all-to-all route table.
  for (const sea of seaRegions) {
    const existing = graph.get(sea.id) || [];
    if (existing.length >= 2) continue;
    const candidates = seaRegions
      .filter((other) => other.id !== sea.id && !(graph.get(sea.id) || []).some((edge) => edge.seaId === other.id))
      .map((other) => ({ other, distanceKm: haversineKm(sea.centroid, other.centroid) }))
      .filter((entry) => entry.distanceKm <= 1500)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2 - existing.length);
    for (const { other, distanceKm } of candidates) addEdge(graph, sea.id, other.id, distanceKm, 'open');
  }

  seaGraphCache.set(seaRegions, graph);
  return graph;
}

export function ensureOceanicExplorationState(region) {
  region.oceanicExploration ||= {};
  const state = region.oceanicExploration;
  state.seaKnowledge ||= {};
  state.routeKnowledge ||= {};
  state.knownCoastalRegions ||= {};
  state.successfulVoyages = Math.max(0, Number(state.successfulVoyages) || 0);
  state.failedVoyages = Math.max(0, Number(state.failedVoyages) || 0);
  state.explorationPrestige = clamp(state.explorationPrestige || 0);
  state.lastEvaluationTick = Number.isFinite(state.lastEvaluationTick) ? state.lastEvaluationTick : null;
  state.lastVoyageTick = Number.isFinite(state.lastVoyageTick) ? state.lastVoyageTick : null;
  for (const seaId of region.adjacentSeaIds || []) state.seaKnowledge[seaId] = Math.max(state.seaKnowledge[seaId] || 0, 1);
  return state;
}

function idleMaritimeCapacity(region, fleets = []) {
  const polityId = polityIdFor(region);
  const home = fleets.filter((fleet) => fleet.ownerActorId === polityId && fleet.ships?.length &&
    (fleet.locationType === 'port' || fleet.mission === 'port' || fleet.mission === 'return_refit'));
  const ships = home.reduce((sum, fleet) => sum + fleet.ships.length, 0);
  const advanced = home.reduce((sum, fleet) => sum + fleet.ships.filter((ship) => ship.designId === 'advanced_warship').length, 0);
  // Tests and old saves may not yet have persistent fleets; the regional navy
  // ledger remains a valid compatibility signal until reconcileFleetLedger runs.
  const ledgerShips = Math.max(0, Number(region.navy?.boats) || 0);
  const ledgerAdvanced = Math.max(0, Number(region.navy?.advancedBoats) || 0);
  return {
    ships: Math.max(ships, ledgerShips),
    advanced: Math.max(advanced, ledgerAdvanced),
  };
}

function explorationReadiness(region, fleets) {
  if (!(region.adjacentSeaIds || []).length) return { score: 0, rangeHops: 0, ships: 0, advancedShare: 0 };
  const capacity = idleMaritimeCapacity(region, fleets);
  if (capacity.ships <= 0) return { score: 0, rangeHops: 0, ships: 0, advancedShare: 0 };
  const skill = clamp(Math.max(
    maritimeSkillLevel(region, MARITIME_SKILLS.SCOUTING),
    maritimeSkillLevel(region, MARITIME_SKILLS.TRADE) * 0.82,
  ));
  const practice = provisioningPractice(region);
  const provisioning = clamp(practice.antiScurvyPractice * 0.55 + clamp(Math.log1p(practice.longVoyageExperience) / 8) * 0.45);
  const finance = ensureCorporateCapitalState(region);
  const ventureCapacity = clamp((corporateVentureCapacityMultiplier(region) - 0.75) / 1.75);
  const information = clamp(ensureRenaissanceState(region).printing.informationVelocity || 0);
  const advancedShare = clamp(capacity.advanced / Math.max(1, capacity.ships));
  const score = clamp(
    0.08 + skill * 0.33 + provisioning * 0.2 + advancedShare * 0.2 + ventureCapacity * 0.12 + information * 0.07,
  );
  // No era/date gate: experienced ancient mariners can explore locally, while
  // better ships, provisioning, finance and information systems extend range.
  const rangeHops = Math.max(1, Math.min(7, 1 + Math.floor(score * 4.2 + advancedShare * 1.8 + provisioning * 1.2)));
  return { score, rangeHops, ships: capacity.ships, advancedShare, skill, provisioning, finance, information };
}

function frontierRoutes(region, graph, readiness) {
  const state = ensureOceanicExplorationState(region);
  const known = new Set(Object.entries(state.seaKnowledge).filter(([, confidence]) => confidence >= 0.42).map(([id]) => id));
  for (const id of region.adjacentSeaIds || []) known.add(id);
  const starts = [...known];
  const queue = starts.map((seaId) => ({ seaId, path: [seaId], distanceKm: 0 }));
  const visited = new Set(starts);
  const frontier = [];
  while (queue.length) {
    const current = queue.shift();
    const hops = current.path.length - 1;
    if (hops >= readiness.rangeHops) continue;
    for (const edge of graph.get(current.seaId) || []) {
      const path = [...current.path, edge.seaId];
      const distanceKm = current.distanceKm + Math.max(1, edge.distanceKm || 1);
      if (!known.has(edge.seaId)) {
        frontier.push({ targetSeaId: edge.seaId, seaIds: path, hops: path.length - 1, distanceKm, kind: edge.kind });
        continue;
      }
      if (!visited.has(edge.seaId)) {
        visited.add(edge.seaId);
        queue.push({ seaId: edge.seaId, path, distanceKm });
      }
    }
  }
  const best = new Map();
  for (const route of frontier) {
    const existing = best.get(route.targetSeaId);
    if (!existing || route.distanceKm < existing.distanceKm) best.set(route.targetSeaId, route);
  }
  return [...best.values()];
}

function routeExposure(route, seaById) {
  if (!route?.seaIds?.length) return 0;
  let pressure = 0;
  for (const seaId of route.seaIds) {
    const sea = seaById.get(seaId);
    pressure += clamp(Math.log1p(Math.max(0, sea?.areaSqKm || 0)) / 14) * 0.18;
  }
  return clamp(pressure / route.seaIds.length + Math.max(0, route.hops - 1) * 0.08);
}

function voyageCost(region, route, readiness) {
  const scale = clamp(Math.log1p(Math.max(0, region.population || 0)) / 13, 0.25, 1);
  const gross = (1.8 + route.hops * 1.45 + route.distanceKm / 1100) * (0.65 + scale * 0.35);
  const financeRelief = 1 - clamp(readiness.finance.financialDepth * 0.18 + readiness.finance.partnershipPractice * 0.12, 0, 0.25);
  return Math.max(1, gross * financeRelief);
}

function canFund(region, cost) {
  return Math.max(0, Number(region.wallet) || 0) + Math.max(0, Number(region.treasury) || 0) * 0.35 >= cost * 1.4;
}

function payVoyage(region, cost) {
  const wallet = Math.max(0, Number(region.wallet) || 0);
  const merchantShare = Math.min(wallet, cost * 0.8);
  region.wallet = wallet - merchantShare;
  const remaining = cost - merchantShare;
  if (remaining > 0) region.treasury = Math.max(0, (Number(region.treasury) || 0) - remaining);
}

function chooseVoyage(region, routes, readiness, seaById) {
  const state = ensureOceanicExplorationState(region);
  const scored = [];
  for (const route of routes) {
    const confidence = clamp(state.seaKnowledge[route.targetSeaId] || 0);
    if (confidence >= 0.92) continue;
    const exposure = routeExposure(route, seaById);
    const priorReliability = clamp(state.routeKnowledge[route.targetSeaId]?.reliability || 0);
    const novelty = 1 - confidence;
    const score = novelty * 0.52 + priorReliability * 0.12 + readiness.score * 0.24 - exposure * 0.2 - route.hops * 0.018;
    scored.push({ ...route, score, exposure });
  }
  scored.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
  return scored[0] || null;
}

function revealCoasts(region, targetSea, regionsById, currentTick) {
  const state = ensureOceanicExplorationState(region);
  const discovered = [];
  for (const landId of targetSea?.adjacentLand || []) {
    if (landId === region.id || state.knownCoastalRegions[landId]) continue;
    state.knownCoastalRegions[landId] = { firstKnownTick: currentTick, confidence: 0.45 };
    discovered.push(landId);
  }
  return discovered.filter((id) => regionsById.has(id));
}

function resolveVoyage(region, route, readiness, seaById, regionsById, currentTick, rng) {
  const state = ensureOceanicExplorationState(region);
  const targetSea = seaById.get(route.targetSeaId);
  const prior = state.routeKnowledge[route.targetSeaId] || { reliability: 0, successes: 0, failures: 0 };
  const exposure = route.exposure ?? routeExposure(route, seaById);
  const successChance = clamp(
    0.42 + readiness.skill * 0.23 + readiness.provisioning * 0.18 + readiness.advancedShare * 0.15 +
    prior.reliability * 0.12 - exposure * 0.33 - Math.max(0, route.hops - 2) * 0.035,
    0.08, 0.96,
  );
  const roll = rng();
  const success = roll < successChance;
  const routeState = state.routeKnowledge[route.targetSeaId] = {
    seaIds: [...route.seaIds],
    distanceKm: route.distanceKm,
    reliability: prior.reliability || 0,
    successes: prior.successes || 0,
    failures: prior.failures || 0,
    lastVoyageTick: currentTick,
  };

  recordMaritimePractice(region, MARITIME_SKILLS.SCOUTING, Math.max(12, readiness.ships * 6) * Math.max(1, route.hops));
  state.lastVoyageTick = currentTick;
  if (success) {
    routeState.successes += 1;
    routeState.reliability = clamp(routeState.reliability * 0.72 + successChance * 0.28 + 0.08);
    state.seaKnowledge[route.targetSeaId] = clamp(Math.max(state.seaKnowledge[route.targetSeaId] || 0, 0.58) + 0.18);
    state.successfulVoyages += 1;
    state.explorationPrestige = clamp(state.explorationPrestige + 0.018 + route.hops * 0.006);
    const discoveredRegionIds = revealCoasts(region, targetSea, regionsById, currentTick);
    return {
      type: 'exploration_voyage_success', regionId: region.id, polityId: polityIdFor(region),
      targetSeaId: route.targetSeaId, seaIds: [...route.seaIds], distanceKm: route.distanceKm,
      successChance, routeReliability: routeState.reliability, discoveredRegionIds,
    };
  }

  routeState.failures += 1;
  routeState.reliability = clamp(routeState.reliability * 0.68 + successChance * 0.08);
  state.seaKnowledge[route.targetSeaId] = clamp(Math.max(state.seaKnowledge[route.targetSeaId] || 0, 0.08) + 0.06);
  state.failedVoyages += 1;
  const catastrophic = roll > 0.94 && route.hops >= 2 && (region.navy?.boats || 0) > 1;
  if (catastrophic) {
    region.navy.boats = Math.max(0, region.navy.boats - 1);
    if ((region.navy.advancedBoats || 0) > region.navy.boats) region.navy.advancedBoats = region.navy.boats;
  }
  return {
    type: catastrophic ? 'exploration_voyage_lost' : 'exploration_voyage_failed',
    regionId: region.id, polityId: polityIdFor(region), targetSeaId: route.targetSeaId,
    seaIds: [...route.seaIds], distanceKm: route.distanceKm, successChance,
    routeReliability: routeState.reliability, shipLost: catastrophic,
  };
}

function diffuseNavigationKnowledge(region, regionsById) {
  const state = ensureOceanicExplorationState(region);
  const renaissance = ensureRenaissanceState(region);
  const transfer = clamp(0.045 + (renaissance.printing.informationVelocity || 0) * 0.11);
  const linked = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) linked.add(id);
  if (region.recentTradePartners?.keys) for (const id of region.recentTradePartners.keys()) linked.add(id);
  for (const id of linked) {
    const other = regionsById.get(id);
    if (!other) continue;
    const source = ensureOceanicExplorationState(other);
    for (const [seaId, confidence] of Object.entries(source.seaKnowledge)) {
      if (confidence < 0.5) continue;
      state.seaKnowledge[seaId] = Math.max(state.seaKnowledge[seaId] || 0, clamp(confidence * transfer));
    }
    for (const [targetSeaId, route] of Object.entries(source.routeKnowledge)) {
      if ((route.reliability || 0) < 0.45) continue;
      const local = state.routeKnowledge[targetSeaId];
      const learned = clamp(route.reliability * transfer * 0.75);
      if (!local) state.routeKnowledge[targetSeaId] = {
        seaIds: [...(route.seaIds || [])], distanceKm: route.distanceKm || 0,
        reliability: learned, successes: 0, failures: 0, learnedFromRegionId: other.id,
        lastVoyageTick: null,
      };
      else local.reliability = Math.max(local.reliability || 0, learned);
    }
  }
}

export function tickOceanicExploration(regions = [], seaRegions = [], fleets = [], currentTick = 0, elapsedDays = 30, rng = Math.random, options = {}) {
  if (!regions.length || !seaRegions.length) return [];
  const graph = buildExplorationSeaGraph(seaRegions);
  const seaById = new Map(seaRegions.map((sea) => [sea.id, sea]));
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];

  for (const region of regions) {
    const state = ensureOceanicExplorationState(region);
    if (state.lastEvaluationTick == null) {
      state.lastEvaluationTick = currentTick;
      continue;
    }
    if (currentTick - state.lastEvaluationTick < WEEKS_PER_YEAR) continue;
    state.lastEvaluationTick = currentTick;
    diffuseNavigationKnowledge(region, regionsById);

    const readiness = explorationReadiness(region, fleets);
    if (readiness.score < 0.18 || readiness.ships <= 0) continue;
    const routes = frontierRoutes(region, graph, readiness);
    const route = chooseVoyage(region, routes, readiness, seaById);
    if (!route || route.score < 0.16) continue;
    const cost = voyageCost(region, route, readiness);
    if (!canFund(region, cost)) continue;

    // Boundedly rational actors do not launch every technically possible trip.
    // Stronger maritime institutions make experimentation more likely, while a
    // failed recent programme naturally slows repeat attempts through readiness.
    const launchChance = clamp(0.08 + readiness.score * 0.28 + state.explorationPrestige * 0.08 - state.failedVoyages * 0.002, 0.04, 0.42);
    if (rng() >= launchChance) continue;
    payVoyage(region, cost);
    const event = resolveVoyage(region, route, readiness, seaById, regionsById, currentTick, rng);
    event.cost = cost;
    events.push(event);
  }

  return events.filter((event) => !options.playerPolityId || event.polityId === options.playerPolityId || event.type === 'exploration_voyage_success');
}
