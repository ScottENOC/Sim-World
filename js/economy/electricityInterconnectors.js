const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const GRID_TECH_IDS = Object.freeze({
  TRANSMISSION: 'high_voltage_transmission',
  SUBSEA_POWER: 'submarine_power_cables',
});

export const CABLE_PROTECTION_POLICIES = Object.freeze({
  none: { riskMultiplier: 1, detectionBonus: 0 },
  notice_to_mariners: { riskMultiplier: 0.72, detectionBonus: 0.10 },
  patrols: { riskMultiplier: 0.46, detectionBonus: 0.30 },
  exclusion_zone: { riskMultiplier: 0.27, detectionBonus: 0.48 },
});

let nextProjectId = 1;
let nextLinkId = 1;
let nextIncidentId = 1;
const pendingElectricityRegions = new Map();

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id || null;
}

function localGridAvailable(region) {
  const completed = Number(region?.construction?.completed?.local_electric_grid) || 0;
  const assets = region?.construction?.assets || [];
  const assetCount = assets.filter((asset) => asset.typeId === 'local_electric_grid' && (Number(asset.condition) || 0) > 0.2).length;
  return completed > 0 || assetCount > 0;
}

function sharedSea(from, to) {
  const other = new Set(to?.adjacentSeaIds || []);
  return (from?.adjacentSeaIds || []).some((id) => other.has(id));
}

function isLandAdjacent(from, to) {
  return (from?.neighbors || []).includes(to?.id) || (to?.neighbors || []).includes(from?.id);
}

export function ensureGridInterconnectionState(region) {
  region.gridInterconnection ||= {
    projects: [],
    links: [],
    incidents: [],
    policy: {
      allowForeignConnections: true,
      avoidIndirectPolityIds: [],
      blockedPolityIds: [],
      protectionPolicy: 'notice_to_mariners',
      maxForeignNetworkPolities: 12,
    },
  };
  const state = region.gridInterconnection;
  state.projects ||= [];
  state.links ||= [];
  state.incidents ||= [];
  state.policy ||= {};
  if (!Array.isArray(state.policy.avoidIndirectPolityIds)) state.policy.avoidIndirectPolityIds = [];
  if (!Array.isArray(state.policy.blockedPolityIds)) state.policy.blockedPolityIds = [];
  if (!CABLE_PROTECTION_POLICIES[state.policy.protectionPolicy]) state.policy.protectionPolicy = 'notice_to_mariners';
  if (state.policy.allowForeignConnections === undefined) state.policy.allowForeignConnections = true;
  if (!Number.isFinite(state.policy.maxForeignNetworkPolities)) state.policy.maxForeignNetworkPolities = 12;
  return state;
}

export function setGridConnectionPolicy(region, patch = {}) {
  const policy = ensureGridInterconnectionState(region).policy;
  if (patch.allowForeignConnections !== undefined) policy.allowForeignConnections = Boolean(patch.allowForeignConnections);
  if (patch.avoidIndirectPolityIds) policy.avoidIndirectPolityIds = [...new Set(patch.avoidIndirectPolityIds.filter(Boolean))];
  if (patch.blockedPolityIds) policy.blockedPolityIds = [...new Set(patch.blockedPolityIds.filter(Boolean))];
  if (CABLE_PROTECTION_POLICIES[patch.protectionPolicy]) policy.protectionPolicy = patch.protectionPolicy;
  if (Number.isFinite(patch.maxForeignNetworkPolities)) policy.maxForeignNetworkPolities = Math.max(0, Math.round(patch.maxForeignNetworkPolities));
  return { ...policy, avoidIndirectPolityIds: [...policy.avoidIndirectPolityIds], blockedPolityIds: [...policy.blockedPolityIds] };
}

export function setSubseaCableProtectionPolicy(region, policyId) {
  if (!CABLE_PROTECTION_POLICIES[policyId]) return false;
  ensureGridInterconnectionState(region).policy.protectionPolicy = policyId;
  return true;
}

