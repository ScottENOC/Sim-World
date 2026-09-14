import assert from 'node:assert/strict';
import {
  educationAdvisorReport,
  educationAdministrativeCapacity,
  educationFertilityMultiplier,
  educationLaborReservation,
  educationSkillMultiplier,
  ensureMassEducation,
  setMandatoryEducationYears,
  tickMassEducation,
} from '../js/society/massEducation.js';

function region(overrides = {}) {
  return {
    id: 'test', name: 'Test Region', population: 100_000,
    demographics: { children: 25_000, workingAge: 65_000, elderly: 10_000 },
    educationLevel: 0.05,
    education: {
      writingSystem: 'alphabetic writing', targetStudents: 200, students: 150,
      juniorScribes: 140, experiencedScribes: 260, masterScribes: 24,
      archiveLevel: 0.55, recordedExperience: {}, administrativeCoverage: 0.7,
    },
    militaryFinance: { stateCapacity: 0.8 },
    governance: { administrativeControl: 0.8 },
    stockpile: { food: 140_000 }, _foodNeeded: 100_000,
    wallet: 5000, treasury: 100_000,
    externalities: { demographicEffects: { childMortalityExtraAnnual: 0 } },
    urbanisation: { share: 0.35 },
    report: {},
    ...overrides,
  };
}

{
  const r = region();
  assert.equal(ensureMassEducation(r).mandatoryYears, 0);
  setMandatoryEducationYears(r, 20);
  assert.equal(r.publicEducation.mandatoryYears, 13, 'policy clamps to 13 years');
  setMandatoryEducationYears(r, -2);
  assert.equal(r.publicEducation.mandatoryYears, 0, 'policy clamps to zero');
}

{
  const r = region();
  setMandatoryEducationYears(r, 8);
  tickMassEducation([r], 365.2425);
  const s1 = r.publicEducation;
  assert(s1.schoolCapacityYears > 0 && s1.schoolCapacityYears < 8, 'capacity ramps instead of appearing overnight');
  assert(s1.teacherWorkersReserved > 0, 'teachers are actual reserved workers');
  assert(s1.studentsEnrolled > 0, 'pupils enter schooling');
  assert(s1.childLaborWithdrawn > 0, 'schooling carries a child/youth labour opportunity cost');
  assert(r.treasury < 100_000, 'public schooling costs the treasury');
  const delivered1 = s1.deliveredYears;
  for (let i = 0; i < 12; i++) tickMassEducation([r], 365.2425);
  assert(r.publicEducation.schoolCapacityYears > s1.mandatoryYears * 0.5, 'capacity expands over time');
  assert(r.publicEducation.deliveredYears > delivered1, 'delivered schooling rises as the system matures');
  assert(r.publicEducation.workforceEntrantYears > 0, 'educated cohorts reach the workforce');
  assert(r.publicEducation.adultAverageYears > 0.2, 'adult human capital changes gradually');
}

{
  const low = region({ id: 'low' });
  const high = region({ id: 'high' });
  setMandatoryEducationYears(high, 13);
  high.publicEducation = {
    ...ensureMassEducation(high), mandatoryYears: 13, schoolCapacityYears: 13, teacherCapacity: 5000,
    deliveredYears: 13, workforceEntrantYears: 13, adultAverageYears: 11,
    literacy: 1, numeracy: 1, technicalHumanCapital: 0.8,
  };
  tickMassEducation([high], 7);
  assert(educationSkillMultiplier(high, 'smithing') > educationSkillMultiplier(low, 'smithing'));
  assert(educationSkillMultiplier(high, 'smithing') > educationSkillMultiplier(high, 'farming'), 'education matters more to cognitively demanding work than basic farming');
  assert(educationAdministrativeCapacity(high) > educationAdministrativeCapacity(low), 'mass education enlarges the administrative labour pool');
  assert(educationFertilityMultiplier(high) < educationFertilityMultiplier(low), 'fertility pressure follows attained adult schooling, not the policy announcement alone');
}

{
  const r = region();
  setMandatoryEducationYears(r, 10);
  tickMassEducation([r], 365.2425);
  const reservation = educationLaborReservation(r);
  assert(reservation.total >= reservation.teachers);
  const report = educationAdvisorReport(r);
  assert.equal(report.mandatoryYears, 10);
  assert(report.capacityYears < 10, 'advisor tells player the law is ahead of capacity');
  assert(report.warnings.some((x) => /law is ahead/i.test(x)), 'advisor gives actionable implementation warning');
  assert(report.benefits.some((x) => /literacy|numeracy|skilled/i.test(x)), 'advisor explains expected long-run gains');
  assert(!JSON.stringify(report).includes('TFR'), 'advisor does not expose modern demographic jargon');
  assert(!JSON.stringify(report).includes('ppm'), 'advisor does not expose unrelated omniscient science metrics');
}

console.log('Mass public education regressions passed.');
