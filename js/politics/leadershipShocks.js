import { ensureInstitutionalCrisisState } from './institutionalCrises.js?v=20260920-leadership-shock1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const average = (values) => values.length ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length : 0;

function territories(polity, regions) {
  return (regions || []).filter((region) => region.governance?.sovereignPolityId === polity?.id);
}

function victimImportance(vip = {}) {
  if (vip.role === 'ruler' || vip.role === 'head_of_government' || vip.role === 'head_of_state') return 1;
  if (vip.role === 'senior_leadership') return .82;
  if (vip.role === 'governor' || vip.role === 'local_ruler') return .66;
  return .52;
}

function successionResilience(polity, regions) {
  const owned = territories(polity, regions);
  const adminControl = average(owned.map(r => r.governance?.administrativeControl ?? .5));
  const officialdom = clamp(polity?.administration?.officialdom || 0);
  const delegation = clamp(polity?.administration?.delegation || 0);
  const offices = Object.values(polity?.stateAdministration?.offices || {});
  const officeCoverage = clamp(offices.length / 5);
  const officeCompetence = average(offices.map(o => o.competence ?? .5));
  return clamp(.16 + officialdom * .26 + delegation * .16 + adminControl * .20 + officeCoverage * .10 + officeCompetence * .12);
}

function eliteFracture(polity) {
  const court = polity?.stateAdministration?.court || {};
  const factions = Object.values(polity?.stateAdministration?.factions || {});
  const offices = Object.values(polity?.stateAdministration?.offices || {});
  const factionalism = clamp(court.factionalism ?? .25);
  const factionGrievance = factions.length ? average(factions.map(f => (f.grievance || 0) * (.45 + (f.power || 0) * .55))) : .2;
  const lowOfficeLoyalty = offices.length ? 1 - average(offices.map(o => clamp(o.loyalty ?? .55))) : .35;
  return clamp(factionalism * .48 + factionGrievance * .30 + lowOfficeLoyalty * .22);
}

function coupNetwork(polity) {
  const operations = Object.values(polity?.foreignPoliticalIntervention?.operations || {}).filter(op => op.mode === 'coup');
  if (!operations.length) return 0;
  return clamp(Math.max(...operations.map(op => clamp((op.eliteContacts || 0) * .58 + (op.network || 0) * .30 + (op.materialSupport || 0) * .12))));
}

function publicAttachment(polity, regions) {
  const owned = territories(polity, regions);
  const satisfaction = average(owned.map(r => r.popularWellbeing?.satisfaction ?? .5));
  const grievance = average(owned.map(r => r.popularWellbeing?.grievance ?? .35));
  const legitimacy = clamp(polity?.continuity?.legitimacy ?? polity?.administration?.legitimacy ?? .35);
  return clamp(legitimacy * .52 + satisfaction * .30 + (1 - grievance) * .18);
}

export function leadershipShockAssessment(polity, regions, { vip = {}, removedBy = 'capture', attributed = false } = {}) {
  const importance = victimImportance(vip);
  const succession = successionResilience(polity, regions);
  const fracture = eliteFracture(polity);
  const network = coupNetwork(polity);
  const attachment = publicAttachment(polity, regions);
  const lethal = removedBy === 'assassination' ? 1 : .42;
  const foreignAttribution = attributed ? 1 : 0;

  const coupOpening = clamp(importance * .20 + fracture * .28 + network * .27 + (1 - succession) * .25 + (removedBy === 'capture' ? .04 : 0));
  const martyrBacklash = clamp(importance * .24 + attachment * .29 + succession * .13 + foreignAttribution * .24 + lethal * .10 - fracture * .12 - network * .08);
  const ambiguity = clamp(1 - Math.abs(coupOpening - martyrBacklash) * 1.45);
  const outcome = coupOpening > martyrBacklash + .09 ? 'coup_opening'
    : martyrBacklash > coupOpening + .11 ? 'martyr_backlash'
      : 'leadership_crisis';
  return { outcome, coupOpening, martyrBacklash, ambiguity, importance, successionResilience: succession, eliteFracture: fracture, coupNetwork: network, publicAttachment: attachment, attributed: foreignAttribution, lethal };
}