function gatherLinks(regions) {
  const links = new Map();
  for (const region of regions) {
    for (const link of ensureGridInterconnectionState(region).links) {
      const existing = links.get(link.id);
      if (!existing || (Number(link.updatedSequence) || 0) > (Number(existing.updatedSequence) || 0)) links.set(link.id, link);
    }
  }
  return [...links.values()];
}

function syncLink(regionsById, link) {
  for (const regionId of [link.fromRegionId, link.toRegionId]) {
    const region = regionsById.get(regionId);
    if (!region) continue;
    const links = ensureGridInterconnectionState(region).links;
    const index = links.findIndex((item) => item.id === link.id);
    const copy = { ...link, permissions: { ...(link.permissions || {}) }, lastFlow: { ...(link.lastFlow || {}) } };
    if (index >= 0) links[index] = copy;
    else links.push(copy);
  }
}

function activeForPower(link) {
  return link.status === 'active' && nonNegative(link.powerCapacity) > 0 && clamp(link.condition ?? 1) > 0.2;
}

function activeForCommunications(link) {
  return link.status === 'active' && nonNegative(link.communicationsCapacity) > 0 && clamp(link.condition ?? 1) > 0.2;
}

function networkPolitiesFromRegion(startRegionId, regionsById, links, ignoredLinkId = null) {
  const adjacency = new Map();
  for (const link of links) {
    if (link.id === ignoredLinkId || link.status !== 'active' || clamp(link.condition ?? 1) <= 0.2) continue;
    const a = adjacency.get(link.fromRegionId) || [];
    const b = adjacency.get(link.toRegionId) || [];
    a.push(link.toRegionId); b.push(link.fromRegionId);
    adjacency.set(link.fromRegionId, a); adjacency.set(link.toRegionId, b);
  }
  const seen = new Set([startRegionId]);
  const queue = [startRegionId];
  const polities = new Set();
  while (queue.length) {
    const id = queue.shift();
    const region = regionsById.get(id);
    if (region) polities.add(polityId(region));
    for (const next of adjacency.get(id) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  polities.delete(null);
  return polities;
}

export function gridConnectionAssessment(fromRegion, toRegion, regions = [], options = {}) {
  if (!fromRegion || !toRegion || fromRegion.id === toRegion.id) return { allowed: false, reason: 'invalid_endpoints', exposedPolityIds: [] };
  if (!localGridAvailable(fromRegion) || !localGridAvailable(toRegion)) return { allowed: false, reason: 'local_grid_required', exposedPolityIds: [] };
  const undersea = options.undersea ?? (!isLandAdjacent(fromRegion, toRegion) && sharedSea(fromRegion, toRegion));
  if (!isLandAdjacent(fromRegion, toRegion) && !undersea) return { allowed: false, reason: 'no_transmission_route', exposedPolityIds: [] };
  if (undersea && !sharedSea(fromRegion, toRegion)) return { allowed: false, reason: 'no_shared_sea_route', exposedPolityIds: [] };
  if (!fromRegion.unlockedTechIds?.has?.(GRID_TECH_IDS.TRANSMISSION) || !toRegion.unlockedTechIds?.has?.(GRID_TECH_IDS.TRANSMISSION)) {
    return { allowed: false, reason: 'high_voltage_transmission_required', exposedPolityIds: [] };
  }
  if (undersea && (!fromRegion.unlockedTechIds?.has?.(GRID_TECH_IDS.SUBSEA_POWER) || !toRegion.unlockedTechIds?.has?.(GRID_TECH_IDS.SUBSEA_POWER))) {
    return { allowed: false, reason: 'submarine_power_cables_required', exposedPolityIds: [] };
  }

  const fromPolity = polityId(fromRegion), toPolity = polityId(toRegion);
  if (fromPolity === toPolity) return { allowed: true, reason: 'domestic_connection', exposedPolityIds: [fromPolity] };
  const policy = ensureGridInterconnectionState(toRegion).policy;
  if (!policy.allowForeignConnections) return { allowed: false, reason: 'foreign_connections_not_permitted', exposedPolityIds: [] };
  if (policy.blockedPolityIds.includes(fromPolity)) return { allowed: false, reason: 'requesting_polity_blocked', exposedPolityIds: [fromPolity] };

  const allRegions = regions.length ? regions : [fromRegion, toRegion];
  const byId = new Map(allRegions.map((region) => [region.id, region]));
  byId.set(fromRegion.id, fromRegion); byId.set(toRegion.id, toRegion);
  const links = gatherLinks([...byId.values()]);
  const exposed = networkPolitiesFromRegion(fromRegion.id, byId, links);
  exposed.add(fromPolity);
  const unwanted = [...exposed].filter((id) => policy.avoidIndirectPolityIds.includes(id) || policy.blockedPolityIds.includes(id));
  if (unwanted.length) return { allowed: false, reason: 'indirect_network_exposure', exposedPolityIds: [...exposed], unwantedPolityIds: unwanted };
  const foreignCount = [...exposed].filter((id) => id !== toPolity).length;
  if (foreignCount > policy.maxForeignNetworkPolities) return { allowed: false, reason: 'network_too_interconnected', exposedPolityIds: [...exposed] };
  return { allowed: true, reason: 'permission_granted', exposedPolityIds: [...exposed] };
}

function projectMaterials({ powerCapacity, communicationsCapacity, undersea }) {
  const power = Math.max(0, powerCapacity) / 1000;
  const comms = Math.max(0, communicationsCapacity) / 100;
  const marine = undersea ? 1.8 : 1;
  return {
    steel: (0.9 * power + 0.15 * comms) * marine,
    copper: (0.62 * power + 0.24 * comms) * marine,
    aluminium: (0.52 * power + 0.08 * comms) * marine,
    industrial_polymers: undersea ? 0.34 * power + 0.18 * comms : 0.04 * power,
    electronic_components: 0.025 * power + 0.08 * comms,
  };
}

function projectCost(project) {
  const marine = project.undersea ? 1.9 : 1;
  return marine * (8 + project.powerCapacity * 0.0022 + project.communicationsCapacity * 0.012);
}

export function proposeElectricityInterconnector(fromRegion, toRegion, regions = [], options = {}) {
  const undersea = options.undersea ?? (!isLandAdjacent(fromRegion, toRegion) && sharedSea(fromRegion, toRegion));
  const powerCapacity = Math.max(0, Number(options.powerCapacity ?? options.capacity ?? 2500) || 0);
  const communicationsCapacity = Math.max(0, Number(options.communicationsCapacity || 0) || 0);
  const assessment = gridConnectionAssessment(fromRegion, toRegion, regions, { undersea });
  const crossBorder = polityId(fromRegion) !== polityId(toRegion);
  const project = {
    id: `grid-project-${nextProjectId++}`,
    fromRegionId: fromRegion.id,
    toRegionId: toRegion.id,
    fromPolityId: polityId(fromRegion),
    toPolityId: polityId(toRegion),
    ownerType: options.ownerType === 'private' ? 'private' : 'government',
    undersea,
    powerCapacity,
    communicationsCapacity,
    status: assessment.allowed ? 'active' : crossBorder && !['local_grid_required','no_transmission_route','no_shared_sea_route','high_voltage_transmission_required','submarine_power_cables_required'].includes(assessment.reason) ? 'awaiting_permission' : 'blocked',
    permissionAssessment: assessment,
    workRequired: Math.max(80, (undersea ? 260 : 150) + powerCapacity * 0.018 + communicationsCapacity * 0.08),
    workDone: 0,
    materialsRequired: projectMaterials({ powerCapacity, communicationsCapacity, undersea }),
    materialsUsed: {},
    totalCost: 0,
    startedSequence: nextProjectId,
  };
  project.totalCost = projectCost(project);
  ensureGridInterconnectionState(fromRegion).projects.push(project);
  return project;
}

export function approveInterconnectorProject(region, projectId, approved = true) {
  const project = ensureGridInterconnectionState(region).projects.find((item) => item.id === projectId);
  if (!project || project.status !== 'awaiting_permission') return false;
  project.status = approved ? 'active' : 'rejected';
  project.permissionAssessment = { ...(project.permissionAssessment || {}), allowed: approved, reason: approved ? 'permission_granted_manually' : 'permission_rejected_manually' };
  return true;
}

function availablePrivateCapital(region) {
  const direct = nonNegative(region.corporateCapital?.investibleWealth) * 0.06;
  const firms = region.corporateCapital?.firms || [];
  return direct + firms.filter((f) => f.status === 'active' && f.sector === 'infrastructure').reduce((sum, f) => sum + nonNegative(f.capitalIndex) * 0.08, 0);
}

function spendPrivateCapital(region, amount) {
  let remaining = Math.max(0, amount);
  const firms = region.corporateCapital?.firms || [];
  for (const firm of firms.filter((f) => f.status === 'active' && f.sector === 'infrastructure')) {
    const take = Math.min(remaining, nonNegative(firm.capitalIndex) * 0.08);
    firm.capitalIndex = nonNegative(firm.capitalIndex) - take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0 && region.corporateCapital) {
    const take = Math.min(remaining, nonNegative(region.corporateCapital.investibleWealth) * 0.06);
    region.corporateCapital.investibleWealth = nonNegative(region.corporateCapital.investibleWealth) - take / 0.06;
    remaining -= take;
  }
  return Math.max(0, amount - remaining);
}

function advanceProjects(regions, elapsedDays) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return [];
  const byId = new Map(regions.map((r) => [r.id, r]));
  const completed = [];
  for (const origin of regions) {
    const state = ensureGridInterconnectionState(origin);
    for (const project of state.projects) {
      if (project.status !== 'active') continue;
      const target = byId.get(project.toRegionId);
      if (!target) { project.status = 'blocked'; project.stalledReason = 'target_region_missing'; continue; }
      const reassessment = gridConnectionAssessment(origin, target, regions, { undersea: project.undersea });
      if (polityId(origin) !== polityId(target) && !reassessment.allowed) {
        project.status = 'awaiting_permission'; project.permissionAssessment = reassessment; continue;
      }
      const remainingFraction = clamp(1 - project.workDone / project.workRequired);
      const desiredFraction = Math.min(remainingFraction, years * (project.undersea ? 0.48 : 0.75));
      let fraction = desiredFraction;
      origin.stockpile ||= {};
      for (const [resource, total] of Object.entries(project.materialsRequired)) {
        if (total <= 0) continue;
        const used = nonNegative(project.materialsUsed[resource]);
        const remainingMaterial = Math.max(0, total - used);
        fraction = Math.min(fraction, nonNegative(origin.stockpile[resource]) / Math.max(1e-9, total));
        if (remainingMaterial <= 0) continue;
      }
      const costRemaining = Math.max(0, project.totalCost - nonNegative(project.costPaid));
      const desiredCost = project.totalCost * fraction;
      const financeAvailable = project.ownerType === 'private' ? availablePrivateCapital(origin) : nonNegative(origin.treasury);
      if (desiredCost > 0) fraction *= clamp(financeAvailable / desiredCost);
      if (fraction <= 1e-8) { project.stalledReason = financeAvailable <= 0 ? 'finance_unavailable' : 'materials_unavailable'; continue; }
      const cost = Math.min(costRemaining, project.totalCost * fraction);
      const paid = project.ownerType === 'private' ? spendPrivateCapital(origin, cost) : Math.min(nonNegative(origin.treasury), cost);
      if (project.ownerType !== 'private') origin.treasury = nonNegative(origin.treasury) - paid;
      const paidScale = cost > 0 ? clamp(paid / cost) : 1;
      fraction *= paidScale;
      for (const [resource, total] of Object.entries(project.materialsRequired)) {
        const amount = Math.min(nonNegative(origin.stockpile[resource]), total * fraction);
        origin.stockpile[resource] = nonNegative(origin.stockpile[resource]) - amount;
        project.materialsUsed[resource] = nonNegative(project.materialsUsed[resource]) + amount;
      }
      project.costPaid = nonNegative(project.costPaid) + paid;
      project.workDone = Math.min(project.workRequired, project.workDone + project.workRequired * fraction);
      project.stalledReason = null;
      if (project.workDone < project.workRequired - 1e-6) continue;
      project.status = 'completed';
      const link = {
        id: `grid-link-${nextLinkId++}`,
        fromRegionId: origin.id,
        toRegionId: target.id,
        fromPolityId: polityId(origin),
        toPolityId: polityId(target),
        ownerType: project.ownerType,
        undersea: project.undersea,
        powerCapacity: project.powerCapacity,
        communicationsCapacity: project.communicationsCapacity,
        condition: 1,
        status: 'active',
        permissions: { [polityId(origin)]: true, [polityId(target)]: true },
        lastFlow: { fromRegionId: null, toRegionId: null, sent: 0, delivered: 0, losses: 0 },
        damageHistory: [],
        updatedSequence: nextLinkId,
      };
      syncLink(byId, link);
      completed.push(link);
    }
  }
  return completed;
}

function protectionForLink(link, byId) {
  const a = ensureGridInterconnectionState(byId.get(link.fromRegionId) || {}).policy?.protectionPolicy || 'none';
  const b = ensureGridInterconnectionState(byId.get(link.toRegionId) || {}).policy?.protectionPolicy || 'none';
  const pa = CABLE_PROTECTION_POLICIES[a] || CABLE_PROTECTION_POLICIES.none;
  const pb = CABLE_PROTECTION_POLICIES[b] || CABLE_PROTECTION_POLICIES.none;
  return {
    riskMultiplier: Math.min(pa.riskMultiplier, pb.riskMultiplier),
    detectionBonus: Math.max(pa.detectionBonus, pb.detectionBonus),
    policyIds: [a, b],
  };
}

function detectionChance(region, protection) {
  const navy = nonNegative(region?.navy?.boats) + nonNegative(region?.navy?.advancedBoats);
  const comms = clamp(region?.localCommunications?.militaryCoordination || 0);
  const coastalAwareness = clamp(navy / 20) * 0.22 + comms * 0.22;
  return clamp(0.14 + protection.detectionBonus + coastalAwareness);
}

function recordIncident(byId, link, incident) {
  for (const regionId of [link.fromRegionId, link.toRegionId]) {
    const state = ensureGridInterconnectionState(byId.get(regionId));
    state.incidents.push({ ...incident });
    if (state.incidents.length > 30) state.incidents.splice(0, state.incidents.length - 30);
  }
}

function damageLink(byId, link, amount, cause, details = {}) {
  const damage = clamp(amount, 0, 1);
  link.condition = clamp((link.condition ?? 1) - damage);
  link.updatedSequence = ++nextLinkId;
  if (link.condition <= 0.2) link.status = 'damaged';
  const event = {
    id: `cable-incident-${nextIncidentId++}`,
    type: 'subsea_cable_damage', cause,
    linkId: link.id,
    damage,
    condition: link.condition,
    observed: Boolean(details.observed),
    suspectedActorType: details.suspectedActorType || null,
    responseOptions: details.observed ? ['warn_ship', 'escort_away', 'detain_ship', 'repair_cable', 'ignore'] : ['repair_cable', 'increase_monitoring', 'ignore'],
    ...details,
  };
  link.damageHistory ||= [];
  link.damageHistory.push({ cause, damage, observed: event.observed });
  if (link.damageHistory.length > 20) link.damageHistory.shift();
  syncLink(byId, link);
  recordIncident(byId, link, event);
  return event;
}

export function damageElectricityInterconnector(regions, linkId, amount, cause = 'wartime_damage', details = {}) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const link = gatherLinks(regions).find((item) => item.id === linkId);
  return link ? damageLink(byId, link, amount, cause, details) : null;
}

