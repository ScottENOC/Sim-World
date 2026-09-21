import assert from 'node:assert/strict';
import { demographicFertilityAssessment, recordDemographicOutcome, setDemographicPolicy } from '../js/society/demographicSustainability.js';

function region(overrides={}){
  return {
    id:'test',population:100000,
    demographics:{children:22000,workingAge:61000,elderly:17000},
    housing:{residentCapacity:104000},
    stockpile:{food:120000},_foodNeeded:100000,
    employment:{hardship:.04,unemploymentRate:.05,migrationPressure:0},
    socialProtection:{coverage:.2,pensionReplacementRate:.15},
    publicEducation:{adultAverageYears:8},
    urbanisation:{share:.55},
    externalities:{demographicEffects:{}},
    aiLabour:{effectiveWeeklyHours:40},
    report:{},
    ...overrides,
  };
}

{
  const low=region({publicEducation:{adultAverageYears:2}});
  const high=region({publicEducation:{adultAverageYears:13}});
  const a=demographicFertilityAssessment(low),b=demographicFertilityAssessment(high);
  assert.equal(a.desiredAnnualBirthRate,b.desiredAnnualBirthRate,'school years must not directly lower desired fertility');
}

{
  const secure=region();
  const stressed=region({housing:{residentCapacity:99500},stockpile:{food:30000},employment:{hardship:.32,unemploymentRate:.22,migrationPressure:.3},aiLabour:{effectiveWeeklyHours:58},warPressure:.65});
  const good=demographicFertilityAssessment(secure),bad=demographicFertilityAssessment(stressed);
  assert.ok(bad.realisedAnnualBirthRate<good.realisedAnnualBirthRate*.7,'housing, food, hardship, hours and conflict should suppress realised fertility');
  assert.ok(bad.realisedAnnualBirthRate<bad.desiredAnnualBirthRate,'constraints should create an unmet fertility gap');
}

{
  const base=region({aiLabour:{effectiveWeeklyHours:50}});
  const supported=region({aiLabour:{effectiveWeeklyHours:36}});
  setDemographicPolicy(supported,{childcareSupport:1,familyIncomeSupport:.8,parentalLeave:.9,familyHousingPriority:.8,reproductiveHealthcare:.8});
  const a=demographicFertilityAssessment(base),b=demographicFertilityAssessment(supported);
  assert.ok(b.realisedAnnualBirthRate>a.realisedAnnualBirthRate,'family support and shorter working time should improve realised fertility');
}

{
  const crowded=region({housing:{residentCapacity:100000}}),roomy=region({housing:{residentCapacity:112000}});
  assert.ok(demographicFertilityAssessment(roomy).desiredAnnualBirthRate>demographicFertilityAssessment(crowded).desiredAnnualBirthRate,'available housing should feed back into desired family size');
}

{
  const stable=region();
  for(let y=0;y<22;y++)recordDemographicOutcome(stable,{births:2200,deaths:2000,elapsedDays:365.2425});
  assert.ok(stable.demographicSustainability.durableControlMargin>=.68,'balanced age structure and bounded growth should be controllable');
  assert.ok(stable.demographicSustainability.demonstratedDurable,'durable demographic control should require a sustained period');
}

{
  const ageing=region({demographics:{children:8000,workingAge:39000,elderly:53000}});
  recordDemographicOutcome(ageing,{births:700,deaths:2300,elapsedDays:365.2425});
  assert.ok(ageing.demographicSustainability.durableControlMargin<.68,'a severely ageing, shrinking age structure should not count as durably controlled');
  assert.equal(ageing.demographicSustainability.demonstratedDurable,false);
}

console.log('demographic sustainability regressions passed');
