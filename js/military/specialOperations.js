const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const has = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.polityId || region?.id || null;

export const SPECIAL_FORCES_TECH_ID = 'special_forces';
export const HELIBORNE_SPECIAL_OPERATIONS_TECH_ID = 'heliborne_special_operations';

export const SPECIAL_OPERATION_MISSIONS = Object.freeze({
  RECONNAISSANCE: 'special_reconnaissance',
  SABOTAGE: 'special_sabotage',
  VIP_CAPTURE: 'vip_capture',
  VIP_RESCUE: 'vip_rescue',
  STRATEGIC_SITE_RAID: 'strategic_site_raid',
});

export const SPECIAL_OPERATION_INSERTION = Object.freeze({
  LAND: 'land',
  HELICOPTER: 'helicopter',
  NAVAL_HELICOPTER: 'naval_helicopter',
});

function militaryProfessionalism(region) {
  const state = region?.militaryProfessionalisation || region?.professionalisation || {};
  const formations = region?.militaryFormations?.traditions || [];
  const formationReadiness = formations.length
    ? formations.reduce((sum, f) => sum + (Number(f.readiness) || 0), 0) / formations.length
    : 0;
  return clamp((state.institutionalExperience || state.institutional || 0) * .45 +
    (state.fieldExperience || state.field || 0) * .30 + formationReadiness * .25);
}

function communicationsCapability(region) {
  const c = region?.industrialPlants?.componentCapability || {};
  const radio = c.radio_navigation || c.electronics || 0;
  const telephone = region?.localCommunications?.telephoneService || region?.communications?.telephone || 0;
  return clamp(radio * .65 + telephone * .35);
}

function intelligenceCapability(region, target) {
  const direct = region?.specialOperationsIntel?.[target?.id];
  const counter = region?.counterIntelligence?.capability || region?.counterIntelligence?.readiness || 0;
  const recon = region?.airRecon?.[target?.id]?.confidence || 0;
  return clamp(.18 + (direct?.confidence || 0) * .34 + recon * .24 + counter * .24);
}

function targetSecurity(target) {
  const ci = target?.counterIntelligence?.capability || target?.counterIntelligence?.readiness || 0;
  const readiness = target?.militaryStrategy?.readiness || target?.militaryReadiness || 0;
  const army = Math.log1p(Math.max(0, target?.army?.personnel || 0)) / 12;
  const stability = clamp(target?.stability ?? .5);
  return clamp(.15 + ci * .34 + readiness * .18 + army * .18 + stability * .15);
}

function defaultVip(target) {
  const governor = target?.governance?.governor;
  if (governor?.id) return { id: governor.id, role: governor.type || 'governor', label: governor.name || governor.id };
  if (target?.governance?.localRulerId) return { id: target.governance.localRulerId, role: 'ruler', label: target.governance.localRulerId };
  return { id: `leadership:${target?.id || 'unknown'}`, role: 'senior_leadership', label: `${target?.name || 'Regional'} leadership` };
}

export function ensureSpecialForces(region) {
  region.specialForces ||= {
    version: 1,
    operators: 0,
    available: 0,
    training: 0,
    experience: 0,
    missionExperience: {},
    nextOperationId: 1,
    operations: [],
    captives: [],
    rescuedVips: [],
  };
  const state = region.specialForces;
  state.missionExperience ||= {};
  state.operations ||= [];
  state.captives ||= [];
  state.rescuedVips ||= [];
  state.operators = Math.max(0, Number(state.operators) || 0);
  state.available = Math.min(state.operators, Math.max(0, Number(state.available) || 0));
  state.training = clamp(state.training || 0);
  state.experience = clamp(state.experience || 0);
  state.nextOperationId = Math.max(1, Number(state.nextOperationId) || 1);
  return state;
}

export function specialForcesReadiness(region) {
  const state = ensureSpecialForces(region);
  const equipment = clamp((region?.industrialPlants?.componentCapability?.small_arms || 0) * .30 +
    (region?.industrialPlants?.componentCapability?.optics || 0) * .28 +
    communicationsCapability(region) * .22 + militaryProfessionalism(region) * .20);
  return clamp(state.training * .36 + state.experience * .28 + equipment * .26 + militaryProfessionalism(region) * .10);
}