export function repairElectricityInterconnector(regions, linkId, amount = 0.25) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const link = gatherLinks(regions).find((item) => item.id === linkId);
  if (!link) return null;
  const origin = byId.get(link.fromRegionId);
  const repair = clamp(amount, 0, 1 - clamp(link.condition ?? 1));
  if (repair <= 0) return link;
  const copperNeed = repair * (link.undersea ? 1.4 : 0.7);
  const steelNeed = repair * (link.undersea ? 1.0 : 0.55);
  if (nonNegative(origin?.stockpile?.copper) < copperNeed || nonNegative(origin?.stockpile?.steel) < steelNeed) return null;
  origin.stockpile.copper -= copperNeed;
  origin.stockpile.steel -= steelNeed;
  link.condition = clamp((link.condition ?? 1) + repair);
  if (link.condition > 0.2 && link.status === 'damaged') link.status = 'active';
  link.updatedSequence = ++nextLinkId;
  syncLink(byId, link);
  return link;
}

function tickCableDamage(regions, links, elapsedDays, rng) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return [];
  const byId = new Map(regions.map((r) => [r.id, r]));
  const events = [];
  for (const link of links) {
    if (!link.undersea || !['active', 'damaged'].includes(link.status)) continue;
    const a = byId.get(link.fromRegionId), b = byId.get(link.toRegionId);
    if (!a || !b) continue;
    const protection = protectionForLink(link, byId);
    const tradeSignal = clamp((nonNegative(a.tradeEconomy?.weeklyExports) + nonNegative(a.tradeEconomy?.weeklyImports) + nonNegative(b.tradeEconomy?.weeklyExports) + nonNegative(b.tradeEconomy?.weeklyImports)) / 240);
    const anchorChance = clamp(0.010 * (0.25 + tradeSignal * 0.75) * protection.riskMultiplier * years);
    if ((rng?.() ?? Math.random()) < anchorChance) {
      const defender = (rng?.() ?? Math.random()) < 0.5 ? a : b;
      const observed = (rng?.() ?? Math.random()) < detectionChance(defender, protection);
      events.push(damageLink(byId, link, 0.08 + (rng?.() ?? Math.random()) * 0.27, 'civilian_anchor_drag', {
        observed,
        observingRegionId: observed ? defender.id : null,
        suspectedActorType: observed ? 'civilian_ship' : null,
        accidentalLikely: true,
      }));
    }
    const conflict = Math.max(clamp(a.conflictPressure || 0), clamp(b.conflictPressure || 0), clamp(a.warDamage?.infrastructureDamage || 0), clamp(b.warDamage?.infrastructureDamage || 0));
    const warChance = clamp(0.16 * conflict * years);
    if ((rng?.() ?? Math.random()) < warChance) {
      const defender = conflict === clamp(a.conflictPressure || 0) ? a : b;
      const observed = (rng?.() ?? Math.random()) < detectionChance(defender, protection) * 0.75;
      events.push(damageLink(byId, link, 0.12 + (rng?.() ?? Math.random()) * 0.38, 'wartime_cable_damage', {
        observed,
        observingRegionId: observed ? defender.id : null,
        accidentalLikely: false,
      }));
    }
  }
  return events;
}

