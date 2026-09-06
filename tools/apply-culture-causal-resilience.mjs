#!/usr/bin/env node
import fs from 'node:fs';

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`Missing ${label}`);
  return text.replace(oldText, newText);
}

const culturePath = new URL('../js/society/culture.js', import.meta.url);
let s = fs.readFileSync(culturePath, 'utf8');
const oldBlock = `function chronologicalIdentityFloor(calendarYear) {
  if (calendarYear <= 1500) return 0;
  const t = clamp01((calendarYear - 1500) / 526);
  return 0.18 * t * t * t;
}

function institutionalisation(region) {
  const education = clamp01(region.educationLevel || 0);
  const archives = clamp01(region.education?.archiveLevel || 0);
  const state = clamp01((region.governance?.integration || 0) + (region.governance?.relationship === 'core' ? 0.15 : 0));
  const techs = region.unlockedTechIds instanceof Set ? region.unlockedTechIds : new Set(region.unlockedTechIds || []);
  const massSchooling = techs.has('mass_schooling') ? 0.25 : 0;
  const print = techs.has('printing_press') ? 0.12 : 0;
  const massMedia = techs.has('radio') || techs.has('television') ? 0.18 : 0;
  const internet = techs.has('internet') ? 0.12 : 0;
  return clamp01(education * 0.25 + archives * 0.18 + state * 0.12 + massSchooling + print + massMedia + internet);
}

export function assimilationResistance(region, group, calendarYear = START_YEAR) {
  const identity = culturalIdentity(group?.identityId);
  const age = Math.max(0, calendarYear - (identity?.createdYear ?? START_YEAR));
  const ageMemory = Math.min(0.12, age / 5000 * 0.12);
  const resistance = 0.07 + clamp01(group?.identityStrength ?? 0.25) * 0.25 +
    institutionalisation(region) * 0.48 + ageMemory + chronologicalIdentityFloor(calendarYear);
  return Math.max(0.05, Math.min(0.96, resistance));
}
`;
const newBlock = `function culturalMemory(region) {
  const education = clamp01(region.educationLevel || 0);
  const archives = clamp01(region.education?.archiveLevel || 0);
  const techs = region.unlockedTechIds instanceof Set ? region.unlockedTechIds : new Set(region.unlockedTechIds || []);
  const writing = techs.has('writing') || region.education?.writingTradition ? 0.18 : 0;
  const print = techs.has('printing_press') ? 0.16 : 0;
  const massSchooling = techs.has('mass_schooling') ? 0.22 : 0;
  return clamp01(education * 0.14 + archives * 0.28 + writing + print + massSchooling);
}

function massCommunication(region) {
  const techs = region.unlockedTechIds instanceof Set ? region.unlockedTechIds : new Set(region.unlockedTechIds || []);
  return clamp01((techs.has('newspapers') ? 0.12 : 0) + (techs.has('radio') ? 0.2 : 0) +
    (techs.has('television') ? 0.22 : 0) + (techs.has('internet') ? 0.28 : 0));
}

function rightsAndRuleOfLaw(region) {
  const gov = region.governance || {};
  const explicit = clamp01(region.society?.ruleOfLaw ?? region.ruleOfLaw ?? 0);
  const minorityRights = clamp01(region.society?.minorityRights ?? 0);
  const legalConstraint = clamp01(region.society?.legalConstraintOnState ?? 0);
  const admin = clamp01(gov.administrativeControl || 0) * 0.12;
  return clamp01(explicit * 0.38 + minorityRights * 0.34 + legalConstraint * 0.22 + admin);
}

function persecutionMemory(region, group) {
  const state = ensureCultureState(region);
  state.persecutionMemory ||= {};
  return clamp01(state.persecutionMemory[group?.identityId] || 0);
}

export function recordCulturalPersecution(region, identityId, severity = 0.1, witnessedShare = 0) {
  if (!region || !identityId) return;
  const state = ensureCultureState(region);
  state.persecutionMemory ||= {};
  const media = massCommunication(region);
  const witnessed = clamp01(witnessedShare);
  const gain = clamp01(severity) * (0.35 + 0.4 * witnessed + 0.25 * media);
  state.persecutionMemory[identityId] = clamp01((state.persecutionMemory[identityId] || 0) + gain);
  const group = ensureRegionCulture(region).find((g) => g.identityId === identityId);
  if (group) group.identityStrength = clamp01(group.identityStrength + gain * 0.2);
  invalidateCulture(region);
}

export function coerciveCultureConstraint(region) {
  const society = region?.society || {};
  const rights = rightsAndRuleOfLaw(region);
  const internationalNorm = clamp01(society.internationalAtrocityNorm || 0);
  const treatyLaw = clamp01(society.internationalLawConstraint || 0);
  const publicAwareness = massCommunication(region);
  const externalEnforcement = clamp01(society.externalEnforcementRisk || 0);
  return clamp01(rights * 0.34 + internationalNorm * (0.18 + publicAwareness * 0.12) + treatyLaw * 0.2 + externalEnforcement * 0.16);
}

function institutionalisation(region) {
  return clamp01(culturalMemory(region) * 0.52 + massCommunication(region) * 0.3 + rightsAndRuleOfLaw(region) * 0.18);
}

export function assimilationResistance(region, group, calendarYear = START_YEAR) {
  // The calendar itself contributes nothing. Identity age is retained because
  // actual persistence is historical state, not an era bonus.
  const identity = culturalIdentity(group?.identityId);
  const age = Math.max(0, calendarYear - (identity?.createdYear ?? calendarYear));
  const ageMemory = Math.min(0.08, age / 5000 * 0.08);
  const resistance = 0.07 + clamp01(group?.identityStrength ?? 0.25) * 0.26 +
    culturalMemory(region) * 0.34 + massCommunication(region) * 0.12 +
    rightsAndRuleOfLaw(region) * 0.08 + persecutionMemory(region, group) * 0.22 + ageMemory;
  return Math.max(0.05, Math.min(0.96, resistance));
}
`;
s = replaceOnce(s, oldBlock, newBlock, 'calendar hardening block');
s = replaceOnce(s, '  region.cultureState.identityArchive ||= [];\n', '  region.cultureState.identityArchive ||= [];\n  region.cultureState.persecutionMemory ||= {};\n', 'persecution state');
s = replaceOnce(s, 'const pressure = 0.0006 + institutions * 0.0014 + chronologicalIdentityFloor(calendarYear) * 0.001;', 'const pressure = 0.0006 + institutions * 0.0016 + persecutionMemory(region, group) * 0.0008;', 'identity strengthening');
fs.writeFileSync(culturePath, s);

