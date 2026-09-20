import { changeAttitude } from './relations.js?v=20260920-covert-demand-response1';
import { chooseNpcInstitutionalApprovals, requestExecutiveAction } from '../politics/institutionalActions.js?v=20260920-covert-demand-response1';
import { ensureInstitutionalCrisisState } from '../politics/institutionalCrises.js?v=20260920-covert-demand-response1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.polityId || region?.id || null;

export const COVERT_DEMAND_REPLIES = Object.freeze({
  FULL_COMPLIANCE: 'full_compliance',
  RELEASE_CAPTIVE: 'release_captive',
  APOLOGISE: 'apologise',
  PAY_COMPENSATION: 'pay_compensation',
  DENY_RESPONSIBILITY: 'deny_responsibility',
  STALL: 'stall',
  REFUSE: 'refuse',
});

const DEMAND_TYPES = Object.freeze({
  RETURN_CAPTIVE: 'return_captive',
  APOLOGY: 'apology',
  COMPENSATION: 'compensation',
  CEASE_COVERT_OPERATIONS: 'cease_covert_operations',
});

function polityRegions(polity, regions) {
  return (regions || []).filter((region) => actorId(region) === polity?.id);
}

function capital(polity, regions) {
  return (regions || []).find((region) => region.id === polity?.capitalRegionId) || polityRegions(polity, regions)[0] || null;
}

function pendingDemands(incident) {
  return (incident?.demands || []).filter((demand) => demand.status === 'pending');
}

function responseSeverity(response) {
  return ({
    absorb: .05,
    protest: .18,
    demand_return: .34,
    ultimatum: .78,
    covert_retaliation: .60,
    limited_force: .92,
    mobilise: .68,
  })[response] ?? .30;
}

function institutionalApproval(polity, action, context, rng, playerControlled, approvals = []) {
  if (playerControlled) return requestExecutiveAction(polity, action, approvals);
  const result = chooseNpcInstitutionalApprovals(polity, action, context, rng);
  return { allowed: result.approved, ...result };
}

function captiveRecord(culpritPolity, regions, vipId) {
  for (const region of polityRegions(culpritPolity, regions)) {
    const captives = region.specialForces?.captives || [];
    const index = captives.findIndex((captive) => captive.id === vipId);
    if (index >= 0) return { region, captives, index, captive: captives[index] };
  }
  return null;
}

function releaseCaptive(responderPolity, culpritPolity, incident, demand, regions, currentTick) {
  const vipId = demand.vipId || incident.vip?.id;
  if (!vipId) return { satisfied: false, reason: 'vip_not_identified' };
  const held = captiveRecord(culpritPolity, regions, vipId);
  if (!held) return { satisfied: false, reason: 'captive_not_held' };
  const [captive] = held.captives.splice(held.index, 1);
  const receivingRegion = capital(responderPolity, regions);
  if (receivingRegion) {
    receivingRegion.governance ||= {};
    receivingRegion.governance.vipStatus ||= {};
    receivingRegion.governance.vipStatus[vipId] = { status: 'released', sinceTick: currentTick };
  }
  demand.status = 'accepted';
  demand.resolvedTick = currentTick;
  demand.release = { fromRegionId: held.region.id, toActorId: responderPolity.id, captive };
  return { satisfied: true, captive };
}

function payCompensation(responderPolity, culpritPolity, demand, regions, currentTick) {
  const payer = capital(culpritPolity, regions);
  const receiver = capital(responderPolity, regions);
  if (!payer || !receiver) return { satisfied: false, reason: 'capital_missing', paid: 0 };
  const due = Math.max(0, Number(demand.amount) || 0);
  const fromTreasury = Math.min(Math.max(0, Number(payer.treasury) || 0), due);
  payer.treasury = Math.max(0, Number(payer.treasury) || 0) - fromTreasury;
  const remaining = due - fromTreasury;
  const fromWallet = Math.min(Math.max(0, Number(payer.wallet) || 0), remaining);
  payer.wallet = Math.max(0, Number(payer.wallet) || 0) - fromWallet;
  const paid = fromTreasury + fromWallet;
  receiver.treasury = Math.max(0, Number(receiver.treasury) || 0) + paid;
  demand.paidAmount = paid;
  demand.resolvedTick = currentTick;
  demand.status = paid + 1e-9 >= due ? 'accepted' : paid > 0 ? 'partially_satisfied' : 'rejected';
  return { satisfied: demand.status === 'accepted', partial: demand.status === 'partially_satisfied', paid, due };
}

function acceptSimpleDemand(incident, demand, currentTick) {
  demand.status = 'accepted';
  demand.resolvedTick = currentTick;
  if (demand.type === DEMAND_TYPES.CEASE_COVERT_OPERATIONS) {
    incident.ceaseOperationsPledge = { accepted: true, tick: currentTick };
  }
  return { satisfied: true };
}

