const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const GOVERNMENT_POWERS = Object.freeze({
  legislation: { label: 'Lawmaking', defaultHolder: 'executive' },
  taxation: { label: 'Taxation', defaultHolder: 'executive' },
  spending: { label: 'Government spending', defaultHolder: 'executive' },
  offensiveWar: { label: 'Offensive war', defaultHolder: 'executive' },
  treaties: { label: 'Treaties', defaultHolder: 'executive' },
  appointMinisters: { label: 'Ministerial appointments', defaultHolder: 'executive' },
  appointJudges: { label: 'Judicial appointments', defaultHolder: 'executive' },
  detention: { label: 'Detention', defaultHolder: 'executive' },
  prosecution: { label: 'Prosecution', defaultHolder: 'executive' },
  adjudication: { label: 'Judicial decisions', defaultHolder: 'executive' },
  intelligenceOperations: { label: 'Intelligence operations', defaultHolder: 'executive' },
  economicRegulation: { label: 'Economic regulation', defaultHolder: 'executive' },
});

export const INSTITUTIONS = Object.freeze(['executive', 'parliament', 'judiciary']);

export function ensureInstitutionalGovernment(polity) {
  polity.institutions ||= {};
  polity.institutions.executive ||= { established: true, strength: 1, independence: 1, appointment: 'inherent' };
  polity.institutions.parliament ||= { established: false, strength: 0, independence: 0, representation: 0, appointment: 'none' };
  polity.institutions.judiciary ||= { established: false, strength: 0, independence: 0, appointment: 'executive' };
  polity.governmentPowers ||= {};
  for (const [power, definition] of Object.entries(GOVERNMENT_POWERS)) {
    polity.governmentPowers[power] ||= { holder: definition.defaultHolder, consentRequiredFrom: [], entrenched: 0 };
  }
  return polity.institutions;
}

export function establishParliament(polity, options = {}) {
  ensureInstitutionalGovernment(polity);
  const parliament = polity.institutions.parliament;
  parliament.established = true;
  parliament.strength = Math.max(parliament.strength, clamp(options.strength ?? 0.25));
  parliament.independence = Math.max(parliament.independence, clamp(options.independence ?? 0.25));
  parliament.representation = Math.max(parliament.representation, clamp(options.representation ?? 0.2));
  parliament.appointment = options.appointment || parliament.appointment || 'elite_selection';
  return parliament;
}

export function establishJudiciary(polity, options = {}) {
  ensureInstitutionalGovernment(polity);
  const judiciary = polity.institutions.judiciary;
  judiciary.established = true;
  judiciary.strength = Math.max(judiciary.strength, clamp(options.strength ?? 0.2));
  judiciary.independence = Math.max(judiciary.independence, clamp(options.independence ?? 0.15));
  judiciary.appointment = options.appointment || judiciary.appointment || 'executive';
  return judiciary;
}

export function delegateGovernmentPower(polity, power, holder, options = {}) {
  ensureInstitutionalGovernment(polity);
  if (!GOVERNMENT_POWERS[power]) return { changed: false, reason: 'unknown_power' };
  if (!INSTITUTIONS.includes(holder)) return { changed: false, reason: 'unknown_institution' };
  if (holder !== 'executive' && !polity.institutions[holder]?.established) return { changed: false, reason: 'institution_not_established' };
  const record = polity.governmentPowers[power];
  const previousHolder = record.holder;
  record.holder = holder;
  record.entrenched = clamp(Math.max(record.entrenched || 0, options.entrenched ?? 0.05));
  if (options.consentRequiredFrom) record.consentRequiredFrom = [...new Set(options.consentRequiredFrom.filter((id) => INSTITUTIONS.includes(id)))];
  return { changed: previousHolder !== holder, previousHolder, holder, power };
}

export function requireInstitutionalConsent(polity, power, institution, required = true) {
  ensureInstitutionalGovernment(polity);
  if (!GOVERNMENT_POWERS[power] || !INSTITUTIONS.includes(institution)) return false;
  const record = polity.governmentPowers[power];
  const set = new Set(record.consentRequiredFrom || []);
  if (required) set.add(institution); else set.delete(institution);
  record.consentRequiredFrom = [...set];
  return true;
}

export function authorityFor(polity, power) {
  ensureInstitutionalGovernment(polity);
  const record = polity.governmentPowers[power];
  const holder = record.holder || 'executive';
  const consent = (record.consentRequiredFrom || []).filter((institution) => polity.institutions[institution]?.established);
  return { power, holder, consentRequiredFrom: consent, entrenched: clamp(record.entrenched || 0) };
}

export function canExecutiveAct(polity, power, approvals = []) {
  const authority = authorityFor(polity, power);
  const approved = new Set(approvals);
  if (authority.holder !== 'executive' && !approved.has(authority.holder)) {
    return { allowed: false, reason: 'power_delegated', required: authority.holder, authority };
  }
  for (const institution of authority.consentRequiredFrom) {
    if (!approved.has(institution)) return { allowed: false, reason: 'consent_required', required: institution, authority };
  }
  return { allowed: true, authority };
}

export function attemptReclaimGovernmentPower(polity, power, options = {}) {
  ensureInstitutionalGovernment(polity);
  const record = polity.governmentPowers[power];
  if (!record) return { changed: false, reason: 'unknown_power' };
  if (record.holder === 'executive') return { changed: false, reason: 'already_executive' };
  const institutionalResistance = clamp(record.entrenched || 0) * (0.55 + clamp(polity.institutions[record.holder]?.independence || 0) * 0.45);
  const politicalCapital = clamp(options.politicalCapital ?? 0);
  if (!options.force && politicalCapital < institutionalResistance) {
    return { changed: false, reason: 'institutional_resistance', requiredPoliticalCapital: institutionalResistance };
  }
  const previousHolder = record.holder;
  record.holder = 'executive';
  record.consentRequiredFrom = [];
  return { changed: true, previousHolder, politicalCost: institutionalResistance, coercive: Boolean(options.force) };
}

export function institutionalPoliticalVoice(polity) {
  ensureInstitutionalGovernment(polity);
  const parliament = polity.institutions.parliament;
  const judiciary = polity.institutions.judiciary;
  const parliamentaryVoice = parliament.established
    ? clamp(parliament.strength * 0.35 + parliament.independence * 0.25 + parliament.representation * 0.4)
    : 0;
  const legalOutlet = judiciary.established ? clamp(judiciary.strength * 0.35 + judiciary.independence * 0.65) : 0;
  const nonExecutivePowers = Object.values(polity.governmentPowers).filter((record) => record.holder !== 'executive').length;
  const sharedPowers = Object.values(polity.governmentPowers).filter((record) => (record.consentRequiredFrom || []).length > 0).length;
  return clamp(parliamentaryVoice * 0.62 + legalOutlet * 0.18 + nonExecutivePowers * 0.018 + sharedPowers * 0.012);
}

export function describeGovernmentInstitutions(polity) {
  ensureInstitutionalGovernment(polity);
  const executivePowers = [];
  const parliamentaryPowers = [];
  const judicialPowers = [];
  for (const power of Object.keys(GOVERNMENT_POWERS)) {
    const holder = polity.governmentPowers[power].holder;
    if (holder === 'parliament') parliamentaryPowers.push(power);
    else if (holder === 'judiciary') judicialPowers.push(power);
    else executivePowers.push(power);
  }
  return { executivePowers, parliamentaryPowers, judicialPowers, politicalVoice: institutionalPoliticalVoice(polity) };
}