const testPath = new URL('./test-culture.mjs', import.meta.url);
let t = fs.readFileSync(testPath, 'utf8');
t = replaceOnce(t,
  'assimilationResistance, cultureAffinity, cultureHistory, cultureSummary,\n  initialiseRegionCulture, migrateCulture, tickCulture,',
  'assimilationResistance, coerciveCultureConstraint, cultureAffinity, cultureHistory, cultureSummary,\n  initialiseRegionCulture, migrateCulture, recordCulturalPersecution, tickCulture,', 'test imports');
const start = t.indexOf('// The requested modern-era hardening');
const end = t.indexOf('// Long-run evolution smoke/performance test.');
if (start < 0 || end < 0) throw new Error('Missing test replacement anchors');
const replacement = `// There is no calendar-era bonus. The tiny difference below is only the real
// age of the same identity, not 1926/1976/2026 as special dates.
const group = cultureSummary(egyptA)[0];
const y1926 = assimilationResistance(egyptA, group, 1926);
const y1976 = assimilationResistance(egyptA, group, 1976);
const y2026 = assimilationResistance(egyptA, group, 2026);
const ageSpread = y2026 - y1926;
assert(ageSpread >= 0 && ageSpread < 0.01, \`Identity-age effect too large: \${ageSpread}\`);
console.log('IDENTITY_AGE_ONLY', { y1926, y1976, y2026, spread: ageSpread });

// Institutions and recorded memory, not the date, dominate resilience.
egyptA.educationLevel = 1;
egyptA.education.archiveLevel = 1;
egyptA.education.writingTradition = true;
egyptA.unlockedTechIds = new Set(['writing', 'mass_schooling', 'printing_press', 'newspapers', 'radio', 'television', 'internet']);
egyptA.society = { ruleOfLaw: 0.9, minorityRights: 0.85, legalConstraintOnState: 0.8,
  internationalAtrocityNorm: 0.9, internationalLawConstraint: 0.85, externalEnforcementRisk: 0.7 };
const institutional = assimilationResistance(egyptA, group, 2026);
assert(institutional > y2026 + 0.25, \`Institutions are not materially hardening identity: \${institutional}\`);
const constraint = coerciveCultureConstraint(egyptA);
assert(constraint > 0.55, \`Coercive constraint too weak: \${constraint}\`);
console.log('INSTITUTIONAL_RESISTANCE', institutional, 'COERCIVE_CONSTRAINT', constraint);

const beforePersecution = assimilationResistance(egyptA, group, 2026);
recordCulturalPersecution(egyptA, group.identityId, 0.8, 0.9);
const afterPersecution = assimilationResistance(egyptA, cultureSummary(egyptA)[0], 2026);
assert(afterPersecution > beforePersecution, 'Persecution memory should increase identity resilience');
console.log('PERSECUTION_MEMORY_EFFECT', { beforePersecution, afterPersecution });

`;
t = t.slice(0, start) + replacement + t.slice(end);
fs.writeFileSync(testPath, t);
