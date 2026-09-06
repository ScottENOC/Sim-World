#!/usr/bin/env node
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { startingCultureFor } from '../js/society/cultureSeeds.js';
import {
  assimilationResistance, coerciveCultureConstraint, cultureAffinity, cultureHistory, cultureSummary,
  initialiseRegionCulture, migrateCulture, recordCulturalPersecution, tickCulture,
} from '../js/society/culture.js';

const meta = JSON.parse(fs.readFileSync(new URL('../data/world/regions.meta.json', import.meta.url), 'utf8')).regions;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockRegion(id, name, centroid) {
  return {
    id, name, centroid, areaSqKm: 1000, neighbors: [], population: 1000,
    cultureGroups: [], cultureState: null, cultureFamiliarity: {},
    educationLevel: 0, education: { archiveLevel: 0 },
    governance: { relationship: 'core', integration: 0, sovereignPolityId: id },
    controllingActorId: id, unlockedTechIds: new Set(),
  };
}

// Historical seed coverage and transparency.
const seedCounts = new Map();
let fallback = 0;
for (const m of meta) {
  const seed = startingCultureFor(m);
  seedCounts.set(seed.id, (seedCounts.get(seed.id) || 0) + 1);
  if (seed.id.startsWith('local_lba_')) fallback += 1;
}
assert(meta.length === 418, `Expected 418 live land regions, got ${meta.length}`);
assert(fallback <= 25, `Too many regions fell through to local fallback cultures: ${fallback}`);
console.log('SEED_COUNTS', Object.fromEntries([...seedCounts.entries()].sort((a, b) => b[1] - a[1])));
console.log('FALLBACK_REGIONS', fallback);

// Same identity should be culturally closer than unrelated starting traditions.
const egyptA = mockRegion('egypt-a', 'Lower Egypt', [31, 30]);
const egyptB = mockRegion('egypt-b', 'Upper Egypt', [32, 26]);
const britain = mockRegion('britain', 'Kent', [0.7, 51.2]);
initialiseRegionCulture(egyptA);
initialiseRegionCulture(egyptB);
initialiseRegionCulture(britain);
const sameAffinity = cultureAffinity(egyptA, egyptB);
const distantAffinity = cultureAffinity(egyptA, britain);
assert(sameAffinity > distantAffinity + 0.3, `Affinity separation too weak: same=${sameAffinity}, distant=${distantAffinity}`);
console.log('AFFINITY', { sameAffinity, distantAffinity });

// Migration carries active identity and ancestry without deleting source identity.
britain.population = 1100; // migration routine expects population after demographic arrival
migrateCulture(egyptA, britain, 100);
const britSummary = cultureSummary(britain);
assert(britSummary.some((g) => g.identityId === 'egyptian_lba' && g.share > 0.05), 'Migrant Egyptian identity not represented in destination');
assert(cultureSummary(egyptA)[0].identityId === 'egyptian_lba', 'Migration unexpectedly changed source identity');
console.log('MIGRATION_SUMMARY', britSummary);

// There is no calendar-era bonus. The tiny difference below is only the real
// age of the same identity, not 1926/1976/2026 as special dates.
const group = cultureSummary(egyptA)[0];
const y1926 = assimilationResistance(egyptA, group, 1926);
const y1976 = assimilationResistance(egyptA, group, 1976);
const y2026 = assimilationResistance(egyptA, group, 2026);
const ageSpread = y2026 - y1926;
assert(ageSpread >= 0 && ageSpread < 0.01, `Identity-age effect too large: ${ageSpread}`);
console.log('IDENTITY_AGE_ONLY', { y1926, y1976, y2026, spread: ageSpread });

// Institutions and recorded memory, not the date, dominate resilience.
egyptA.educationLevel = 1;
egyptA.education.archiveLevel = 1;
egyptA.education.writingTradition = true;
egyptA.unlockedTechIds = new Set(['writing', 'mass_schooling', 'printing_press', 'newspapers', 'radio', 'television', 'internet']);
egyptA.society = { ruleOfLaw: 0.9, minorityRights: 0.85, legalConstraintOnState: 0.8,
  internationalAtrocityNorm: 0.9, internationalLawConstraint: 0.85, externalEnforcementRisk: 0.7 };
const institutional = assimilationResistance(egyptA, group, 2026);
assert(institutional > y2026 + 0.25, `Institutions are not materially hardening identity: ${institutional}`);
const constraint = coerciveCultureConstraint(egyptA);
assert(constraint > 0.55, `Coercive constraint too weak: ${constraint}`);
console.log('INSTITUTIONAL_RESISTANCE', institutional, 'COERCIVE_CONSTRAINT', constraint);

const beforePersecution = assimilationResistance(egyptA, group, 2026);
recordCulturalPersecution(egyptA, group.identityId, 0.8, 0.9);
const afterPersecution = assimilationResistance(egyptA, cultureSummary(egyptA)[0], 2026);
assert(afterPersecution > beforePersecution, 'Persecution memory should increase identity resilience');
console.log('PERSECUTION_MEMORY_EFFECT', { beforePersecution, afterPersecution });

// Long-run evolution smoke/performance test. A mixed region should remain normalised,
// preserve ancestry and avoid unbounded identity proliferation.
const a = mockRegion('mixed-a', 'Mixed Coast', [10, 44]);
const b = mockRegion('mixed-b', 'Mixed Interior', [11, 44.5]);
a.neighbors = [b.id]; b.neighbors = [a.id];
initialiseRegionCulture(a); initialiseRegionCulture(b);
b.population = 1200;
migrateCulture(a, b, 200);
const start = performance.now();
for (let year = 0; year < 800; year += 1) tickCulture([a, b], 365.2425);
const elapsed = performance.now() - start;
for (const region of [a, b]) {
  const summary = cultureSummary(region);
  const sum = summary.reduce((s, g) => s + g.share, 0);
  assert(Math.abs(sum - 1) < 1e-9, `Culture shares not normalised in ${region.id}: ${sum}`);
  assert(summary.length <= 20, `Identity groups proliferated excessively in ${region.id}: ${summary.length}`);
  for (const cohort of summary) {
    const ancestryTotal = Object.values(cohort.ancestry).reduce((s, v) => s + v, 0);
    assert(Math.abs(ancestryTotal - 1) < 1e-6, `Ancestry not normalised for ${cohort.identityId}`);
  }
}
assert(cultureHistory().length < 100, `Identity graph proliferated excessively: ${cultureHistory().length}`);
console.log('LONG_RUN', { milliseconds: +elapsed.toFixed(2), identities: cultureHistory().length,
  groupsA: cultureSummary(a).length, groupsB: cultureSummary(b).length });

console.log('CULTURE_TESTS_OK');