export function canEstablishSpecialForces(region) {
  const army = Math.max(0, region?.army?.personnel || 0);
  const modernSignal = has(region, 'military_aviation') || has(region, 'modern_staff_work') || has(region, 'radio') || communicationsCapability(region) > .22;
  return army >= 120 && modernSignal && militaryProfessionalism(region) >= .18;
}

export function establishSpecialForces(region, { personnel = 24 } = {}) {
  if (!canEstablishSpecialForces(region)) return { established: false, reason: 'insufficient_professional_capability' };
  const state = ensureSpecialForces(region);
  const requested = Math.max(8, Math.floor(personnel));
  const transferable = Math.min(requested, Math.max(0, Math.floor((region.army?.personnel || 0) * .08)));
  if (transferable < 8) return { established: false, reason: 'insufficient_personnel' };
  region.army.personnel -= transferable;
  state.operators += transferable;
  state.available += transferable;
  state.training = Math.max(state.training, .28);
  region.unlockedTechIds?.add?.(SPECIAL_FORCES_TECH_ID);
  return { established: true, personnel: transferable, state };
}

export function tickSpecialForcesTraining(region, elapsedDays = 7) {
  const state = ensureSpecialForces(region);
  if (!state.operators) return state;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const professionalism = militaryProfessionalism(region);
  const comms = communicationsCapability(region);
  const cashNeed = state.operators * .018 * years;
  const cashPaid = Math.min(Math.max(0, region.treasury || 0), cashNeed);
  if (cashPaid > 0) region.treasury -= cashPaid;
  const funding = cashNeed > 0 ? cashPaid / cashNeed : 1;
  const target = clamp(.32 + professionalism * .36 + comms * .16 + funding * .16);
  state.training = clamp(state.training + (target - state.training) * (1 - Math.exp(-years / 1.8)));
  if (has(region, SPECIAL_FORCES_TECH_ID) && has(region, 'air_assault') && state.training > .42 && state.experience > .12) {
    region.unlockedTechIds?.add?.(HELIBORNE_SPECIAL_OPERATIONS_TECH_ID);
  }
  return state;
}

function helicopterInsertionQuality(origin, helicopter, fleet = null) {
  if (!helicopter || helicopter.aircraftType !== 'helicopter' || helicopter.status === 'destroyed') return 0;
  const stats = helicopter.designStats || {};
  const base = clamp((stats.troopLift || 0) * .28 + (stats.manoeuvrability || 0) * .24 +
    (stats.reliability || 0) * .20 + (stats.range || 0) * .12 + (stats.battlefieldPersistence || 0) * .16);
  if (!fleet) return base;
  const shipSupport = (fleet.ships || []).reduce((sum, ship) => sum + Math.max(0, Number(ship.rotaryWingCapacity) || 0), 0);
  return shipSupport > 0 ? clamp(base * .90 + Math.min(.10, shipSupport * .025)) : 0;
}

function insertionQuality(origin, insertion, helicopter, fleet) {
  if (insertion === SPECIAL_OPERATION_INSERTION.LAND) return clamp(.35 + militaryProfessionalism(origin) * .35 + communicationsCapability(origin) * .15);
  if (insertion === SPECIAL_OPERATION_INSERTION.HELICOPTER) return helicopterInsertionQuality(origin, helicopter);
  if (insertion === SPECIAL_OPERATION_INSERTION.NAVAL_HELICOPTER) return helicopterInsertionQuality(origin, helicopter, fleet);
  return 0;
}

export function specialOperationAssessment(origin, target, mission, { insertion = SPECIAL_OPERATION_INSERTION.LAND, helicopter = null, fleet = null, teamSize = 8 } = {}) {
  const state = ensureSpecialForces(origin);
  const readiness = specialForcesReadiness(origin);
  const intel = intelligenceCapability(origin, target);
  const security = targetSecurity(target);
  const insert = insertionQuality(origin, insertion, helicopter, fleet);
  const missionExperience = clamp(state.missionExperience?.[mission] || 0);
  const size = Math.max(4, Math.min(32, Math.floor(teamSize)));
  const overcrowding = clamp((size - 12) / 30);
  const complexity = ({
    [SPECIAL_OPERATION_MISSIONS.RECONNAISSANCE]: .16,
    [SPECIAL_OPERATION_MISSIONS.SABOTAGE]: .30,
    [SPECIAL_OPERATION_MISSIONS.VIP_CAPTURE]: .42,
    [SPECIAL_OPERATION_MISSIONS.VIP_RESCUE]: .46,
    [SPECIAL_OPERATION_MISSIONS.STRATEGIC_SITE_RAID]: .50,
  })[mission] ?? .35;
  const successChance = clamp(.18 + readiness * .32 + intel * .20 + insert * .20 + missionExperience * .12 - security * .26 - complexity * .18 - overcrowding * .08, .03, .92);
  const detectionChance = clamp(.48 + security * .34 + complexity * .18 - readiness * .22 - intel * .10 - insert * .08, .08, .96);
  return { successChance, detectionChance, readiness, intelligence: intel, targetSecurity: security, insertionQuality: insert, teamSize: size };
}

