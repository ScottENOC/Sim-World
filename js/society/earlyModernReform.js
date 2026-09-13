import { dominantReligion, ensureRegionReligion, ensureReligiousWorld, religionById } from './religion.js?v=20260914-reform1';
import { ensureRenaissanceState } from './renaissanceNetworks.js?v=20260914-reform1';
import { ensureMedievalCompletionState } from '../politics/medievalCompletion.js?v=20260914-reform1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const polityIdFor = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id;

function linkedRegionIds(region) {
  const out = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) out.add(id);
  if (region.recentTradePartners?.keys) for (const id of region.recentTradePartners.keys()) out.add(id);
  out.delete(region.id);
  return out;
}

function churchStrain(region) {
  const church = ensureMedievalCompletionState(region).church || {};
  const wealth = clamp(Math.log1p(Math.max(0, church.wealth || 0)) / 9);
  const hierarchy = clamp((church.bishopric || 0) * 0.55 + (church.landShare || church.landOwnership || 0) * 0.45);
  return clamp(wealth * 0.48 + hierarchy * 0.32 + (1 - (region.religion?.tolerance ?? 0.65)) * 0.2);
}

function educationLevel(region) {
  return clamp(Math.max(region.educationLevel || 0, region.medievalSociety?.education?.knowledgeCapacity || 0));
}

export function ensureReformState(region) {
  region.earlyModernReligion ||= {};
  const state = region.earlyModernReligion;
  state.dissentPressure ??= 0;
  state.vernacularTheology ??= 0;
  state.pamphletNetwork ??= 0;
  state.undergroundNetwork ??= 0;
  state.confessionalisation ??= 0;
  state.persecutionPressure ??= 0;
  state.tolerationSettlement ??= 0;
  state.reformReligionId ??= null;
  state.stateProtection ??= 0;
  state.lastMovementTick ??= null;
  state.lastPolicyShiftTick ??= null;
  return state;
}

function createSpontaneousVariant(region, world, parent, currentTick) {
  ensureReligiousWorld(world);
  const id = `religion_${world.nextReligionId++}`;
  const stem = String(parent.name || 'Faith').replace(/ Tradition| Reform| Communion/g, '').trim();
  const religion = {
    id,
    name: `${region.name} Reform`,
    parentId: parent.id,
    familyId: parent.familyId || parent.id,
    holyCityRegionId: region.id,
    adminCentreRegionId: null,
    foundedTick: currentTick,
    authority: 0.025,
    leader: null,
    active: true,
    spreadMode: 'missionary',
    monumentalPrestige: 0,
    reformOrigin: true,
    parentTraditionName: stem,
  };
  world.religions.push(religion);
  world._religionById = null;

  const religionState = ensureRegionReligion(region, world);
  const parentShare = religionState.shares[parent.id] || 0;
  const seed = Math.min(0.12, Math.max(0.025, parentShare * 0.12));
  religionState.shares[parent.id] = Math.max(0, parentShare - seed);
  religionState.shares[id] = (religionState.shares[id] || 0) + seed;
  religionState.unrest = clamp((religionState.unrest || 0) + 0.035);
  return religion;
}

function reformExposure(region, byId, world) {
  let exposure = 0;
  for (const id of linkedRegionIds(region)) {
    const other = byId.get(id);
    if (!other) continue;
    const otherState = ensureReformState(other);
    const reform = religionById(world, otherState.reformReligionId);
    if (!reform) continue;
    const localParent = dominantReligion(region, world);
    if (!localParent || reform.familyId !== localParent.familyId) continue;
    const share = other.religion?.shares?.[reform.id] || 0;
    const print = ensureRenaissanceState(other).printing;
    exposure = Math.max(exposure, share * (0.45 + (print.informationVelocity || 0) * 0.55));
  }
  return clamp(exposure);
}

function updateDissent(region, state, byId, world, years) {
  const renaissance = ensureRenaissanceState(region);
  const printing = renaissance.printing;
  const strain = churchStrain(region);
  const education = educationLevel(region);
  const exposure = reformExposure(region, byId, world);
  state.vernacularTheology += (clamp(
    printing.publicationFlow * 0.34 + printing.vernacularShare * 0.32 + education * 0.2 + exposure * 0.14
  ) - state.vernacularTheology) * clamp(years * 0.16);
  state.pamphletNetwork += (clamp(
    printing.informationVelocity * 0.32 + printing.publicationFlow * 0.34 + exposure * 0.26 - printing.censorship * 0.18
  ) - state.pamphletNetwork) * clamp(years * 0.18);
  const target = clamp(
    printing.religiousChallengePressure * 0.31 + state.vernacularTheology * 0.22 + state.pamphletNetwork * 0.18 +
    strain * 0.18 + exposure * 0.17 - state.tolerationSettlement * 0.12
  );
  state.dissentPressure += (target - state.dissentPressure) * clamp(years * 0.13);
}

