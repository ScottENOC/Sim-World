import { changeAttitude } from './relations.js?v=20260920-covert-escalation1';
import { estimateForeignNuclearWeaponCapability, nuclearDeterrentStatus } from '../military/nuclearWeaponisation.js?v=20260920-covert-escalation1';
import { secondStrikeAssessment } from '../military/strategicDelivery.js?v=20260920-covert-escalation1';
import { chooseNpcInstitutionalApprovals, requestExecutiveAction } from '../politics/institutionalActions.js?v=20260920-covert-escalation1';
import { ensureInstitutionalCrisisState } from '../politics/institutionalCrises.js?v=20260920-covert-escalation1';
import { fundPoliticalDestabilisation } from '../politics/foreignPoliticalIntervention.js?v=20260920-covert-escalation1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.polityId || region?.id || null;

export const COVERT_INCIDENT_RESPONSES = Object.freeze({
  ABSORB: 'absorb',
  PROTEST: 'protest',
  DEMAND_RETURN: 'demand_return',
  ULTIMATUM: 'ultimatum',
  COVERT_RETALIATION: 'covert_retaliation',
  LIMITED_FORCE: 'limited_force',
  MOBILISE: 'mobilise',
});

export const COVERT_INCIDENT_DEMANDS = Object.freeze({
  RETURN_CAPTIVE: 'return_captive',
  APOLOGY: 'apology',
  COMPENSATION: 'compensation',
  CEASE_COVERT_OPERATIONS: 'cease_covert_operations',
});

const MISSION_SEVERITY = Object.freeze({
  special_reconnaissance: .16,
  special_sabotage: .42,
  vip_capture: .72,
  vip_assassination: .90,
  vip_rescue: .48,
  strategic_site_raid: .68,
});

function polityRegions(polity, regions) {
  return (regions || []).filter((region) => actorId(region) === polity?.id);
}

function capital(polity, regions) {
  return (regions || []).find((region) => region.id === polity?.capitalRegionId) || polityRegions(polity, regions)[0] || null;
}

function militaryPower(polity, regions) {
  const owned = polityRegions(polity, regions);
  return owned.reduce((sum, region) => sum + Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.army?.away) || 0) * .75 + Math.max(0, Number(region.population) || 0) * .0015 + (region.fleets?.length || 0) * 80 + (region.aviation?.aircraft?.length || 0) * 10, 1);
}

function allianceBacking(polity, regions) {
  const owned = polityRegions(polity, regions);
  let backing = 0;
  for (const region of owned) {
    const deployments = Object.values(region.nuclearAlliance?.deployments || region.nuclearAlliedDeployments?.deployments || {});
    backing = Math.max(backing, deployments.some((entry) => entry.status === 'active' && entry.role === 'host') ? .72 : 0);
    const support = Array.from(region.relations?.values?.() || []).filter((relation) => (relation.attitude || 0) > .55).length;
    backing = Math.max(backing, clamp(support / 4) * .45);
  }
  return clamp(backing);
}

function domesticOutrage(polity, region, incident) {
  const mission = MISSION_SEVERITY[incident.mission] ?? .35;
  const crisis = ensureInstitutionalCrisisState(polity);
  const martyr = clamp(polity.leadershipShock?.martyrBacklash || 0);
  const importance = incident.vip?.role === 'ruler' || incident.vip?.role === 'head_of_state' ? 1 : incident.vip ? .72 : .35;
  const publicStress = clamp(crisis.protests * .18 + crisis.pressure * .16 + (1 - clamp(region?.stability ?? .55)) * .12);
  return clamp(.12 + mission * .42 + importance * .16 + martyr * .20 + publicStress + (incident.attributed ? .12 : 0));
}

