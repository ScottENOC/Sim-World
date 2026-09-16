import { ensureInstitutionalGovernment, authorityFor } from './institutionalPowers.js?v=20260916-institutions1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function ensureInstitutionalCrisisState(polity) {
  ensureInstitutionalGovernment(polity);
  if (!polity.institutionalCrisis) polity.institutionalCrisis = { pressure: 0, legitimacyShock: 0, obstruction: 0, protests: 0, coupRisk: 0, revolutionRisk: 0, demands: [], history: [] };
  return polity.institutionalCrisis;
}

export function registerInstitutionalRefusal(polity, action, context = {}) {
  const state = ensureInstitutionalCrisisState(polity);
  const publicSupport = clamp(context.publicSupport ?? 0.5);
  const executivePressure = clamp(context.executivePressure ?? 0.5);
  const authority = context.power ? authorityFor(polity, context.power) : null;
  const institutionalStrength = clamp(context.institutionalStrength ?? (authority?.entrenchment || 0.5));
  const increment = 0.03 + executivePressure * 0.05 + institutionalStrength * 0.04;
  state.obstruction = clamp(state.obstruction + increment);
  state.pressure = clamp(state.pressure + increment * (0.7 + publicSupport * 0.3));
  state.history.push({ type: 'refusal', action, tick: context.tick ?? null, pressure: state.pressure });
  if (state.history.length > 40) state.history.shift();
  return state;
}

export function makeInstitutionalDemand(polity, demand, context = {}) {
  const state = ensureInstitutionalCrisisState(polity);
  const existing = state.demands.find((item) => item.type === demand.type && item.power === demand.power && item.status === 'active');
  if (existing) return existing;
  const item = { id: `${demand.type}:${demand.power || 'general'}:${context.tick ?? state.history.length}`, type: demand.type, power: demand.power || null, institution: demand.institution || null, support: clamp(demand.support ?? 0.5), status: 'active', createdTick: context.tick ?? null };
  state.demands.push(item);
  state.pressure = clamp(state.pressure + item.support * 0.08);
  return item;
}

export function resolveInstitutionalDemand(polity, demandId, accepted, context = {}) {
  const state = ensureInstitutionalCrisisState(polity);
  const demand = state.demands.find((item) => item.id === demandId);
  if (!demand || demand.status !== 'active') return null;
  demand.status = accepted ? 'accepted' : 'rejected';
  demand.resolvedTick = context.tick ?? null;
  if (accepted) {
    state.pressure = clamp(state.pressure - 0.12 * demand.support);
    state.obstruction = clamp(state.obstruction - 0.1 * demand.support);
  } else {
    state.pressure = clamp(state.pressure + 0.12 * demand.support);
    state.protests = clamp(state.protests + 0.08 * demand.support);
  }
  return demand;
}

export function attemptCoercivePowerReclamation(polity, power, context = {}, rng = Math.random) {
  const state = ensureInstitutionalCrisisState(polity);
  const authority = authorityFor(polity, power);
  const entrenchment = clamp(authority.entrenchment);
  const coerciveCapacity = clamp(context.coerciveCapacity ?? 0.5);
  const eliteSupport = clamp(context.eliteSupport ?? 0.5);
  const publicSupport = clamp(context.publicSupport ?? 0.35);
  const successChance = clamp(0.2 + coerciveCapacity * 0.45 + eliteSupport * 0.25 - entrenchment * 0.5 - publicSupport * 0.15, 0.03, 0.9);
  const success = rng() < successChance;
  const shock = clamp(0.12 + entrenchment * 0.25 + (1 - publicSupport) * 0.08);
  state.legitimacyShock = clamp(state.legitimacyShock + shock);
  state.pressure = clamp(state.pressure + shock * (success ? 0.7 : 1));
  state.protests = clamp(state.protests + shock * publicSupport);
  state.coupRisk = clamp(state.coupRisk + shock * eliteSupport * (success ? 0.45 : 0.7));
  state.revolutionRisk = clamp(state.revolutionRisk + shock * publicSupport * (success ? 0.65 : 0.45));
  state.history.push({ type: 'coercive_reclamation', power, success, tick: context.tick ?? null, successChance });
  return { success, successChance, state };
}

export function tickInstitutionalCrisis(polity, context = {}) {
  const state = ensureInstitutionalCrisisState(polity);
  const grievance = clamp(context.grievance);
  const politicalVoice = clamp(context.politicalVoice);
  const repression = clamp(context.repression);
  const economicStress = clamp(context.economicStress);
  const activeDemandSupport = state.demands.filter((d) => d.status === 'active').reduce((sum, d) => sum + d.support, 0);
  state.pressure = clamp(state.pressure * 0.985 + grievance * 0.025 + economicStress * 0.018 + activeDemandSupport * 0.006 - politicalVoice * 0.018);
  state.protests = clamp(state.protests * 0.97 + Math.max(0, state.pressure - 0.45) * (0.03 + politicalVoice * 0.025));
  state.coupRisk = clamp(state.coupRisk * 0.985 + Math.max(0, state.pressure - 0.62) * repression * 0.025);
  state.revolutionRisk = clamp(state.revolutionRisk * 0.985 + Math.max(0, state.pressure - 0.58) * grievance * 0.035 + state.protests * 0.008);
  return { ...state, crisis: state.pressure >= 0.65, severeCrisis: state.pressure >= 0.82 || state.coupRisk >= 0.55 || state.revolutionRisk >= 0.55 };
}
