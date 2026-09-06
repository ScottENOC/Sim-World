import { elapsedYears } from '../core/simTime.js?v=20260905-time1';
import { startingCultureFor, START_YEAR } from './cultureSeeds.js?v=20260907-culture1';

const identities = new Map();
const CULTURE_TICK_YEARS = 1;
const BASE_ASSIMILATION_RATE = 0.012;
const MIN_GROUP_SHARE = 0.0005;
const FUSION_MIN_SHARE = 0.16;
const FUSION_MIN_COHABITATION_YEARS = 90;
const BRANCH_MIN_IDENTITY_AGE = 140;
const BRANCH_MIN_ISOLATION_YEARS = 100;
const POLITY_AFFILIATION_YEARS = 120;

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function normaliseAncestry(ancestry = {}) {
  const entries = Object.entries(ancestry).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return {};
  return Object.fromEntries(entries.map(([id, value]) => [id, value / total]));
}

function blendAncestry(a = {}, b = {}, weightA = 0.5) {
  const out = {};
  const wa = clamp01(weightA);
  for (const [id, value] of Object.entries(a)) out[id] = (out[id] || 0) + value * wa;
  for (const [id, value] of Object.entries(b)) out[id] = (out[id] || 0) + value * (1 - wa);
  return normaliseAncestry(out);
}

function registerIdentity(identity) {
  if (!identity?.id) return null;
  if (!identities.has(identity.id)) identities.set(identity.id, { ...identity });
  return identities.get(identity.id);
}

export function culturalIdentity(identityId) {
  return identities.get(identityId) || null;
}

export function cultureHistory() {
  return [...identities.values()].map((identity) => ({ ...identity }));
}

function seedIdentity(region) {
  const seed = startingCultureFor(region);
  return registerIdentity({
    id: seed.id,
    label: seed.label,
    familyId: seed.familyId,
    kind: seed.kind,
    confidence: seed.confidence,
    createdYear: START_YEAR,
    parentIds: [],
    parentWeights: {},
    originRegionId: region.id,
  });
}

export function initialiseRegionCulture(region) {
  if (!region) return null;
  const identity = seedIdentity(region);
  region.cultureGroups = [{
    identityId: identity.id,
    cultureId: identity.id, // backwards-compatible alias for older UI/save code
    ancestryId: identity.id,
    ancestry: { [identity.id]: 1 },
    affiliations: [],
    share: 1,
    identityStrength: 0.25,
    cohabitationYears: 0,
  }];
  region.cultureState = {
    elapsedYears: 0,
    tickAccumulatorYears: 0,
    isolationYears: 0,
    polityYears: 0,
    fusionIds: [],
    branchIds: [],
  };
  region.cultureFamiliarity = {};
  return region.cultureGroups;
}

function ensureRegionCulture(region) {
  if (!Array.isArray(region.cultureGroups) || region.cultureGroups.length === 0 || !region.cultureGroups[0].identityId) {
    initialiseRegionCulture(region);
  }
  if (!region.cultureState) region.cultureState = { elapsedYears: 0, tickAccumulatorYears: 0, isolationYears: 0, polityYears: 0, fusionIds: [], branchIds: [] };
  if (!region.cultureFamiliarity || typeof region.cultureFamiliarity !== 'object') region.cultureFamiliarity = {};
  for (const group of region.cultureGroups) {
    group.identityId ||= group.cultureId || group.ancestryId;
    group.cultureId = group.identityId;
    group.ancestry ||= group.ancestryId ? { [group.ancestryId]: 1 } : { [group.identityId]: 1 };
    group.ancestry = normaliseAncestry(group.ancestry);
    group.affiliations ||= [];
    group.identityStrength = clamp01(group.identityStrength ?? 0.25);
    group.cohabitationYears = Math.max(0, Number(group.cohabitationYears) || 0);
    if (!identities.has(group.identityId)) {
      registerIdentity({ id: group.identityId, label: group.identityId, familyId: 'unknown', kind: 'recovered', confidence: 0.2,
        createdYear: START_YEAR, parentIds: [], parentWeights: {}, originRegionId: region.id });
    }
  }
  normaliseGroups(region);
  return region.cultureGroups;
}