function nuclearEscalationRisk(responderRegion, culpritRegion) {
  if (!responderRegion || !culpritRegion) return 0;
  const observed = estimateForeignNuclearWeaponCapability(responderRegion, culpritRegion);
  const demonstrated = observed.assessment === 'nuclear_capability_demonstrated' ? 1
    : observed.assessment === 'probable_nuclear_test' ? .78
      : observed.assessment === 'untested_device_probable' ? .58
        : observed.assessment === 'weaponisation_programme_suspected' ? .28 : 0;
  const actual = nuclearDeterrentStatus(culpritRegion) === 'demonstrated_device_capability' ? 1 : demonstrated;
  const secondStrike = secondStrikeAssessment(culpritRegion);
  return clamp(Math.max(actual, demonstrated * observed.confidence) * (.28 + secondStrike.retaliationConfidence * .72));
}

export function ensureCovertIncidentEscalation(region) {
  region.covertIncidentEscalation ||= { incidents: [], history: [], nextIncidentId: 1 };
  const state = region.covertIncidentEscalation;
  state.incidents ||= [];
  state.history ||= [];
  state.nextIncidentId = Math.max(1, Number(state.nextIncidentId) || 1);
  return state;
}

export function registerCovertIncident(targetRegion, details = {}, currentTick = 0) {
  const state = ensureCovertIncidentEscalation(targetRegion);
  const knownActorId = details.attributed ? (details.sourceActorId || null) : null;
  const confidence = details.attributed
    ? clamp(.55 + (details.attributionProbability || .5) * .4)
    : clamp((details.attributionProbability || .2) * .3);
  const incident = {
    id: details.id || `covert-incident-${targetRegion.id}-${state.nextIncidentId++}`,
    operationId: details.operationId || null,
    mission: details.mission || 'unknown',
    targetRegionId: targetRegion.id,
    targetActorId: actorId(targetRegion),
    actualSourceActorId: details.sourceActorId || null,
    attributedActorId: knownActorId,
    attributionConfidence: confidence,
    attributed: Boolean(details.attributed),
    detected: details.detected !== false,
    success: details.success !== false,
    effect: details.effect || null,
    vip: details.vip || null,
    casualties: Math.max(0, Number(details.casualties) || 0),
    createdTick: currentTick,
    status: 'unanswered',
    demands: [],
    response: null,
    resolvedTick: null,
  };
  state.incidents.push(incident);
  state.history.push({ tick: currentTick, type: 'covert_incident_registered', incidentId: incident.id, attributedActorId: knownActorId, confidence });
  if (state.history.length > 40) state.history.shift();
  return incident;
}

