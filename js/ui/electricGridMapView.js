const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(value) || 0));
const nonNegative = (value) => Math.max(0, Number(value) || 0);

export function regionPolityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id || null;
}

export function uniqueElectricGridLinks(regions = []) {
  const links = new Map();
  for (const region of regions) {
    for (const link of region?.gridInterconnection?.links || []) {
      if (!link?.id) continue;
      const existing = links.get(link.id);
      if (!existing || (Number(link.updatedSequence) || 0) >= (Number(existing.updatedSequence) || 0)) links.set(link.id, link);
    }
  }
  return [...links.values()];
}

export function visibleElectricGridProjects(regions = []) {
  const projects = [];
  const seen = new Set();
  for (const region of regions) {
    for (const project of region?.gridInterconnection?.projects || []) {
      if (!project?.id || seen.has(project.id) || !['active'].includes(project.status)) continue;
      seen.add(project.id);
      projects.push(project);
    }
  }
  return projects;
}

export function electricGridConditionClass(link) {
  if (link?.status === 'disconnected') return 'disconnected';
  if (link?.status === 'damaged' || clamp(link?.condition ?? 1) <= 0.2) return 'offline';
  if (clamp(link?.condition ?? 1) < 0.75) return 'degraded';
  return 'operational';
}

export function electricGridEffectivePowerCapacity(link) {
  if (!link || electricGridConditionClass(link) === 'offline' || electricGridConditionClass(link) === 'disconnected') return 0;
  return nonNegative(link.powerCapacity) * clamp(link.condition ?? 1);
}

export function electricGridUtilisation(link) {
  const capacity = electricGridEffectivePowerCapacity(link);
  if (capacity <= 0) return 0;
  return clamp(nonNegative(link?.lastFlow?.sent) / capacity);
}

export function electricGridFlowDirection(link) {
  if (!link?.lastFlow || nonNegative(link.lastFlow.sent) <= 1e-9) return null;
  const from = link.lastFlow.fromRegionId;
  const to = link.lastFlow.toRegionId;
  if (!from || !to || from === to) return null;
  return { fromRegionId: from, toRegionId: to };
}

export function electricGridLinkDetail(link, regionsById = new Map()) {
  const from = regionsById.get(link?.fromRegionId);
  const to = regionsById.get(link?.toRegionId);
  const capacity = nonNegative(link?.powerCapacity);
  const effectiveCapacity = electricGridEffectivePowerCapacity(link);
  const flow = nonNegative(link?.lastFlow?.sent);
  const delivered = nonNegative(link?.lastFlow?.delivered);
  const condition = clamp(link?.condition ?? 1);
  const fromPolity = link?.fromPolityId || regionPolityId(from);
  const toPolity = link?.toPolityId || regionPolityId(to);
  const lastDamage = Array.isArray(link?.damageHistory) && link.damageHistory.length ? link.damageHistory[link.damageHistory.length - 1] : null;
  return {
    id: link?.id || null,
    fromRegionId: link?.fromRegionId || null,
    toRegionId: link?.toRegionId || null,
    fromName: from?.name || link?.fromRegionId || 'Unknown',
    toName: to?.name || link?.toRegionId || 'Unknown',
    ownerType: link?.ownerType || 'government',
    undersea: Boolean(link?.undersea),
    international: Boolean(fromPolity && toPolity && fromPolity !== toPolity),
    fromPolity,
    toPolity,
    status: link?.status || 'active',
    condition,
    conditionClass: electricGridConditionClass(link),
    powerCapacity: capacity,
    effectivePowerCapacity: effectiveCapacity,
    communicationsCapacity: nonNegative(link?.communicationsCapacity),
    flow,
    delivered,
    losses: nonNegative(link?.lastFlow?.losses),
    utilisation: electricGridUtilisation(link),
    flowDirection: electricGridFlowDirection(link),
    disconnectReason: link?.disconnectReason || null,
    unwantedPolityIds: Array.isArray(link?.unwantedPolityIds) ? [...link.unwantedPolityIds] : [],
    lastDamage,
  };
}

export function electricGridProjectDetail(project, regionsById = new Map()) {
  const from = regionsById.get(project?.fromRegionId);
  const to = regionsById.get(project?.toRegionId);
  const required = Math.max(1e-9, nonNegative(project?.workRequired));
  return {
    id: project?.id || null,
    fromRegionId: project?.fromRegionId || null,
    toRegionId: project?.toRegionId || null,
    fromName: from?.name || project?.fromRegionId || 'Unknown',
    toName: to?.name || project?.toRegionId || 'Unknown',
    ownerType: project?.ownerType || 'government',
    undersea: Boolean(project?.undersea),
    powerCapacity: nonNegative(project?.powerCapacity),
    communicationsCapacity: nonNegative(project?.communicationsCapacity),
    progress: clamp(nonNegative(project?.workDone) / required),
    status: project?.status || 'active',
  };
}

export function buildElectricGridMapIndex(regions = []) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const links = uniqueElectricGridLinks(regions)
    .filter((link) => regionsById.has(link.fromRegionId) && regionsById.has(link.toRegionId))
    .map((link) => ({ kind: 'link', raw: link, ...electricGridLinkDetail(link, regionsById) }));
  const projects = visibleElectricGridProjects(regions)
    .filter((project) => regionsById.has(project.fromRegionId) && regionsById.has(project.toRegionId))
    .map((project) => ({ kind: 'project', raw: project, ...electricGridProjectDetail(project, regionsById) }));
  return { regionsById, links, projects };
}

export function electricGridOverlaySummary(region) {
  const links = region?.gridInterconnection?.links || [];
  const unique = new Map(links.filter((link) => link?.id).map((link) => [link.id, link]));
  let active = 0;
  let powerCapacity = 0;
  let communicationsCapacity = 0;
  for (const link of unique.values()) {
    if (electricGridConditionClass(link) === 'operational' || electricGridConditionClass(link) === 'degraded') active += 1;
    powerCapacity += electricGridEffectivePowerCapacity(link);
    communicationsCapacity += nonNegative(link.communicationsCapacity) * clamp(link.condition ?? 1);
  }
  return { active, powerCapacity, communicationsCapacity };
}
