import { attitudeToward, changeAttitude, relationToward } from './relations.js?v=20260920-covert-third-party1';
import { ensureInstitutionalCrisisState } from '../politics/institutionalCrises.js?v=20260920-covert-third-party1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.polityId || region?.id || null;

export const COVERT_THIRD_PARTY_ACTIONS = Object.freeze({
  BACK_VICTIM: 'back_victim',
  CONDEMN_CULPRIT: 'condemn_culprit',
  MEDIATE: 'mediate',
  URGE_RESTRAINT: 'urge_restraint',
  SANCTION_CULPRIT: 'sanction_culprit',
  BACK_CULPRIT: 'back_culprit',
});

function polityRegions(polity, regions) {
  return (regions || []).filter((region) => actorId(region) === polity?.id);
}

function capital(polity, regions) {
  return (regions || []).find((region) => region.id === polity?.capitalRegionId) || polityRegions(polity, regions)[0] || null;
}

function relationAffinity(polity, otherPolity, regions) {
  const own = capital(polity, regions);
  const other = capital(otherPolity, regions);
  if (!own || !other) return 0;
  return clamp((attitudeToward(own, other.id) + 1) / 2);
}

function nuclearCrisisPressure(region, opponentId) {
  return clamp(region?.nuclearDeterrence?.crises?.[opponentId]?.pressure || 0);
}

function coolNuclearCrisis(region, opponentId, amount, currentTick, reason) {
  const crisis = region?.nuclearDeterrence?.crises?.[opponentId];
  if (!crisis) return;
  crisis.pressure = clamp((crisis.pressure || 0) - amount);
  crisis.level = Math.min(5, Math.floor(crisis.pressure * 5.2));
  crisis.lastTick = currentTick;
  crisis.history ||= [];
  crisis.history.push({ tick: currentTick, category: 'third_party_diplomacy', severity: amount, reason, level: crisis.level });
  if (crisis.history.length > 20) crisis.history.shift();
}

function adjustBargainingSignals(incident, outrageDelta = 0, powerDelta = 0) {
  incident.responseAssessment ||= {};
  incident.responseAssessment.outrage = clamp((incident.responseAssessment.outrage || 0) + outrageDelta);
  incident.responseAssessment.powerRatio = clamp((incident.responseAssessment.powerRatio ?? .5) + powerDelta);
}

function interventionAlreadyMade(incident, actorIdValue) {
  return (incident.thirdPartyInterventions || []).some((entry) => entry.actorId === actorIdValue && entry.active !== false);
}