function normaliseGroups(region) {
  const groups = region.cultureGroups.filter((group) => group.share >= MIN_GROUP_SHARE);
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.share || 0), 0);
  if (total <= 0) return initialiseRegionCulture(region);
  for (const group of groups) group.share = Math.max(0, group.share || 0) / total;
  region.cultureGroups = groups;
  return groups;
}

function dominantGroup(region) {
  return ensureRegionCulture(region).slice().sort((a, b) => b.share - a.share)[0];
}

function ancestryOverlap(a = {}, b = {}) {
  let overlap = 0;
  for (const [id, weight] of Object.entries(a)) overlap += Math.min(weight, b[id] || 0);
  return clamp01(overlap);
}

function groupSimilarity(groupA, groupB) {
  if (!groupA || !groupB) return 0.15;
  if (groupA.identityId === groupB.identityId) return 1;
  const a = culturalIdentity(groupA.identityId);
  const b = culturalIdentity(groupB.identityId);
  const familyMatch = a?.familyId && b?.familyId && a.familyId === b.familyId && a.familyId !== 'mixed' ? 0.48 : 0.15;
  const ancestry = ancestryOverlap(groupA.ancestry, groupB.ancestry) * 0.28;
  const sharedAffiliation = groupA.affiliations?.some((id) => groupB.affiliations?.includes(id)) ? 0.12 : 0;
  return clamp01(familyMatch + ancestry + sharedAffiliation);
}

export function cultureAffinity(regionA, regionB) {
  if (!regionA || !regionB) return 0.5;
  const groupsA = ensureRegionCulture(regionA);
  const groupsB = ensureRegionCulture(regionB);
  let affinity = 0;
  for (const a of groupsA) for (const b of groupsB) affinity += a.share * b.share * groupSimilarity(a, b);
  return clamp01(affinity);
}

export function recordCulturalContact(regionA, regionB, weight = 1) {
  if (!regionA || !regionB) return;
  ensureRegionCulture(regionA);
  ensureRegionCulture(regionB);
  const gain = 0.015 * Math.max(0.2, Math.min(2, Number(weight) || 1));
  regionA.cultureFamiliarity[regionB.id] = clamp01((regionA.cultureFamiliarity[regionB.id] || 0) + gain);
  regionB.cultureFamiliarity[regionA.id] = clamp01((regionB.cultureFamiliarity[regionA.id] || 0) + gain * 0.8);
}

export function cultureTradeMultiplier(regionA, regionB) {
  const affinity = cultureAffinity(regionA, regionB);
  const familiarity = clamp01((regionA?.cultureFamiliarity?.[regionB?.id] || 0) + (regionB?.cultureFamiliarity?.[regionA?.id] || 0)) / 2;
  return Math.max(0.82, Math.min(1.08, 0.89 + affinity * 0.13 + familiarity * 0.08));
}

export function cultureDiplomaticBias(regionA, regionB) {
  const affinity = cultureAffinity(regionA, regionB);
  const familiarity = clamp01((regionA?.cultureFamiliarity?.[regionB?.id] || 0) + (regionB?.cultureFamiliarity?.[regionA?.id] || 0)) / 2;
  return Math.max(-0.08, Math.min(0.12, (affinity - 0.45) * 0.16 + familiarity * 0.035));
}

function chronologicalIdentityFloor(calendarYear) {
  // Tiny until the early-modern era, then rises smoothly. This is intentionally
  // only a floor/stand-in: mass education, media and state institutions below
  // are much more important than the date itself.
  if (calendarYear <= 1500) return 0;
  const t = clamp01((calendarYear - 1500) / 526);
  return 0.18 * t * t * t;
}

