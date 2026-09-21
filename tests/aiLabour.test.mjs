import assert from 'node:assert/strict';
import { tickAiLabour } from '../js/economy/aiLabour.js';

function region(overrides={}){
  return {
    population:100000,
    demographics:{workingAge:60000},
    unlockedTechIds:new Set(),
    aiEconomy:{capability:.8},
    electricity:{industrialService:.9},
    stockpile:{computers:200},
    publicEducation:{technicalHumanCapital:.8,literacy:.9},
    computingIndustry:{capability:.8},
    structuralTransformation:{agriculturalShare:.05,industrialShare:.35,serviceShare:.60},
    employment:{unemploymentRate:.04},
    labourRelations:{unionDensity:.55,bargainingTrust:.75,policy:{collectiveBargaining:'recognised'}},
    economicRegulation:{labourStandards:.8,workerSafety:.85},
    socialProtection:{coverage:.8},
    corporateCapital:{financialDepth:.6,failedFirmPressure:0},
    tradeEconomy:{weeklyExports:5000},
    householdDemandMultiplier:1,
    occupations:{farmer:3000,miner:3000,smith:2500,lumberjack:1000,trader:3000,driver:2000,sailor:1000,scribe:1500,administrator:1000,scholar:1000,scientist:1500,engineer:1500,doctor:1000,nurse:2000},
    report:{},
    ...overrides,
  };
}

{
  const r=region();
  for(let i=0;i<260;i++)tickAiLabour(r,7);
  assert.ok(r.aiLabour.productivityGain>0,'advanced AI should generate a productivity dividend');
  assert.ok(r.aiLabour.standardWeeklyHours<40,'strong labour institutions should capture some dividend as leisure');
  assert.ok(r.aiLabour.sectors.healthcare.productivityGain>r.aiLabour.sectors.healthcare.substitutionPressure,'healthcare AI should begin mostly as augmentation');
  assert.ok(r.aiLabour.sectors.logistics.substitutionPressure>r.aiLabour.sectors.logistics.productivityGain,'logistics should face comparatively strong substitution pressure');
}

{
  const strong=region();
  const weak=region({
    employment:{unemploymentRate:.16},
    labourRelations:{unionDensity:.03,bargainingTrust:.25,policy:{collectiveBargaining:'banned'}},
    economicRegulation:{labourStandards:.08,workerSafety:.12},
    socialProtection:{coverage:.04},
  });
  for(let i=0;i<260;i++){tickAiLabour(strong,7);tickAiLabour(weak,7);}
  assert.ok(strong.aiLabour.leisureShare>weak.aiLabour.leisureShare,'worker power should shift AI gains toward shorter hours');
  assert.ok(weak.aiLabour.automationDisplacementRate>strong.aiLabour.automationDisplacementRate,'weak labour institutions should permit more displacement');
  assert.ok(weak.aiLabour.effectiveWeeklyHours>=weak.aiLabour.standardWeeklyHours,'job insecurity can preserve or extend actual hours among employed workers');
}

console.log('aiLabour tests passed');