export function respondToCableIncident(region, incidentId, response) {
  const state = ensureGridInterconnectionState(region);
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident || incident.response) return false;
  if (!incident.responseOptions?.includes(response)) return false;
  incident.response = response;
  if (response === 'increase_monitoring' && state.policy.protectionPolicy === 'none') state.policy.protectionPolicy = 'notice_to_mariners';
  if (response === 'warn_ship' && state.policy.protectionPolicy === 'none') state.policy.protectionPolicy = 'notice_to_mariners';
  if (response === 'escort_away' && ['none','notice_to_mariners'].includes(state.policy.protectionPolicy)) state.policy.protectionPolicy = 'patrols';
  if (response === 'detain_ship') state.policy.protectionPolicy = 'exclusion_zone';
  return true;
}

export function disconnectElectricityInterconnector(regions, linkId, reason = 'policy_disconnect') {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const link = gatherLinks(regions).find((item) => item.id === linkId);
  if (!link) return false;
  link.status = 'disconnected';
  link.disconnectReason = reason;
  link.updatedSequence = ++nextLinkId;
  syncLink(byId, link);
  return true;
}

export function reconnectElectricityInterconnector(regions, linkId) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const link = gatherLinks(regions).find((item) => item.id === linkId);
  if (!link || clamp(link.condition ?? 1) <= 0.2) return false;
  const a = byId.get(link.fromRegionId), b = byId.get(link.toRegionId);
  if (!a || !b) return false;
  const ab = gridConnectionAssessment(a, b, regions, { undersea: link.undersea });
  const ba = gridConnectionAssessment(b, a, regions, { undersea: link.undersea });
  if (polityId(a) !== polityId(b) && (!ab.allowed || !ba.allowed)) return false;
  link.status = 'active'; delete link.disconnectReason;
  link.updatedSequence = ++nextLinkId;
  syncLink(byId, link);
  return true;
}