function institutionalisation(region) {
  const education = clamp01(region.educationLevel || 0);
  const archives = clamp01(region.education?.archiveLevel || 0);
  const state = clamp01((region.governance?.integration || 0) + (region.governance?.relationship === 'core' ? 0.15 : 0));
  const techs = region.unlockedTechIds instanceof Set ? region.unlockedTechIds : new Set(region.unlockedTechIds || []);
  const massSchooling = techs.has('mass_schooling') ? 0.25 : 0;
  const print = techs.has('printing_press') ? 0.12 : 0;
  const massMedia = techs.has('radio') || techs.has('television') ? 0.18 : 0;
  const internet = techs.has('internet') ? 0.12 : 0;
  return clamp01(education * 0.25 + archives * 0.18 + state * 0.12 + massSchooling + print + massMedia + internet);
}

export function assimilationResistance(region, group, calendarYear = START_YEAR) {
  const identity = culturalIdentity(group?.identityId);
  const age = Math.max(0, calendarYear - (identity?.createdYear ?? START_YEAR));
  const ageMemory = Math.min(0.12, age / 5000 * 0.12);
  const resistance = 0.07 + clamp01(group?.identityStrength ?? 0.25) * 0.25 +
    institutionalisation(region) * 0.48 + ageMemory + chronologicalIdentityFloor(calendarYear);
  return Math.max(0.05, Math.min(0.96, resistance));
}

function combineGroupAncestry(target, source, targetPopulationWeight, sourcePopulationWeight) {
  const total = targetPopulationWeight + sourcePopulationWeight;
  if (total <= 0) return target.ancestry;
  return blendAncestry(target.ancestry, source.ancestry, targetPopulationWeight / total);
}

function assimilate(region, years, calendarYear) {
  const groups = ensureRegionCulture(region).slice().sort((a, b) => b.share - a.share);
  const dominant = groups[0];
  if (!dominant || dominant.share < 0.5 || groups.length < 2) return;
  for (const minority of groups.slice(1)) {
    if (minority.share > 0.4) continue;
    const similarity = groupSimilarity(dominant, minority);
    const sharedInstitution = 0.55 + institutionalisation(region) * 0.45;
    const resistance = assimilationResistance(region, minority, calendarYear);
    const annual = BASE_ASSIMILATION_RATE * (0.65 + similarity * 0.6) * sharedInstitution * (1 - resistance);
    const moved = Math.min(minority.share, minority.share * (1 - Math.pow(1 - annual, years)));
    if (moved <= 0) continue;
    dominant.ancestry = combineGroupAncestry(dominant, minority, dominant.share, moved);
    dominant.share += moved;
    minority.share -= moved;
    dominant.identityStrength = clamp01(dominant.identityStrength + moved * 0.02);
  }
  normaliseGroups(region);
}

function maybeFusion(region, years, calendarYear) {
  const groups = ensureRegionCulture(region).slice().sort((a, b) => b.share - a.share);
  if (groups.length < 2) return;
  const [a, b] = groups;
  a.cohabitationYears += years;
  b.cohabitationYears += years;
  if (a.share < FUSION_MIN_SHARE || b.share < FUSION_MIN_SHARE) return;
  if (Math.min(a.cohabitationYears, b.cohabitationYears) < FUSION_MIN_COHABITATION_YEARS) return;
  const keyParents = [a.identityId, b.identityId].sort();
  const existing = ensureRegionCulture(region).find((g) => {
    const id = culturalIdentity(g.identityId);
    return id?.kind === 'fusion' && keyParents.every((parent) => id.parentIds?.includes(parent));
  });
  if (existing) return;
  const chance = 0.025 * years * (0.6 + institutionalisation(region) * 0.4);
  if (hash01(`${region.id}:fusion:${Math.floor(calendarYear / 10)}:${keyParents.join('|')}`) > chance) return;
  const id = `fusion_${region.id}_${Math.round(calendarYear)}_${keyParents.map((x) => x.slice(0, 8)).join('_')}`;
  const identityA = culturalIdentity(a.identityId);
  const identityB = culturalIdentity(b.identityId);
  const familyId = identityA?.familyId === identityB?.familyId ? identityA.familyId : 'mixed';
  registerIdentity({
    id,
    label: `${region.name} blended identity`,
    familyId,
    kind: 'fusion', confidence: 1,
    createdYear: calendarYear,
    parentIds: keyParents,
    parentWeights: { [a.identityId]: a.share / (a.share + b.share), [b.identityId]: b.share / (a.share + b.share) },
    originRegionId: region.id,
  });
  const seedShare = Math.min(0.03, a.share * 0.02 + b.share * 0.02);
  const wa = a.share / (a.share + b.share);
  a.share -= seedShare * wa;
  b.share -= seedShare * (1 - wa);
  region.cultureGroups.push({
    identityId: id, cultureId: id, ancestryId: id,
    ancestry: blendAncestry(a.ancestry, b.ancestry, wa), affiliations: [],
    share: seedShare, identityStrength: 0.35, cohabitationYears: 0,
  });
  region.cultureState.fusionIds.push(id);
  normaliseGroups(region);
}