export function registerLeadershipShock(polity, regions, event, currentTick) {
  if (!polity) return null;
  const assessment = leadershipShockAssessment(polity, regions, event);
  const crisis = ensureInstitutionalCrisisState(polity);
  polity.leadershipShock ||= { coupOpening: 0, martyrBacklash: 0, pressure: 0, history: [] };
  const state = polity.leadershipShock;
  const severity = clamp(.18 + assessment.importance * .34 + (event.removedBy === 'assassination' ? .16 : .08));

  state.coupOpening = clamp(Math.max(state.coupOpening || 0, assessment.coupOpening * severity * 1.5));
  state.martyrBacklash = clamp(Math.max(state.martyrBacklash || 0, assessment.martyrBacklash * severity * 1.45));
  state.pressure = clamp(Math.max(state.pressure || 0, severity * (.55 + assessment.ambiguity * .35)));
  state.lastTick = currentTick;
  state.lastOutcome = assessment.outcome;
  state.history ||= [];
  state.history.push({ tick: currentTick, removedBy: event.removedBy, vip: event.vip || null, sourceActorId: event.sourceActorId || null, attributed: !!event.attributed, assessment });
  if (state.history.length > 20) state.history.shift();

  crisis.pressure = clamp(crisis.pressure + state.pressure * .20);
  crisis.legitimacyShock = clamp(crisis.legitimacyShock + severity * .12);
  if (assessment.outcome === 'coup_opening') {
    crisis.coupRisk = clamp(crisis.coupRisk + assessment.coupOpening * severity * .32);
    crisis.obstruction = clamp(crisis.obstruction + assessment.eliteFracture * severity * .15);
  } else if (assessment.outcome === 'martyr_backlash') {
    crisis.coupRisk = clamp(crisis.coupRisk * (1 - assessment.martyrBacklash * .16));
    crisis.protests = clamp(crisis.protests + assessment.martyrBacklash * severity * .08);
    polity.administration ||= {};
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + assessment.martyrBacklash * severity * .10);
    if (polity.continuity) polity.continuity.legitimacy = clamp((polity.continuity.legitimacy || 0) + assessment.martyrBacklash * severity * .08);
  } else {
    crisis.coupRisk = clamp(crisis.coupRisk + assessment.coupOpening * severity * .13);
    crisis.protests = clamp(crisis.protests + assessment.martyrBacklash * severity * .05);
  }
  return { ...assessment, severity };
}

export function tickLeadershipShock(polity, elapsedDays = 30) {
  const state = polity?.leadershipShock;
  if (!state) return null;
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  state.coupOpening = clamp((state.coupOpening || 0) * Math.exp(-years / 1.25));
  state.martyrBacklash = clamp((state.martyrBacklash || 0) * Math.exp(-years / 1.8));
  state.pressure = clamp((state.pressure || 0) * Math.exp(-years / 1.1));
  return state;
}

export function processPendingLeadershipShocks(polities, regions, currentTick, elapsedDays = 30) {
  const events = [];
  for (const polity of polities || []) tickLeadershipShock(polity, elapsedDays);
  for (const region of regions || []) {
    const pending = region.governance?.pendingLeadershipShocks;
    if (!Array.isArray(pending) || !pending.length) continue;
    const polity = (polities || []).find(candidate => candidate.id === region.governance?.sovereignPolityId);
    if (!polity) continue;
    for (const shock of pending.splice(0)) {
      const assessment = registerLeadershipShock(polity, regions, shock, shock.tick ?? currentTick);
      if (!assessment) continue;
      events.push({
        type: 'leadership_shock',
        polityId: polity.id,
        regionId: region.id,
        removedBy: shock.removedBy,
        vip: shock.vip || null,
        sourceActorId: shock.sourceActorId || null,
        attributed: !!shock.attributed,
        outcome: assessment.outcome,
        assessment,
      });
    }
  }
  return events;
}

export function leadershipShockModifiers(polity) {
  const state = polity?.leadershipShock || {};
  return {
    coupOpening: clamp(state.coupOpening || 0),
    martyrBacklash: clamp(state.martyrBacklash || 0),
    pressure: clamp(state.pressure || 0),
    lastOutcome: state.lastOutcome || null,
  };
}