function reviewIndirectExposure(regions, links) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const disconnected = [];
  for (const link of links) {
    if (link.status !== 'active') continue;
    const endpoints = [[link.fromRegionId, link.toRegionId], [link.toRegionId, link.fromRegionId]];
    for (const [homeId, otherId] of endpoints) {
      const home = byId.get(homeId), other = byId.get(otherId);
      if (!home || !other || polityId(home) === polityId(other)) continue;
      const policy = ensureGridInterconnectionState(home).policy;
      const otherNetwork = networkPolitiesFromRegion(otherId, byId, links, link.id);
      otherNetwork.add(polityId(other));
      const unwanted = [...otherNetwork].filter((id) => policy.avoidIndirectPolityIds.includes(id) || policy.blockedPolityIds.includes(id));
      if (!unwanted.length) continue;
      link.status = 'disconnected';
      link.disconnectReason = 'indirect_grid_exposure';
      link.unwantedPolityIds = unwanted;
      link.updatedSequence = ++nextLinkId;
      syncLink(byId, link);
      disconnected.push(link);
      break;
    }
  }
  return disconnected;
}

function shortestPath(sourceId, targetId, links, residual) {
  const adjacency = new Map();
  for (const link of links.filter(activeForPower)) {
    if ((residual.get(link.id) || 0) <= 1e-9) continue;
    for (const [a, b] of [[link.fromRegionId, link.toRegionId], [link.toRegionId, link.fromRegionId]]) {
      const list = adjacency.get(a) || [];
      list.push({ next: b, link }); adjacency.set(a, list);
    }
  }
  const queue = [sourceId], prev = new Map([[sourceId, null]]);
  while (queue.length) {
    const id = queue.shift();
    if (id === targetId) break;
    for (const edge of adjacency.get(id) || []) {
      if (prev.has(edge.next)) continue;
      prev.set(edge.next, { id, edge }); queue.push(edge.next);
    }
  }
  if (!prev.has(targetId)) return null;
  const path = [];
  let cursor = targetId;
  while (cursor !== sourceId) {
    const p = prev.get(cursor); if (!p) return null;
    path.unshift(p.edge); cursor = p.id;
  }
  return path;
}