function maybeBranch(region, years, calendarYear, regionsById) {
  const group = dominantGroup(region);
  if (!group || group.share < 0.82) { region.cultureState.isolationYears = 0; return; }
  const identity = culturalIdentity(group.identityId);
  if (!identity || calendarYear - identity.createdYear < BRANCH_MIN_IDENTITY_AGE) return;
  const neighbours = (region.neighbors || []).map((id) => regionsById.get(id)).filter(Boolean);
  const sameIdentityNearby = neighbours.some((n) => dominantGroup(n)?.identityId === group.identityId);
  const avgFamiliarity = Object.values(region.cultureFamiliarity || {}).reduce((s, v) => s + v, 0) /
    Math.max(1, Object.keys(region.cultureFamiliarity || {}).length);
  if (sameIdentityNearby || avgFamiliarity > 0.35) region.cultureState.isolationYears = Math.max(0, region.cultureState.isolationYears - years * 2);
  else region.cultureState.isolationYears += years;
  if (region.cultureState.isolationYears < BRANCH_MIN_ISOLATION_YEARS) return;
  const chance = 0.008 * years;
  if (hash01(`${region.id}:branch:${Math.floor(calendarYear / 10)}:${group.identityId}`) > chance) return;
  const id = `branch_${region.id}_${Math.round(calendarYear)}_${group.identityId.slice(0, 10)}`;
  registerIdentity({ id, label: `${region.name} ${identity.label} branch`, familyId: identity.familyId,
    kind: 'branch', confidence: 1, createdYear: calendarYear, parentIds: [group.identityId],
    parentWeights: { [group.identityId]: 1 }, originRegionId: region.id });
  group.identityId = id;
  group.cultureId = id;
  group.identityStrength = Math.max(0.25, group.identityStrength * 0.85);
  region.cultureState.branchIds.push(id);
  region.cultureState.isolationYears = 0;
}

function maybePolityAffiliation(region, years, calendarYear, regionsById) {
  const sovereignId = region.governance?.sovereignPolityId || region.controllingActorId;
  if (!sovereignId || sovereignId === region.id) { region.cultureState.polityYears = 0; return; }
  const members = [...regionsById.values()].filter((r) => (r.governance?.sovereignPolityId || r.controllingActorId) === sovereignId);
  if (members.length < 3) { region.cultureState.polityYears = 0; return; }
  region.cultureState.polityYears += years;
  if (region.cultureState.polityYears < POLITY_AFFILIATION_YEARS) return;
  const sovereign = regionsById.get(sovereignId);
  const id = `polity_identity_${sovereignId}`;
  if (!identities.has(id)) registerIdentity({ id, label: `${sovereign?.name || 'Polity'} common identity`, familyId: 'political',
    kind: 'superidentity', confidence: 1, createdYear: calendarYear, parentIds: [], parentWeights: {}, originRegionId: sovereignId });
  for (const group of ensureRegionCulture(region)) {
    if (!group.affiliations.includes(id)) group.affiliations.push(id);
  }
}

