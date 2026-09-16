import { authorityFor, canExecutiveAct, ensureInstitutionalGovernment } from './institutionalPowers.js?v=20260916-institutions1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const GOVERNMENT_ACTIONS = Object.freeze({
  launch_offensive_war: { power: 'offensiveWar', label: 'Launch offensive military action' },
  change_taxation: { power: 'taxation', label: 'Change taxation' },
  change_spending: { power: 'spending', label: 'Change government spending' },
  change_economic_policy: { power: 'economicRegulation', label: 'Change economic regulation' },
  change_military_policy: { power: 'legislation', label: 'Change standing military policy' },
  sign_treaty: { power: 'treaties', label: 'Conclude a treaty' },
  detain_political_actor: { power: 'detention', label: 'Detain a political actor' },
  prosecute_political_actor: { power: 'prosecution', label: 'Prosecute a political actor' },
  order_intelligence_operation: { power: 'intelligenceOperations', label: 'Order an intelligence operation' },
  appoint_judge: { power: 'appointJudges', label: 'Appoint a judge' },
});

export function governmentActionAuthority(polity, action) {
  const definition = GOVERNMENT_ACTIONS[action];
  if (!definition) return { valid: false, reason: 'unknown_action', action };
  ensureInstitutionalGovernment(polity);
  return { valid: true, action, label: definition.label, ...authorityFor(polity, definition.power) };
}

export function requestExecutiveAction(polity, action, approvals = []) {
  const definition = GOVERNMENT_ACTIONS[action];
  if (!definition) return { allowed: false, reason: 'unknown_action', action };
  const result = canExecutiveAct(polity, definition.power, approvals);
  return { ...result, action, power: definition.power, label: definition.label };
}

function parliamentSupport(polity, action, context = {}) {
  const parliament = polity.institutions?.parliament || {};
  const wellbeing = context.wellbeing || {};
  const threat = clamp(context.threat);
  const defensive = Boolean(context.defensive);
  const hostility = clamp(context.hostility);
  const fiscalStress = clamp(context.fiscalStress);
  const publicSupport = clamp(context.publicSupport ?? 0.5);
  const representation = clamp(parliament.representation);
  let support = 0.5 + (publicSupport - 0.5) * (0.35 + representation * 0.45);
  if (action === 'launch_offensive_war') support += defensive ? 0.35 : threat * 0.18 + hostility * 0.12 - 0.2 - fiscalStress * 0.16;
  if (action === 'change_taxation') support += fiscalStress * 0.2 - clamp(wellbeing.grievance) * 0.22;
  if (action === 'detain_political_actor' || action === 'prosecute_political_actor') support -= parliament.independence * 0.15;
  return clamp(support);
}

function judiciarySupport(polity, action, context = {}) {
  const judiciary = polity.institutions?.judiciary || {};
  const evidence = clamp(context.evidence ?? 0.5);
  const legalBasis = clamp(context.legalBasis ?? 0.5);
  const emergency = clamp(context.emergency);
  let support = legalBasis * 0.48 + evidence * 0.4 + emergency * 0.12;
  if (action === 'detain_political_actor') support -= clamp(judiciary.independence) * 0.08;
  return clamp(support);
}

export function chooseNpcInstitutionalApprovals(polity, action, context = {}, rng = Math.random) {
  const authority = governmentActionAuthority(polity, action);
  if (!authority.valid) return { approved: false, approvals: [], reason: authority.reason };
  const required = new Set(authority.consentRequiredFrom || []);
  if (authority.holder !== 'executive') required.add(authority.holder);
  const approvals = [];
  const decisions = [];
  for (const institution of required) {
    let support = 0;
    if (institution === 'parliament') support = parliamentSupport(polity, action, context);
    else if (institution === 'judiciary') support = judiciarySupport(polity, action, context);
    else support = 1;
    const approved = rng() < support;
    decisions.push({ institution, support, approved });
    if (approved) approvals.push(institution);
  }
  const result = requestExecutiveAction(polity, action, approvals);
  return { approved: result.allowed, approvals, decisions, result };
}

export function institutionalActionPrompt(polity, action) {
  const authority = governmentActionAuthority(polity, action);
  if (!authority.valid) return authority;
  const required = [...new Set([
    ...(authority.holder !== 'executive' ? [authority.holder] : []),
    ...(authority.consentRequiredFrom || []),
  ])];
  return {
    ...authority,
    executiveCanActAlone: required.length === 0,
    requiredInstitutions: required,
    message: required.length === 0
      ? `The executive may ${authority.label.toLowerCase()} without another institution's consent.`
      : `${required.map((name) => name[0].toUpperCase() + name.slice(1)).join(' and ')} must approve before the government can ${authority.label.toLowerCase()}.`,
  };
}