function pathEfficiency(path) {
  return path.reduce((value, edge) => value * (edge.link.undersea ? 0.965 : 0.985) * (0.94 + clamp(edge.link.condition ?? 1) * 0.06), 1);
}

function settlePowerFlows(regions, links) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  for (const region of regions) {
    const e = region.electricity;
    if (!e) continue;
    e.imports = 0; e.exports = 0; e.transit = 0; e.interconnectorLosses = 0;
  }
  const residual = new Map(links.map((link) => [link.id, nonNegative(link.powerCapacity) * clamp(link.condition ?? 1)]));
  const exporters = regions.filter((r) => nonNegative(r.electricity?.exportableSurplus) > 1e-9).sort((a,b) => nonNegative(b.electricity.exportableSurplus) - nonNegative(a.electricity.exportableSurplus));
  const importers = regions.filter((r) => nonNegative(r.electricity?.importNeed) > 1e-9).sort((a,b) => nonNegative(b.electricity.importNeed) - nonNegative(a.electricity.importNeed));
  for (const source of exporters) {
    let surplus = nonNegative(source.electricity.exportableSurplus);
    for (const target of importers) {
      if (surplus <= 1e-9) break;
      let need = nonNegative(target.electricity.importNeed);
      if (need <= 1e-9 || source.id === target.id) continue;
      const path = shortestPath(source.id, target.id, links, residual);
      if (!path?.length) continue;
      const efficiency = pathEfficiency(path);
      const pathCap = Math.min(...path.map((edge) => residual.get(edge.link.id) || 0));
      const sent = Math.min(surplus, pathCap, need / Math.max(0.01, efficiency));
      if (sent <= 1e-9) continue;
      const delivered = sent * efficiency;
      surplus -= sent; need -= delivered;
      source.electricity.exports += sent;
      target.electricity.imports += delivered;
      target.electricity.importNeed = Math.max(0, need);
      target.electricity.delivered = nonNegative(target.electricity.delivered) + delivered;
      const demand = Math.max(0, nonNegative(target.electricity.demand));
      target.electricity.service = demand > 0 ? clamp(target.electricity.delivered / demand) : 1;
      target.electricity.industrialService = clamp(target.electricity.service * (0.65 + clamp(target.electricity.reliability || 0) * 0.35));
      const losses = sent - delivered;
      target.electricity.interconnectorLosses += losses;
      for (let i = 0; i < path.length; i++) {
        const edge = path[i];
        residual.set(edge.link.id, Math.max(0, (residual.get(edge.link.id) || 0) - sent));
        edge.link.lastFlow = { fromRegionId: source.id, toRegionId: target.id, sent, delivered, losses };
        if (i < path.length - 1) byId.get(edge.next).electricity.transit += sent;
      }
    }
    source.electricity.exportableSurplus = Math.max(0, surplus);
  }
  for (const link of links) syncLink(byId, link);
}