export function covertIncidentResponseAssessment(responderPolity, culpritPolity, incident, regions) {
  const responderRegion = capital(responderPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  const attribution = clamp(incident?.attributionConfidence || 0);
  const outrage = domesticOutrage(responderPolity, responderRegion, incident || {});
  const ownPower = militaryPower(responderPolity, regions);
  const enemyPower = militaryPower(culpritPolity, regions);
  const powerRatio = clamp(ownPower / Math.max(1, enemyPower), 0, 2) / 2;
  const alliances = allianceBacking(responderPolity, regions);
  const nuclearRisk = nuclearEscalationRisk(responderRegion, culpritRegion);
  const crisis = ensureInstitutionalCrisisState(responderPolity);
  const instability = clamp(crisis.pressure * .55 + crisis.coupRisk * .25 + crisis.revolutionRisk * .20);

  const scores = {
    [COVERT_INCIDENT_RESPONSES.ABSORB]: clamp(.54 + (1 - attribution) * .42 + nuclearRisk * .24 - outrage * .58),
    [COVERT_INCIDENT_RESPONSES.PROTEST]: clamp(.32 + attribution * .40 + outrage * .40 + nuclearRisk * .08),
    [COVERT_INCIDENT_RESPONSES.DEMAND_RETURN]: clamp((incident?.mission === 'vip_capture' ? .55 : .12) + attribution * .30 + outrage * .24),
    [COVERT_INCIDENT_RESPONSES.ULTIMATUM]: clamp(.08 + attribution * .38 + outrage * .36 + powerRatio * .18 + alliances * .12 - nuclearRisk * .20 - instability * .12),
    [COVERT_INCIDENT_RESPONSES.COVERT_RETALIATION]: clamp(.10 + attribution * .26 + outrage * .34 + nuclearRisk * .22 + (1 - powerRatio) * .10 - instability * .10),
    [COVERT_INCIDENT_RESPONSES.LIMITED_FORCE]: clamp(.03 + attribution * .34 + outrage * .34 + powerRatio * .22 + alliances * .10 - nuclearRisk * .46 - instability * .12),
    [COVERT_INCIDENT_RESPONSES.MOBILISE]: clamp(.08 + attribution * .30 + outrage * .30 + nuclearRisk * .24 + alliances * .12),
  };
  if (attribution < .45) {
    scores[COVERT_INCIDENT_RESPONSES.ULTIMATUM] *= .45;
    scores[COVERT_INCIDENT_RESPONSES.COVERT_RETALIATION] *= .35;
    scores[COVERT_INCIDENT_RESPONSES.LIMITED_FORCE] *= .18;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { response: ranked[0][0], scores, attribution, outrage, powerRatio, alliances, nuclearRisk, instability };
}

function institutionalApproval(polity, action, context, rng, playerControlled, approvals = []) {
  if (playerControlled) return requestExecutiveAction(polity, action, approvals);
  const result = chooseNpcInstitutionalApprovals(polity, action, context, rng);
  return { allowed: result.approved, ...result };
}

function addDemand(incident, type, currentTick, extra = {}) {
  const demand = { id: `demand-${incident.id}-${incident.demands.length + 1}`, type, status: 'pending', createdTick: currentTick, ...extra };
  incident.demands.push(demand);
  return demand;
}

export function applyCovertIncidentResponse(responderPolity, culpritPolity, incident, regions, currentTick, response, options = {}) {
  const responderRegion = capital(responderPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  if (!responderRegion || !culpritRegion || !incident || incident.status !== 'unanswered') return { applied: false, reason: 'invalid_incident' };
  const rng = options.rng || Math.random;
  const assessment = covertIncidentResponseAssessment(responderPolity, culpritPolity, incident, regions);
  const selected = response || assessment.response;
  let authority = null;
  const context = { threat: assessment.outrage, hostility: assessment.outrage, publicSupport: assessment.outrage, defensive: true, reprisal: true, evidence: assessment.attribution, legalBasis: assessment.attribution, emergency: assessment.outrage };

  if (selected === COVERT_INCIDENT_RESPONSES.COVERT_RETALIATION) authority = institutionalApproval(responderPolity, 'order_intelligence_operation', context, rng, options.playerControlled, options.approvals);
  if (selected === COVERT_INCIDENT_RESPONSES.LIMITED_FORCE) authority = institutionalApproval(responderPolity, 'launch_reprisals', context, rng, options.playerControlled, options.approvals);
  if (authority && !authority.allowed) return { applied: false, reason: 'institutional_authorisation_refused', authority, assessment };

  if (selected !== COVERT_INCIDENT_RESPONSES.ABSORB) {
    changeAttitude(responderRegion, culpritRegion.id, selected === COVERT_INCIDENT_RESPONSES.LIMITED_FORCE ? -.24 : selected === COVERT_INCIDENT_RESPONSES.ULTIMATUM ? -.18 : -.10, `covert_incident_${selected}`, currentTick);
  }

  if (selected === COVERT_INCIDENT_RESPONSES.PROTEST) {
    addDemand(incident, COVERT_INCIDENT_DEMANDS.APOLOGY, currentTick);
    addDemand(incident, COVERT_INCIDENT_DEMANDS.CEASE_COVERT_OPERATIONS, currentTick);
  } else if (selected === COVERT_INCIDENT_RESPONSES.DEMAND_RETURN) {
    addDemand(incident, COVERT_INCIDENT_DEMANDS.RETURN_CAPTIVE, currentTick, { vipId: incident.vip?.id || null, deadlineTick: currentTick + 8 });
  } else if (selected === COVERT_INCIDENT_RESPONSES.ULTIMATUM) {
    if (incident.mission === 'vip_capture') addDemand(incident, COVERT_INCIDENT_DEMANDS.RETURN_CAPTIVE, currentTick, { vipId: incident.vip?.id || null, deadlineTick: currentTick + 4 });
    addDemand(incident, COVERT_INCIDENT_DEMANDS.APOLOGY, currentTick, { deadlineTick: currentTick + 4 });
    addDemand(incident, COVERT_INCIDENT_DEMANDS.COMPENSATION, currentTick, { deadlineTick: currentTick + 4, amount: Math.max(5, Math.round(assessment.outrage * 40)) });
    responderRegion.militaryThreat ||= {};
    responderRegion.militaryThreat.ultimatumTargetActorId = culpritPolity.id;
    responderRegion.militaryThreat.ultimatumDeadlineTick = currentTick + 4;
  } else if (selected === COVERT_INCIDENT_RESPONSES.COVERT_RETALIATION) {
    const amount = Math.max(4, Math.min(18, (responderRegion.treasury || 0) * .04));
    const destabilise = fundPoliticalDestabilisation(responderPolity, culpritPolity, regions, currentTick, 'coup', amount, rng);
    responderRegion.militaryThreat ||= {};
    responderRegion.militaryThreat.covertRetaliationTargetActorId = culpritPolity.id;
    responderRegion.militaryThreat.covertRetaliationTick = currentTick;
    incident.retaliation = { type: 'covert', result: destabilise };
  } else if (selected === COVERT_INCIDENT_RESPONSES.LIMITED_FORCE) {
    responderRegion.militaryThreat ||= {};
    responderRegion.militaryThreat.authorisedReprisalTargetActorId = culpritPolity.id;
    responderRegion.militaryThreat.authorisedReprisalUntilTick = currentTick + 26;
    incident.retaliation = { type: 'limited_force_authorised', targetActorId: culpritPolity.id };
  } else if (selected === COVERT_INCIDENT_RESPONSES.MOBILISE) {
    responderRegion.militaryStrategy ||= {};
    responderRegion.militaryStrategy.readiness = clamp(Math.max(responderRegion.militaryStrategy.readiness || 0, .55 + assessment.outrage * .25));
    responderRegion.militaryThreat ||= {};
    responderRegion.militaryThreat.mobilisedAgainstActorId = culpritPolity.id;
    responderRegion.militaryThreat.mobilisationUntilTick = currentTick + 13;
  }

  if (assessment.nuclearRisk >= .30 && [COVERT_INCIDENT_RESPONSES.ULTIMATUM, COVERT_INCIDENT_RESPONSES.LIMITED_FORCE, COVERT_INCIDENT_RESPONSES.MOBILISE].includes(selected)) {
    responderRegion.nuclearDeterrence ||= { doctrine: 'ambiguous', redLines: [], crises: {}, perceptions: {}, resolve: .55, riskTolerance: .28, signalDiscipline: .55 };
    responderRegion.nuclearDeterrence.crises ||= {};
    const crisis = responderRegion.nuclearDeterrence.crises[culpritPolity.id] || { opponentActorId: culpritPolity.id, level: 0, pressure: 0, lastTick: null, history: [] };
    crisis.pressure = clamp(crisis.pressure + .10 + assessment.nuclearRisk * .18 + assessment.outrage * .08);
    crisis.level = Math.min(5, Math.floor(crisis.pressure * 5.2));
    crisis.lastTick = currentTick;
    crisis.history ||= [];
    crisis.history.push({ tick: currentTick, category: 'covert_incident_escalation', severity: assessment.outrage, response: selected, level: crisis.level });
    if (crisis.history.length > 20) crisis.history.shift();
    responderRegion.nuclearDeterrence.crises[culpritPolity.id] = crisis;
  }

  incident.response = selected;
  incident.responseAssessment = assessment;
  incident.responseTick = currentTick;
  incident.status = selected === COVERT_INCIDENT_RESPONSES.ABSORB ? 'absorbed' : 'responded';
  return { applied: true, response: selected, authority, assessment, incident };
}

export function tickCovertIncidentEscalation(polities, regions, currentTick, elapsedDays = 7, rng = Math.random, options = {}) {
  const events = [];
  for (const region of regions || []) {
    const state = ensureCovertIncidentEscalation(region);
    const responderPolity = (polities || []).find((polity) => polity.id === actorId(region));
    if (!responderPolity) continue;
    for (const incident of state.incidents) {
      if (incident.status !== 'unanswered') continue;
      if (currentTick - incident.createdTick < 1) continue;
      const culpritPolity = (polities || []).find((polity) => polity.id === incident.attributedActorId);
      if (!culpritPolity) {
        if (currentTick - incident.createdTick >= 8) {
          incident.status = 'unattributed';
          events.push({ type: 'covert_incident_unattributed', incidentId: incident.id, targetActorId: responderPolity.id, targetRegionId: region.id });
        }
        continue;
      }
      if (options.playerPolityId === responderPolity.id) {
        const assessment = covertIncidentResponseAssessment(responderPolity, culpritPolity, incident, regions);
        if (!incident.playerPrompted) {
          incident.playerPrompted = true;
          events.push({ type: 'covert_incident_response_available', incidentId: incident.id, targetActorId: responderPolity.id, culpritActorId: culpritPolity.id, targetRegionId: region.id, assessment });
        }
        continue;
      }
      const result = applyCovertIncidentResponse(responderPolity, culpritPolity, incident, regions, currentTick, null, { rng });
      if (result.applied) events.push({ type: 'covert_incident_response', incidentId: incident.id, targetActorId: responderPolity.id, culpritActorId: culpritPolity.id, targetRegionId: region.id, response: result.response, assessment: result.assessment });
    }

    for (const incident of state.incidents) {
      if (!['responded', 'absorbed'].includes(incident.status)) continue;
      const missed = incident.demands.some((demand) => demand.status === 'pending' && Number.isFinite(demand.deadlineTick) && currentTick >= demand.deadlineTick);
      if (missed && !incident.deadlineEscalated) {
        incident.deadlineEscalated = true;
        ensureInstitutionalCrisisState(responderPolity).pressure = clamp(ensureInstitutionalCrisisState(responderPolity).pressure + .035);
        events.push({ type: 'covert_incident_demand_deadline_missed', incidentId: incident.id, targetActorId: responderPolity.id, culpritActorId: incident.attributedActorId });
      }
      if (currentTick - incident.createdTick > 104 && incident.demands.every((demand) => demand.status !== 'pending')) incident.status = 'closed';
    }
  }
  return events;
}

export function resolveCovertIncidentDemand(targetRegion, incidentId, demandId, accepted, currentTick = 0) {
  const incident = ensureCovertIncidentEscalation(targetRegion).incidents.find((entry) => entry.id === incidentId);
  const demand = incident?.demands?.find((entry) => entry.id === demandId);
  if (!incident || !demand || demand.status !== 'pending') return null;
  demand.status = accepted ? 'accepted' : 'rejected';
  demand.resolvedTick = currentTick;
  if (accepted && demand.type === COVERT_INCIDENT_DEMANDS.COMPENSATION) demand.paidAmount = demand.amount || 0;
  if (incident.demands.every((entry) => entry.status !== 'pending')) incident.resolvedTick = currentTick;
  return demand;
}