function maybeCreateMovement(region, state, world, currentTick, years, rng, events) {
  if (state.reformReligionId && religionById(world, state.reformReligionId)) return;
  const parent = dominantReligion(region, world);
  if (!parent || (region.religion?.shares?.[parent.id] || 0) < 0.55) return;
  const printing = ensureRenaissanceState(region).printing;
  if (!printing.mechanicalPress || state.dissentPressure < 0.34 || state.vernacularTheology < 0.28) return;
  const chance = years * Math.max(0, state.dissentPressure - 0.28) * (0.025 + state.pamphletNetwork * 0.08);
  if (rng() >= chance) return;
  const reform = createSpontaneousVariant(region, world, parent, currentTick);
  state.reformReligionId = reform.id;
  state.lastMovementTick = currentTick;
  state.undergroundNetwork = Math.max(state.undergroundNetwork, 0.08);
  events.push({
    type: 'religious_reform_movement', regionId: region.id, polityId: polityIdFor(region),
    religionId: reform.id, parentReligionId: parent.id, name: reform.name,
  });
}

function updateConfessionalPolitics(region, state, world, currentTick, years, events) {
  const reform = religionById(world, state.reformReligionId);
  if (!reform) return;
  const religionState = ensureRegionReligion(region, world);
  const reformShare = clamp(religionState.shares[reform.id] || 0);
  const officialId = religionState.stateReligionId;
  const official = religionById(world, officialId);
  const centralisation = clamp(region.governance?.administrativeControl || 0);
  const tolerance = clamp(religionState.tolerance ?? 0.65);
  const treasuryStrength = clamp(Math.log1p(Math.max(0, region.treasury || 0)) / 9);
  const printing = ensureRenaissanceState(region).printing;

  let protectionTarget = 0;
  if (reformShare > 0.12) {
    protectionTarget = clamp(
      reformShare * 0.5 + state.dissentPressure * 0.2 + treasuryStrength * 0.08 +
      (official && official.id !== reform.id ? (1 - centralisation) * 0.12 : 0.18)
    );
  }
  state.stateProtection += (protectionTarget - state.stateProtection) * clamp(years * 0.1);

  const suppressionTarget = official && official.id !== reform.id
    ? clamp(centralisation * 0.32 + (1 - tolerance) * 0.34 + printing.censorship * 0.24 - state.stateProtection * 0.22)
    : 0;
  state.persecutionPressure += (suppressionTarget - state.persecutionPressure) * clamp(years * 0.12);

  const settlementTarget = clamp(tolerance * 0.48 + reformShare * (1 - reformShare) * 0.34 + (1 - centralisation) * 0.18);
  state.tolerationSettlement += (settlementTarget - state.tolerationSettlement) * clamp(years * 0.08);

  if (state.persecutionPressure > 0.22) {
    state.undergroundNetwork = clamp(state.undergroundNetwork + years * (state.pamphletNetwork * 0.022 + state.persecutionPressure * 0.015));
    religionState.unrest = clamp((religionState.unrest || 0) + years * reformShare * state.persecutionPressure * 0.025);
  } else {
    state.undergroundNetwork *= Math.pow(0.97, years);
  }

  // Protection lets a reform survive and organise before formal adoption.
  const growth = years * reformShare * (
    state.pamphletNetwork * 0.018 + state.stateProtection * 0.02 + state.undergroundNetwork * 0.008 - state.persecutionPressure * 0.014
  );
  if (growth > 0 && officialId !== reform.id) {
    const parentShare = religionState.shares[reform.parentId] || 0;
    const moved = Math.min(parentShare, growth);
    religionState.shares[reform.parentId] = parentShare - moved;
    religionState.shares[reform.id] = reformShare + moved;
  }

  const updatedShare = clamp(religionState.shares[reform.id] || 0);
  const adoptionPressure = clamp(updatedShare * 0.58 + state.stateProtection * 0.24 + state.dissentPressure * 0.12 - centralisation * 0.08);
  if (officialId !== reform.id && updatedShare >= 0.38 && adoptionPressure > 0.45) {
    religionState.stateReligionId = reform.id;
    state.confessionalisation = Math.max(state.confessionalisation, 0.2);
    state.lastPolicyShiftTick = currentTick;
    events.push({ type: 'state_adopts_reform', regionId: region.id, polityId: polityIdFor(region), religionId: reform.id });
  }

  const sameOfficial = religionState.stateReligionId === reform.id;
  const confessionTarget = sameOfficial
    ? clamp(updatedShare * 0.45 + centralisation * 0.26 + state.stateProtection * 0.18 + printing.informationVelocity * 0.11)
    : 0;
  state.confessionalisation += (confessionTarget - state.confessionalisation) * clamp(years * 0.08);
}

export function tickEarlyModernReform(regions, religiousWorld, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  if (!regions?.length || !religiousWorld) return [];
  religiousWorld.earlyModernReform ||= { elapsedDays: 0 };
  const clock = religiousWorld.earlyModernReform;
  clock.elapsedDays = Math.max(0, Number(clock.elapsedDays) || 0) + Math.max(0, Number(elapsedDays) || 0);
  if (clock.elapsedDays < DAYS_PER_YEAR) return [];
  const years = clock.elapsedDays / DAYS_PER_YEAR;
  clock.elapsedDays = 0;
  const byId = new Map(regions.map((region) => [region.id, region]));
  const events = [];

  for (const region of regions) updateDissent(region, ensureReformState(region), byId, religiousWorld, years);
  for (const region of regions) maybeCreateMovement(region, ensureReformState(region), religiousWorld, currentTick, years, rng, events);
  for (const region of regions) updateConfessionalPolitics(region, ensureReformState(region), religiousWorld, currentTick, years, events);

  return events.filter((event) => !options.playerPolityId || event.polityId === options.playerPolityId || event.type === 'religious_reform_movement');
}