export function communicationsCableConnectivity(region) {
  const links = ensureGridInterconnectionState(region).links.filter(activeForCommunications);
  const effectiveCapacity = links.reduce((sum, link) => sum + nonNegative(link.communicationsCapacity) * clamp(link.condition ?? 1), 0);
  return clamp(1 - Math.exp(-effectiveCapacity / 180));
}

export function registerElectricityRegion(region) {
  if (region?.id) pendingElectricityRegions.set(region.id, region);
}

export function flushElectricityInterconnectors(elapsedDays = 7, rng = Math.random) {
  if (!pendingElectricityRegions.size) return { regions: 0, links: 0, completedProjects: [], incidents: [], disconnected: [] };
  const regions = [...pendingElectricityRegions.values()];
  pendingElectricityRegions.clear();
  for (const region of regions) ensureGridInterconnectionState(region);
  const completedProjects = advanceProjects(regions, elapsedDays);
  let links = gatherLinks(regions);
  const disconnected = reviewIndirectExposure(regions, links);
  links = gatherLinks(regions);
  const incidents = tickCableDamage(regions, links, elapsedDays, rng);
  links = gatherLinks(regions);
  settlePowerFlows(regions, links);
  return { regions: regions.length, links: links.length, completedProjects, incidents, disconnected };
}

export function electricityInterconnectorSummary(region) {
  const state = ensureGridInterconnectionState(region);
  return {
    activeLinks: state.links.filter((link) => link.status === 'active').length,
    powerCapacity: state.links.filter(activeForPower).reduce((sum, link) => sum + nonNegative(link.powerCapacity) * clamp(link.condition ?? 1), 0),
    communicationsCapacity: state.links.filter(activeForCommunications).reduce((sum, link) => sum + nonNegative(link.communicationsCapacity) * clamp(link.condition ?? 1), 0),
    underseaLinks: state.links.filter((link) => link.undersea).length,
    pendingProjects: state.projects.filter((project) => ['active','awaiting_permission'].includes(project.status)).length,
    policy: { ...state.policy, avoidIndirectPolityIds: [...state.policy.avoidIndirectPolityIds], blockedPolityIds: [...state.policy.blockedPolityIds] },
  };
}