function crisisPressure(region, opponentActorId, delta, currentTick, reason) {
  const crisis = region?.nuclearDeterrence?.crises?.[opponentActorId];
  if (!crisis) return null;
  crisis.pressure = clamp((crisis.pressure || 0) + delta);
  crisis.level = Math.min(5, Math.floor(crisis.pressure * 5.2));
  crisis.lastTick = currentTick;
  crisis.history ||= [];
  crisis.history.push({ tick: currentTick, category: 'covert_incident_bargaining', severity: Math.abs(delta), reason, level: crisis.level });
  if (crisis.history.length > 20) crisis.history.shift();
  return crisis;
}

function settleEffects(responderPolity, culpritPolity, incident, regions, currentTick, degree) {
  const responderRegion = capital(responderPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  if (!responderRegion || !culpritRegion) return;
  const crisis = ensureInstitutionalCrisisState(responderPolity);
  crisis.pressure = clamp(crisis.pressure - .07 * degree);
  crisis.protests = clamp(crisis.protests - .04 * degree);
  changeAttitude(responderRegion, culpritRegion.id, .05 * degree, 'covert_incident_concession', currentTick);
  crisisPressure(responderRegion, culpritPolity.id, -.16 * degree, currentTick, 'covert_incident_concession');
}

function escalationEffects(responderPolity, culpritPolity, incident, regions, currentTick, degree, reason) {
  const responderRegion = capital(responderPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  if (!responderRegion || !culpritRegion) return;
  const crisis = ensureInstitutionalCrisisState(responderPolity);
  crisis.pressure = clamp(crisis.pressure + .045 * degree);
  crisis.protests = clamp(crisis.protests + .025 * degree);
  changeAttitude(responderRegion, culpritRegion.id, -.08 * degree, `covert_incident_${reason}`, currentTick);
  crisisPressure(responderRegion, culpritPolity.id, .10 * degree, currentTick, reason);
  incident.escalationPressure = clamp((incident.escalationPressure || 0) + .16 * degree);
}

export function covertDemandResponseAssessment(culpritPolity, responderPolity, incident, regions) {
  const culpritRegion = capital(culpritPolity, regions);
  const demands = pendingDemands(incident);
  const attribution = clamp(incident?.attributionConfidence || 0);
  const victimPressure = clamp(incident?.responseAssessment?.outrage || responseSeverity(incident?.response));
  const victimPower = clamp(incident?.responseAssessment?.powerRatio ?? .5);
  const overtThreat = responseSeverity(incident?.response);
  const culpritCrisis = ensureInstitutionalCrisisState(culpritPolity);
  const domesticBackingCost = clamp(culpritCrisis.pressure * .35 + culpritCrisis.protests * .30 + culpritCrisis.coupRisk * .20 + culpritCrisis.revolutionRisk * .15);
  const compensationDue = demands.filter((d) => d.type === DEMAND_TYPES.COMPENSATION).reduce((sum, d) => sum + Math.max(0, Number(d.amount) || 0), 0);
  const liquid = Math.max(0, Number(culpritRegion?.treasury) || 0) + Math.max(0, Number(culpritRegion?.wallet) || 0);
  const affordability = compensationDue > 0 ? clamp(liquid / compensationDue) : 1;
  const hasCaptiveDemand = demands.some((d) => d.type === DEMAND_TYPES.RETURN_CAPTIVE);
  const captiveHeld = hasCaptiveDemand && demands.some((d) => captiveRecord(culpritPolity, regions, d.vipId || incident.vip?.id));
  const stallCount = Math.max(0, Number(incident?.perpetratorStallCount) || 0);
  const concessionPressure = clamp(attribution * .30 + victimPressure * .28 + victimPower * .18 + overtThreat * .24);
  const plausibleDenial = clamp((1 - attribution) * .62 + (incident?.detected ? .08 : .22) - (hasCaptiveDemand && captiveHeld ? .22 : 0));

  const scores = {
    [COVERT_DEMAND_REPLIES.FULL_COMPLIANCE]: clamp(.10 + concessionPressure * .66 + affordability * .10 - domesticBackingCost * .20),
    [COVERT_DEMAND_REPLIES.RELEASE_CAPTIVE]: clamp((hasCaptiveDemand && captiveHeld ? .34 : 0) + concessionPressure * .48 - domesticBackingCost * .12),
    [COVERT_DEMAND_REPLIES.APOLOGISE]: clamp(.16 + attribution * .28 + concessionPressure * .32 - domesticBackingCost * .20),
    [COVERT_DEMAND_REPLIES.PAY_COMPENSATION]: clamp((compensationDue > 0 ? .18 : 0) + affordability * .24 + concessionPressure * .35 - domesticBackingCost * .10),
    [COVERT_DEMAND_REPLIES.DENY_RESPONSIBILITY]: clamp(.14 + plausibleDenial * .70 + domesticBackingCost * .15 - overtThreat * .16),
    [COVERT_DEMAND_REPLIES.STALL]: clamp(.30 + (1 - concessionPressure) * .25 + plausibleDenial * .16 - stallCount * .18),
    [COVERT_DEMAND_REPLIES.REFUSE]: clamp(.18 + (1 - victimPower) * .25 + domesticBackingCost * .22 + (1 - attribution) * .15 - overtThreat * .24),
  };
  if (!hasCaptiveDemand || !captiveHeld) scores[COVERT_DEMAND_REPLIES.RELEASE_CAPTIVE] *= .15;
  if (compensationDue <= 0) scores[COVERT_DEMAND_REPLIES.PAY_COMPENSATION] *= .15;
  if (!demands.some((d) => d.type === DEMAND_TYPES.APOLOGY || d.type === DEMAND_TYPES.CEASE_COVERT_OPERATIONS)) scores[COVERT_DEMAND_REPLIES.APOLOGISE] *= .25;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { reply: ranked[0][0], scores, attribution, victimPressure, victimPower, overtThreat, domesticBackingCost, affordability, plausibleDenial, captiveHeld: Boolean(captiveHeld), demandCount: demands.length };
}

export function applyCovertDemandResponse(culpritPolity, responderPolity, incident, regions, currentTick, reply, options = {}) {
  if (!incident || !['responded', 'absorbed'].includes(incident.status)) return { applied: false, reason: 'incident_not_open_for_bargaining' };
  const demands = pendingDemands(incident);
  if (!demands.length) return { applied: false, reason: 'no_pending_demands' };
  const rng = options.rng || Math.random;
  const assessment = covertDemandResponseAssessment(culpritPolity, responderPolity, incident, regions);
  const selected = reply || assessment.reply;
  const culpritRegion = capital(culpritPolity, regions);
  const responderRegion = capital(responderPolity, regions);
  if (!culpritRegion || !responderRegion) return { applied: false, reason: 'capital_missing' };

  let authority = null;
  if ([COVERT_DEMAND_REPLIES.FULL_COMPLIANCE, COVERT_DEMAND_REPLIES.PAY_COMPENSATION].includes(selected) && demands.some((d) => d.type === DEMAND_TYPES.COMPENSATION)) {
    const context = { publicSupport: 1 - assessment.domesticBackingCost, fiscalStress: clamp(1 - assessment.affordability), threat: assessment.overtThreat };
    authority = institutionalApproval(culpritPolity, 'change_spending', context, rng, options.playerControlled, options.approvals);
    if (!authority.allowed) return { applied: false, reason: 'institutional_authorisation_refused', authority, assessment };
  }

  const results = [];
  const satisfy = (demand) => {
    if (demand.type === DEMAND_TYPES.RETURN_CAPTIVE) return releaseCaptive(responderPolity, culpritPolity, incident, demand, regions, currentTick);
    if (demand.type === DEMAND_TYPES.COMPENSATION) return payCompensation(responderPolity, culpritPolity, demand, regions, currentTick);
    return acceptSimpleDemand(incident, demand, currentTick);
  };

  if (selected === COVERT_DEMAND_REPLIES.FULL_COMPLIANCE) {
    for (const demand of demands) results.push({ demandId: demand.id, ...satisfy(demand) });
  } else if (selected === COVERT_DEMAND_REPLIES.RELEASE_CAPTIVE) {
    for (const demand of demands.filter((d) => d.type === DEMAND_TYPES.RETURN_CAPTIVE)) results.push({ demandId: demand.id, ...satisfy(demand) });
  } else if (selected === COVERT_DEMAND_REPLIES.APOLOGISE) {
    for (const demand of demands.filter((d) => [DEMAND_TYPES.APOLOGY, DEMAND_TYPES.CEASE_COVERT_OPERATIONS].includes(d.type))) results.push({ demandId: demand.id, ...satisfy(demand) });
  } else if (selected === COVERT_DEMAND_REPLIES.PAY_COMPENSATION) {
    for (const demand of demands.filter((d) => d.type === DEMAND_TYPES.COMPENSATION)) results.push({ demandId: demand.id, ...satisfy(demand) });
  } else if (selected === COVERT_DEMAND_REPLIES.DENY_RESPONSIBILITY) {
    const denialCredibility = assessment.plausibleDenial;
    incident.publicAttributionConfidence = clamp((incident.publicAttributionConfidence ?? incident.attributionConfidence ?? 0) - Math.max(0, .55 - assessment.attribution) * .18);
    for (const demand of demands) {
      demand.status = 'rejected';
      demand.resolvedTick = currentTick;
      demand.rejectionReason = 'responsibility_denied';
    }
    incident.perpetratorStatement = { type: 'denial', tick: currentTick, credibility: denialCredibility };
    if (assessment.attribution >= .72) escalationEffects(responderPolity, culpritPolity, incident, regions, currentTick, .8, 'implausible_denial');
    else escalationEffects(responderPolity, culpritPolity, incident, regions, currentTick, .25, 'denial');
  } else if (selected === COVERT_DEMAND_REPLIES.STALL) {
    incident.perpetratorStallCount = (incident.perpetratorStallCount || 0) + 1;
    for (const demand of demands) {
      demand.lastResponse = 'stalled';
      demand.lastResponseTick = currentTick;
      if (Number.isFinite(demand.deadlineTick) && incident.perpetratorStallCount <= 2) demand.deadlineTick += 4;
    }
    escalationEffects(responderPolity, culpritPolity, incident, regions, currentTick, .20 + Math.min(.4, incident.perpetratorStallCount * .12), 'stalling');
  } else if (selected === COVERT_DEMAND_REPLIES.REFUSE) {
    for (const demand of demands) {
      demand.status = 'rejected';
      demand.resolvedTick = currentTick;
      demand.rejectionReason = 'refused';
    }
    escalationEffects(responderPolity, culpritPolity, incident, regions, currentTick, .75 + responseSeverity(incident.response) * .25, 'refusal');
  } else {
    return { applied: false, reason: 'unknown_reply', assessment };
  }

  const remaining = pendingDemands(incident);
  const accepted = (incident.demands || []).filter((d) => d.status === 'accepted').length;
  const partial = (incident.demands || []).filter((d) => d.status === 'partially_satisfied').length;
  const rejected = (incident.demands || []).filter((d) => d.status === 'rejected').length;
  if (selected !== COVERT_DEMAND_REPLIES.STALL && accepted > 0) {
    const degree = clamp((accepted + partial * .45) / Math.max(1, incident.demands.length));
    settleEffects(responderPolity, culpritPolity, incident, regions, currentTick, degree);
  }

  incident.perpetratorResponse = selected;
  incident.perpetratorResponseTick = currentTick;
  incident.perpetratorResponseAssessment = assessment;
  incident.perpetratorResponseHistory ||= [];
  incident.perpetratorResponseHistory.push({ tick: currentTick, reply: selected, remainingDemands: remaining.length, accepted, partial, rejected });
  if (incident.perpetratorResponseHistory.length > 12) incident.perpetratorResponseHistory.shift();
  if (!remaining.length) {
    incident.resolvedTick = currentTick;
    incident.status = rejected > accepted + partial ? 'escalated' : partial > 0 || rejected > 0 ? 'partially_settled' : 'settled';
  }
  return { applied: true, reply: selected, authority, assessment, results, incident };
}

export function tickCovertDemandResponses(polities, regions, currentTick, elapsedDays = 7, rng = Math.random, options = {}) {
  const events = [];
  for (const victimRegion of regions || []) {
    const victimPolity = (polities || []).find((polity) => polity.id === actorId(victimRegion));
    if (!victimPolity) continue;
    for (const incident of victimRegion.covertIncidentEscalation?.incidents || []) {
      const demands = pendingDemands(incident);
      if (!demands.length || !['responded', 'absorbed'].includes(incident.status)) continue;
      if (demands.every((demand) => currentTick - (demand.createdTick ?? incident.responseTick ?? incident.createdTick ?? currentTick) < 1)) continue;
      const culpritPolity = (polities || []).find((polity) => polity.id === incident.attributedActorId);
      if (!culpritPolity) continue;
      if (Number.isFinite(incident.perpetratorResponseTick) && currentTick - incident.perpetratorResponseTick < 2) continue;
      const assessment = covertDemandResponseAssessment(culpritPolity, victimPolity, incident, regions);
      if (options.playerPolityId === culpritPolity.id) {
        if (incident.perpetratorPlayerPromptedTick !== currentTick && !incident.awaitingPerpetratorPlayerResponse) {
          incident.awaitingPerpetratorPlayerResponse = true;
          incident.perpetratorPlayerPromptedTick = currentTick;
          events.push({ type: 'covert_incident_demand_response_available', incidentId: incident.id, culpritActorId: culpritPolity.id, targetActorId: victimPolity.id, targetRegionId: victimRegion.id, assessment, demands: demands.map((d) => ({ ...d })) });
        }
        continue;
      }
      const result = applyCovertDemandResponse(culpritPolity, victimPolity, incident, regions, currentTick, null, { rng });
      if (result.applied) events.push({ type: 'covert_incident_demand_response', incidentId: incident.id, culpritActorId: culpritPolity.id, targetActorId: victimPolity.id, targetRegionId: victimRegion.id, reply: result.reply, assessment: result.assessment, status: incident.status });
    }
  }
  return events;
}