export function launchSpecialOperation(origin, target, mission, currentTick, options = {}) {
  const state = ensureSpecialForces(origin);
  if (!Object.values(SPECIAL_OPERATION_MISSIONS).includes(mission)) return { launched: false, reason: 'unknown_mission' };
  if (!has(origin, SPECIAL_FORCES_TECH_ID) && state.operators <= 0) return { launched: false, reason: 'special_forces_not_available' };
  const insertion = options.insertion || SPECIAL_OPERATION_INSERTION.LAND;
  if ([SPECIAL_OPERATION_INSERTION.HELICOPTER, SPECIAL_OPERATION_INSERTION.NAVAL_HELICOPTER].includes(insertion) && !has(origin, HELIBORNE_SPECIAL_OPERATIONS_TECH_ID)) {
    return { launched: false, reason: 'heliborne_special_operations_not_known' };
  }
  const assessment = specialOperationAssessment(origin, target, mission, options);
  if (assessment.insertionQuality <= 0) return { launched: false, reason: 'insertion_unavailable' };
  const teamSize = Math.min(state.available, assessment.teamSize);
  if (teamSize < Math.min(4, assessment.teamSize)) return { launched: false, reason: 'insufficient_available_operators' };
  state.available -= teamSize;
  const operation = {
    id: `specop-${origin.id || 'region'}-${state.nextOperationId++}`,
    mission,
    originRegionId: origin.id,
    targetRegionId: target.id,
    ownerActorId: actorId(origin),
    targetActorId: actorId(target),
    insertion,
    teamSize,
    helicopterId: options.helicopter?.id || options.helicopterId || null,
    fleetId: options.fleet?.id || options.fleetId || null,
    targetVip: options.targetVip || (mission === SPECIAL_OPERATION_MISSIONS.VIP_CAPTURE ? defaultVip(target) : null),
    strategicSiteId: options.strategicSiteId || null,
    launchedTick: currentTick,
    resolveTick: currentTick + Math.max(1, Number(options.durationWeeks) || (mission === SPECIAL_OPERATION_MISSIONS.RECONNAISSANCE ? 1 : 2)),
    status: 'active',
    assessment,
  };
  state.operations.push(operation);
  return { launched: true, operation };
}

function recordMissionExperience(state, mission, amount) {
  state.experience = clamp(state.experience + amount * (1 - state.experience));
  state.missionExperience[mission] = clamp((state.missionExperience[mission] || 0) + amount * (1 - (state.missionExperience[mission] || 0)));
}

