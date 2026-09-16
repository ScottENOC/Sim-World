import { polityById } from './polities.js?v=20260916-institution-integration1';
import { ensureInstitutionalGovernment, institutionalPoliticalVoice, requireInstitutionalConsent } from './institutionalPowers.js?v=20260916-force1';
import { ensureInstitutionalCrisisState, makeInstitutionalDemand, resolveInstitutionalDemand, tickInstitutionalCrisis } from './institutionalCrises.js?v=20260916-institution-integration1';
import { polityPopularWellbeing } from './popularWellbeing.js?v=20260916-institution-integration1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const POWER_DEMANDS = ['taxation', 'spending', 'offensiveWar', 'limitedForce', 'legislation'];

export function institutionalContextForPolity(polity, regions = []) {
  const wellbeing = polityPopularWellbeing(polity.id, regions);
  const court = polity.stateAdministration?.court || {};
  const legitimacy = clamp(polity.continuity?.legitimacy ?? polity.administration?.legitimacy ?? 0.3);
  return {
    grievance: clamp(wellbeing.grievance),
    politicalVoice: clamp(wellbeing.politicalVoice || institutionalPoliticalVoice(polity)),
    repression: clamp(polity.institutionalPolicy?.repression ?? Math.max(0, 0.45 - wellbeing.politicalVoice * 0.3)),
    economicStress: clamp(1 - (wellbeing.satisfaction ?? 0.5)),
    publicSupport: clamp(wellbeing.satisfaction ?? 0.5),
    eliteSupport: clamp(1 - (court.factionalism ?? 0.25)),
    coerciveCapacity: clamp((polity.administration?.officialdom || 0) * 0.35 + legitimacy * 0.45 + (1 - (court.administrativeOverstretch || 0)) * 0.2),
  };
}

function maybeGenerateDemand(polity, state, context, currentTick) {
  const parliament = polity.institutions?.parliament;
  if (!parliament?.established || state.pressure < 0.5 || state.demands.some((d) => d.status === 'active')) return null;
  const power = POWER_DEMANDS.find((id) => {
    const record = polity.governmentPowers?.[id];
    return record?.holder === 'executive' && !(record.consentRequiredFrom || []).includes('parliament');
  });
  if (!power) return null;
  const support = clamp(0.35 + state.pressure * 0.3 + parliament.representation * 0.2 + context.grievance * 0.15);
  return makeInstitutionalDemand(polity, { type: 'expand_institutional_control', institution: 'parliament', power, support }, { tick: currentTick });
}

export function tickInstitutionalPolitics(polities, regions, currentTick, elapsedDays = 30, options = {}) {
  const events = [];
  const scale = Math.max(0.05, Number(elapsedDays) / 30);
  for (const polity of polities || []) {
    ensureInstitutionalGovernment(polity);
    const state = ensureInstitutionalCrisisState(polity);
    const before = { pressure: state.pressure, coupRisk: state.coupRisk, revolutionRisk: state.revolutionRisk };
    const context = institutionalContextForPolity(polity, regions);
    const result = tickInstitutionalCrisis(polity, { grievance: context.grievance * scale, politicalVoice: context.politicalVoice * scale, repression: context.repression, economicStress: context.economicStress * scale });
    const demand = maybeGenerateDemand(polity, state, context, currentTick);
    if (demand) events.push({ type: 'institutional_demand', polityId: polity.id, demand, playerRelevant: polity.id === options.playerPolityId });
    if (before.pressure < 0.65 && result.pressure >= 0.65) events.push({ type: 'institutional_crisis', polityId: polity.id, pressure: result.pressure, playerRelevant: polity.id === options.playerPolityId });
    if (before.coupRisk < 0.55 && result.coupRisk >= 0.55) events.push({ type: 'institutional_coup_risk', polityId: polity.id, risk: result.coupRisk, playerRelevant: polity.id === options.playerPolityId });
    if (before.revolutionRisk < 0.55 && result.revolutionRisk >= 0.55) events.push({ type: 'institutional_revolution_risk', polityId: polity.id, risk: result.revolutionRisk, playerRelevant: polity.id === options.playerPolityId });
  }
  return events;
}

export function institutionalStatusForRegion(region, polities, regions = []) {
  const polity = polityById(polities, region?.governance?.sovereignPolityId || region?.polityId);
  if (!polity) return null;
  ensureInstitutionalGovernment(polity);
  const crisis = ensureInstitutionalCrisisState(polity);
  return { polity, crisis, context: institutionalContextForPolity(polity, regions) };
}

export function resolvePlayerInstitutionalDemand(polity, demandId, accepted, currentTick) {
  const demand = ensureInstitutionalCrisisState(polity).demands.find((item) => item.id === demandId && item.status === 'active');
  if (!demand) return null;
  if (accepted && demand.type === 'expand_institutional_control' && demand.power && demand.institution) requireInstitutionalConsent(polity, demand.power, demand.institution, true);
  return resolveInstitutionalDemand(polity, demandId, accepted, { tick: currentTick });
}

export function maybeCreateInstitutionalDemand(polity, institution, power, support, currentTick) {
  return makeInstitutionalDemand(polity, { type: 'expand_institutional_control', institution, power, support }, { tick: currentTick });
}