function strengthenIdentities(region, years, calendarYear) {
  const institutions = institutionalisation(region);
  for (const group of ensureRegionCulture(region)) {
    const pressure = 0.0006 + institutions * 0.0014 + chronologicalIdentityFloor(calendarYear) * 0.001;
    group.identityStrength = clamp01(group.identityStrength + pressure * years * (1 - group.identityStrength));
  }
}

function decayFamiliarity(region, years) {
  const retention = Math.pow(0.5, years / 35);
  for (const [id, value] of Object.entries(region.cultureFamiliarity || {})) {
    const next = value * retention;
    if (next < 0.01) delete region.cultureFamiliarity[id];
    else region.cultureFamiliarity[id] = next;
  }
}

export function migrateCulture(origin, destination, count) {
  if (!origin || !destination || count <= 0) return;
  const originGroups = ensureRegionCulture(origin);
  const destGroups = ensureRegionCulture(destination);
  const destPopulationBefore = Math.max(0, destination.population - count);
  const totalAfter = Math.max(1, destPopulationBefore + count);
  const migrantShareOfDestination = count / totalAfter;
  for (const group of destGroups) group.share *= 1 - migrantShareOfDestination;
  for (const source of originGroups) {
    const incomingShare = migrantShareOfDestination * source.share;
    let target = destGroups.find((group) => group.identityId === source.identityId &&
      JSON.stringify(group.affiliations || []) === JSON.stringify(source.affiliations || []));
    if (!target) {
      target = { identityId: source.identityId, cultureId: source.identityId, ancestryId: source.ancestryId || source.identityId,
        ancestry: { ...source.ancestry }, affiliations: [...(source.affiliations || [])], share: 0,
        identityStrength: source.identityStrength, cohabitationYears: 0 };
      destination.cultureGroups.push(target);
    }
    target.ancestry = combineGroupAncestry(target, source, target.share, incomingShare);
    target.share += incomingShare;
  }
  normaliseGroups(destination);
}

export function tickCulture(regions, elapsedDays = 7) {
  const deltaYears = elapsedYears(elapsedDays);
  if (deltaYears <= 0) return [];
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const region of regions) {
    ensureRegionCulture(region);
    region.cultureState.elapsedYears += deltaYears;
    region.cultureState.tickAccumulatorYears += deltaYears;
  }
  // Culture changes slowly: run the expensive graph/evolution pass annually,
  // irrespective of whether the simulation itself is ticking daily or monthly.
  const yearsReady = Math.floor(Math.min(...regions.map((r) => r.cultureState.tickAccumulatorYears)) / CULTURE_TICK_YEARS) * CULTURE_TICK_YEARS;
  if (yearsReady < CULTURE_TICK_YEARS) return events;
  const calendarYear = START_YEAR + Math.max(...regions.map((r) => r.cultureState.elapsedYears));
  for (const region of regions) {
    region.cultureState.tickAccumulatorYears -= yearsReady;
    decayFamiliarity(region, yearsReady);
    assimilate(region, yearsReady, calendarYear);
    maybeFusion(region, yearsReady, calendarYear);
    maybeBranch(region, yearsReady, calendarYear, regionsById);
    maybePolityAffiliation(region, yearsReady, calendarYear, regionsById);
    strengthenIdentities(region, yearsReady, calendarYear);
  }
  return events;
}

export function cultureSummary(region) {
  return ensureRegionCulture(region)
    .slice().sort((a, b) => b.share - a.share)
    .map((group) => ({
      identityId: group.identityId,
      label: culturalIdentity(group.identityId)?.label || group.identityId,
      share: group.share,
      ancestry: { ...group.ancestry },
      affiliations: [...(group.affiliations || [])],
      identityStrength: group.identityStrength,
    }));
}