function applySuccess(origin, target, op, currentTick) {
  const state = ensureSpecialForces(origin);
  if (op.mission === SPECIAL_OPERATION_MISSIONS.RECONNAISSANCE) {
    origin.specialOperationsIntel ||= {};
    origin.specialOperationsIntel[target.id] = { observedTick: currentTick, confidence: clamp(.55 + op.assessment.readiness * .22 + op.assessment.intelligence * .18) };
    return { effect: 'intelligence_collected' };
  }
  if (op.mission === SPECIAL_OPERATION_MISSIONS.SABOTAGE) {
    target.specialOperationsDisruption ||= { industrial: 0, communications: 0, lastTick: null };
    target.specialOperationsDisruption.industrial = clamp(target.specialOperationsDisruption.industrial + .10 + op.assessment.readiness * .12);
    target.specialOperationsDisruption.communications = clamp(target.specialOperationsDisruption.communications + .06 + op.assessment.intelligence * .08);
    target.specialOperationsDisruption.lastTick = currentTick;
    return { effect: 'limited_sabotage' };
  }
  if (op.mission === SPECIAL_OPERATION_MISSIONS.VIP_CAPTURE) {
    const vip = op.targetVip || defaultVip(target);
    state.captives.push({ ...vip, capturedFromRegionId: target.id, capturedTick: currentTick, operationId: op.id });
    target.governance ||= {};
    target.governance.vipStatus ||= {};
    target.governance.vipStatus[vip.id] = { status: 'captured', heldByActorId: op.ownerActorId, sinceTick: currentTick };
    target.stability = clamp((target.stability ?? .5) - .035);
    return { effect: 'vip_captured', vip };
  }
  if (op.mission === SPECIAL_OPERATION_MISSIONS.VIP_RESCUE) {
    const hostileState = ensureSpecialForces(target);
    const captiveIndex = hostileState.captives.findIndex(c => !op.targetVip || c.id === op.targetVip.id);
    if (captiveIndex >= 0) {
      const [vip] = hostileState.captives.splice(captiveIndex, 1);
      state.rescuedVips.push({ ...vip, rescuedTick: currentTick, operationId: op.id });
      if (target.governance?.vipStatus?.[vip.id]) target.governance.vipStatus[vip.id] = { status: 'rescued', sinceTick: currentTick };
      return { effect: 'vip_rescued', vip };
    }
    return { effect: 'target_not_found' };
  }
  if (op.mission === SPECIAL_OPERATION_MISSIONS.STRATEGIC_SITE_RAID) {
    target.strategicSiteDisruption ||= {};
    const site = op.strategicSiteId || 'strategic_site';
    target.strategicSiteDisruption[site] = { disruptedUntilTick: currentTick + 8, severity: clamp(.25 + op.assessment.readiness * .35), operationId: op.id };
    return { effect: 'strategic_site_disrupted', strategicSiteId: site };
  }
  return { effect: 'none' };
}

export function tickSpecialOperations(regions, currentTick, elapsedDays = 7, rng = Math.random) {
  const byId = new Map((regions || []).map(r => [r.id, r]));
  const events = [];
  for (const origin of regions || []) {
    tickSpecialForcesTraining(origin, elapsedDays);
    const state = ensureSpecialForces(origin);
    for (const op of state.operations) {
      if (op.status !== 'active' || currentTick < op.resolveTick) continue;
      const target = byId.get(op.targetRegionId);
      if (!target) {
        op.status = 'aborted';
        state.available = Math.min(state.operators, state.available + op.teamSize);
        events.push({ type: 'special_operation_aborted', operationId: op.id, originRegionId: origin.id, reason: 'target_missing' });
        continue;
      }
      const success = rng() < op.assessment.successChance;
      const detected = rng() < op.assessment.detectionChance;
      const casualtyRisk = clamp(.04 + op.assessment.targetSecurity * .18 + (success ? 0 : .13) + (detected ? .08 : 0) - op.assessment.readiness * .10, .01, .55);
      const casualties = Math.min(op.teamSize, Math.floor(op.teamSize * casualtyRisk * clamp(.45 + rng() * .9)));
      const survivors = Math.max(0, op.teamSize - casualties);
      state.operators = Math.max(0, state.operators - casualties);
      state.available = Math.min(state.operators, state.available + survivors);
      op.status = success ? 'completed' : 'failed';
      op.resolvedTick = currentTick;
      op.detected = detected;
      op.casualties = casualties;
      let effect = { effect: 'none' };
      if (success) effect = applySuccess(origin, target, op, currentTick);
      recordMissionExperience(state, op.mission, success ? .022 : .009);
      if (detected) {
        target.specialOperationsSecurity ||= { detectedOperations: 0, experience: 0 };
        target.specialOperationsSecurity.detectedOperations += 1;
        target.specialOperationsSecurity.experience = clamp((target.specialOperationsSecurity.experience || 0) + .012);
      }
      events.push({
        type: success ? 'special_operation_succeeded' : 'special_operation_failed',
        operationId: op.id,
        mission: op.mission,
        originRegionId: origin.id,
        targetRegionId: target.id,
        detected,
        casualties,
        ...effect,
      });
    }
  }
  return events;
}

export function specialForcesSummary(region) {
  const state = ensureSpecialForces(region);
  return {
    operators: state.operators,
    available: state.available,
    deployed: Math.max(0, state.operators - state.available),
    training: state.training,
    experience: state.experience,
    readiness: specialForcesReadiness(region),
    activeOperations: state.operations.filter(op => op.status === 'active').length,
    captives: state.captives.length,
    rescuedVips: state.rescuedVips.length,
  };
}