export function thirdPartyCovertAssessment(thirdPolity, victimPolity, culpritPolity, incident, regions) {
  const thirdRegion = capital(thirdPolity, regions);
  const victimRegion = capital(victimPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  if (!thirdRegion || !victimRegion || !culpritRegion) return null;

  const victimAffinity = relationAffinity(thirdPolity, victimPolity, regions);
  const culpritAffinity = relationAffinity(thirdPolity, culpritPolity, regions);
  const attribution = clamp(incident?.publicAttributionConfidence ?? incident?.attributionConfidence ?? 0);
  const incidentSeverity = ({ vip_assassination: .95, vip_capture: .78, strategic_site_raid: .68, special_sabotage: .50, vip_rescue: .42, special_reconnaissance: .24 })[incident?.mission] ?? .38;
  const victimCrisis = nuclearCrisisPressure(victimRegion, culpritPolity.id);
  const culpritCrisis = nuclearCrisisPressure(culpritRegion, victimPolity.id);
  const nuclearDanger = clamp(Math.max(victimCrisis, culpritCrisis, incident?.responseAssessment?.nuclearRisk || 0));
  const balancedTrust = clamp(1 - Math.abs(victimAffinity - culpritAffinity));
  const neutralAccess = clamp(Math.min(victimAffinity, culpritAffinity) * .65 + balancedTrust * .35);
  const victimLean = clamp(victimAffinity - culpritAffinity + .5);
  const culpritLean = clamp(culpritAffinity - victimAffinity + .5);
  const escalation = clamp(incident?.escalationPressure || 0);
  const outstandingDemands = (incident?.demands || []).some((demand) => demand.status === 'pending');

  const scores = {
    [COVERT_THIRD_PARTY_ACTIONS.BACK_VICTIM]: clamp(.04 + victimLean * .35 + attribution * .30 + incidentSeverity * .24 - nuclearDanger * .08),
    [COVERT_THIRD_PARTY_ACTIONS.CONDEMN_CULPRIT]: clamp(.05 + victimLean * .24 + attribution * .40 + incidentSeverity * .25),
    [COVERT_THIRD_PARTY_ACTIONS.MEDIATE]: clamp(.05 + neutralAccess * .46 + nuclearDanger * .30 + escalation * .18 + (outstandingDemands ? .08 : 0) - attribution * .05),
    [COVERT_THIRD_PARTY_ACTIONS.URGE_RESTRAINT]: clamp(.08 + neutralAccess * .22 + nuclearDanger * .42 + escalation * .26),
    [COVERT_THIRD_PARTY_ACTIONS.SANCTION_CULPRIT]: clamp(.01 + victimLean * .22 + attribution * .42 + incidentSeverity * .25 - culpritAffinity * .14),
    [COVERT_THIRD_PARTY_ACTIONS.BACK_CULPRIT]: clamp(.03 + culpritLean * .38 + (1 - attribution) * .35 - incidentSeverity * .12),
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { action: ranked[0][0], scores, victimAffinity, culpritAffinity, attribution, incidentSeverity, nuclearDanger, neutralAccess, escalation };
}

export function applyThirdPartyCovertAction(thirdPolity, victimPolity, culpritPolity, incident, regions, currentTick, action) {
  const thirdRegion = capital(thirdPolity, regions);
  const victimRegion = capital(victimPolity, regions);
  const culpritRegion = capital(culpritPolity, regions);
  if (!thirdRegion || !victimRegion || !culpritRegion || !incident) return { applied: false, reason: 'missing_participant' };
  if (interventionAlreadyMade(incident, thirdPolity.id)) return { applied: false, reason: 'already_intervened' };
  const assessment = thirdPartyCovertAssessment(thirdPolity, victimPolity, culpritPolity, incident, regions);
  const selected = action || assessment?.action;
  if (!selected) return { applied: false, reason: 'no_action' };

  incident.thirdPartyInterventions ||= [];
  incident.thirdPartyPressure = clamp(incident.thirdPartyPressure || 0);
  incident.mediationSupport = clamp(incident.mediationSupport || 0);
  incident.restraintPressure = clamp(incident.restraintPressure || 0);
  const record = { actorId: thirdPolity.id, action: selected, tick: currentTick, assessment, active: true };

  if (selected === COVERT_THIRD_PARTY_ACTIONS.BACK_VICTIM) {
    const leverage = .12 + assessment.victimAffinity * .08;
    incident.thirdPartyPressure = clamp(incident.thirdPartyPressure + leverage);
    adjustBargainingSignals(incident, leverage * .18, leverage * .22);
    changeAttitude(victimRegion, thirdRegion.id, .07, 'third_party_backing', currentTick);
    changeAttitude(culpritRegion, thirdRegion.id, -.05, 'third_party_backing_opponent', currentTick);
  } else if (selected === COVERT_THIRD_PARTY_ACTIONS.CONDEMN_CULPRIT) {
    const leverage = .10 + assessment.attribution * .08;
    incident.thirdPartyPressure = clamp(incident.thirdPartyPressure + leverage);
    adjustBargainingSignals(incident, leverage * .22, leverage * .08);
    changeAttitude(culpritRegion, thirdRegion.id, -.08, 'third_party_condemnation', currentTick);
  } else if (selected === COVERT_THIRD_PARTY_ACTIONS.MEDIATE) {
    const strength = clamp(.10 + assessment.neutralAccess * .14 + assessment.nuclearDanger * .08);
    incident.mediationSupport = clamp(incident.mediationSupport + strength);
    incident.escalationPressure = clamp((incident.escalationPressure || 0) - strength * .45);
    adjustBargainingSignals(incident, -strength * .12, -strength * .05);
    ensureInstitutionalCrisisState(victimPolity).pressure = clamp(ensureInstitutionalCrisisState(victimPolity).pressure - strength * .15);
    ensureInstitutionalCrisisState(culpritPolity).pressure = clamp(ensureInstitutionalCrisisState(culpritPolity).pressure - strength * .10);
    coolNuclearCrisis(victimRegion, culpritPolity.id, strength * .45, currentTick, 'mediation');
    coolNuclearCrisis(culpritRegion, victimPolity.id, strength * .45, currentTick, 'mediation');
  } else if (selected === COVERT_THIRD_PARTY_ACTIONS.URGE_RESTRAINT) {
    const strength = clamp(.08 + assessment.nuclearDanger * .16 + assessment.neutralAccess * .08);
    incident.restraintPressure = clamp(incident.restraintPressure + strength);
    incident.escalationPressure = clamp((incident.escalationPressure || 0) - strength * .35);
    adjustBargainingSignals(incident, -strength * .10, -strength * .04);
    coolNuclearCrisis(victimRegion, culpritPolity.id, strength * .35, currentTick, 'restraint');
    coolNuclearCrisis(culpritRegion, victimPolity.id, strength * .35, currentTick, 'restraint');
  } else if (selected === COVERT_THIRD_PARTY_ACTIONS.SANCTION_CULPRIT) {
    const severity = clamp(.18 + assessment.attribution * .22 + assessment.incidentSeverity * .12, .15, .55);
    for (const from of polityRegions(thirdPolity, regions)) {
      for (const target of polityRegions(culpritPolity, regions)) {
        const relation = relationToward(from, target.id);
        relation.tradeSanctionSeverity = Math.max(Number(relation.tradeSanctionSeverity) || 0, severity);
        relation.tradeSanctionUntilTick = Math.max(Number(relation.tradeSanctionUntilTick) || 0, currentTick + 52);
      }
    }
    incident.thirdPartyPressure = clamp(incident.thirdPartyPressure + severity * .28);
    adjustBargainingSignals(incident, severity * .06, severity * .10);
    record.sanctionSeverity = severity;
    changeAttitude(culpritRegion, thirdRegion.id, -.12, 'covert_incident_sanctions', currentTick);
  } else if (selected === COVERT_THIRD_PARTY_ACTIONS.BACK_CULPRIT) {
    incident.thirdPartyPressure = clamp(incident.thirdPartyPressure - .10);
    incident.restraintPressure = clamp(incident.restraintPressure + .05);
    adjustBargainingSignals(incident, -.03, -.05);
    changeAttitude(culpritRegion, thirdRegion.id, .06, 'third_party_backing', currentTick);
    changeAttitude(victimRegion, thirdRegion.id, -.05, 'third_party_backing_opponent', currentTick);
  }

  incident.thirdPartyInterventions.push(record);
  return { applied: true, action: selected, assessment, record };
}

export function tickCovertThirdPartyDiplomacy(polities, regions, currentTick, elapsedDays = 7, rng = Math.random, options = {}) {
  const events = [];
  for (const targetRegion of regions || []) {
    const incidents = targetRegion.covertIncidentEscalation?.incidents || [];
    for (const incident of incidents) {
      if (incident.status !== 'responded' || currentTick - (incident.responseTick || incident.createdTick || 0) < 1) continue;
      const victimPolity = (polities || []).find((polity) => polity.id === incident.targetActorId);
      const culpritPolity = (polities || []).find((polity) => polity.id === incident.attributedActorId);
      if (!victimPolity || !culpritPolity) continue;
      for (const thirdPolity of polities || []) {
        if ([victimPolity.id, culpritPolity.id].includes(thirdPolity.id)) continue;
        if (interventionAlreadyMade(incident, thirdPolity.id)) continue;
        const assessment = thirdPartyCovertAssessment(thirdPolity, victimPolity, culpritPolity, incident, regions);
        if (!assessment) continue;
        const strongest = assessment.scores[assessment.action] || 0;
        if (strongest < .56) continue;
        if (options.playerPolityId === thirdPolity.id) {
          if (!incident.thirdPartyPlayerPrompts) incident.thirdPartyPlayerPrompts = {};
          if (!incident.thirdPartyPlayerPrompts[thirdPolity.id]) {
            incident.thirdPartyPlayerPrompts[thirdPolity.id] = currentTick;
            events.push({ type: 'covert_incident_third_party_action_available', actorId: thirdPolity.id, incidentId: incident.id, victimActorId: victimPolity.id, culpritActorId: culpritPolity.id, assessment });
          }
          continue;
        }
        if (rng() > clamp(.30 + strongest * .55)) continue;
        const result = applyThirdPartyCovertAction(thirdPolity, victimPolity, culpritPolity, incident, regions, currentTick, assessment.action);
        if (result.applied) events.push({ type: 'covert_incident_third_party_action', actorId: thirdPolity.id, incidentId: incident.id, victimActorId: victimPolity.id, culpritActorId: culpritPolity.id, action: result.action, assessment });
      }
    }
  }
  return events;
}
