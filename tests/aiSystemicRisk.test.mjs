import assert from 'node:assert/strict';
import { ensureAiControlState } from '../js/technology/aiControl.js';
import { ensureAiSystemicRisk, setAiSystemicPolicy, tickAiSystemicRisk } from '../js/technology/aiSystemicRisk.js';
import { strategicAiCommandEffects } from '../js/military/aiStrategicCommand.js';

function region(overrides={}){
  const r={
    id:'ai-test',population:1_000_000,
    aiLabour:{capability:.88,adoption:.82,productivityGain:.44,automationDisplacementRate:.08,labourSheddingShare:.18,wageShare:.12,profitShare:.10,priceShare:.06,leisureShare:.18,workerPower:.62,employerPower:.40,sectors:{administration:{adoption:.70}}},
    aiControl:{
      safetyMaturity:.75,evaluationMaturity:.74,containmentMaturity:.70,monitoringMaturity:.72,autonomy:.38,capabilityGrowthRate:.12,
      policy:{humanAuthorization:.88,incidentDisclosure:.75,deploymentCaution:.65,safetyInvestment:.7},
      access:{civilianDigital:.82,industrial:.62,infrastructure:.52,military:.34,nuclearCommand:.12},
    },
    strategicAi:{policy:{militaryDecisionSupport:.5,earlyWarningIntegration:.45,nuclearCommandIntegration:.2,autonomousRetaliation:0,humanReleaseAuthority:1}},
    economicOwnership:{householdShare:.28,workerShare:.22,publicShare:.15},
    socialProtection:{coverage:.65},
    report:{},
    ...overrides,
  };
  return r;
}

{
  const r=region();
  setAiSystemicPolicy(r,{manualFallback:.95,independentVerification:.95,separationOfDuties:.9,accessSegmentation:.9,modelDiversity:.8,publicInterestCapacity:.8,ownershipPluralism:.8,foreignDependencyLimit:.9});
  tickAiSystemicRisk(r,365.2425);
  assert.ok(r.aiSystemicRisk.controls.overrideReliability>.8,'independent verification and fallback should create strong override capability');
  assert.ok(r.aiSystemicRisk.systemicRisk<.2,'strong controls should keep a highly capable AI system from automatically becoming dangerous');
}

{
  const concentrated=region({economicOwnership:{householdShare:.01,workerShare:.01,publicShare:.01},socialProtection:{coverage:.05}});
  concentrated.aiLabour={...concentrated.aiLabour,workerPower:.10,employerPower:.92,profitShare:.32,wageShare:.01,priceShare:.01,leisureShare:.02,labourSheddingShare:.55};
  setAiSystemicPolicy(concentrated,{publicInterestCapacity:.05,ownershipPluralism:.05});
  tickAiSystemicRisk(concentrated,365.2425);
  const broad=region();tickAiSystemicRisk(broad,365.2425);
  assert.ok(concentrated.aiSystemicRisk.oligarchicConcentration>broad.aiSystemicRisk.oligarchicConcentration,'AI gains can consolidate wealth and power when ownership and bargaining are narrow');
  assert.ok(concentrated.aiSystemicRisk.benefitBroadness<broad.aiSystemicRisk.benefitBroadness,'the same technology should distribute benefits differently under different institutions');
}

{
  const obedientButUnsafe=region();
  obedientButUnsafe.aiControl={...obedientButUnsafe.aiControl,autonomy:.10,lossOfControlHazard:.01,monitoringMaturity:.35,evaluationMaturity:.30};
  obedientButUnsafe.cyberThreatPressure=.8;
  obedientButUnsafe.stateCoercionPressure=.7;
  setAiSystemicPolicy(obedientButUnsafe,{manualFallback:.15,independentVerification:.10,separationOfDuties:.10,accessSegmentation:.12});
  tickAiSystemicRisk(obedientButUnsafe,365.2425);
  assert.ok(obedientButUnsafe.aiSystemicRisk.pressures.hostileCapture>.05,'an obedient AI can still be exposed to hostile capture');
  assert.ok(obedientButUnsafe.aiSystemicRisk.pressures.operatorMisuse>.05,'authorised misuse should exist separately from autonomous loss of control');
}

{
  const dependent=region();
  setAiSystemicPolicy(dependent,{manualFallback:.02,independentVerification:.08,modelDiversity:.05});
  tickAiSystemicRisk(dependent,365.2425);
  const resilient=region();
  setAiSystemicPolicy(resilient,{manualFallback:.95,independentVerification:.95,modelDiversity:.9});
  tickAiSystemicRisk(resilient,365.2425);
  assert.ok(dependent.aiSystemicRisk.pressures.automationBias>resilient.aiSystemicRisk.pressures.automationBias,'systems with no meaningful human challenge should suffer more automation bias');
  assert.ok(dependent.aiSystemicRisk.pressures.institutionalDependence>resilient.aiSystemicRisk.pressures.institutionalDependence,'manual fallbacks should reduce institutional dependence');
}

{
  const captured=region({aiForeignDependency:.9,cyberThreatPressure:.7});
  setAiSystemicPolicy(captured,{accessSegmentation:.05,foreignDependencyLimit:.05,independentVerification:.1});
  tickAiSystemicRisk(captured,365.2425);
  assert.ok(captured.aiSystemicRisk.pressures.foreignLeverage>.1,'foreign technological dependence can become strategic leverage');
  assert.ok(captured.aiGridDisruptionPressure>0,'infrastructure exposure should surface as a cross-system pressure');
}

{
  const safe=region();
  setAiSystemicPolicy(safe,{manualFallback:1,independentVerification:1,separationOfDuties:1,accessSegmentation:1,modelDiversity:1,publicInterestCapacity:1,ownershipPluralism:1,foreignDependencyLimit:1});
  safe.aiControl={...safe.aiControl,safetyMaturity:.95,evaluationMaturity:.95,containmentMaturity:.95,monitoringMaturity:.95,autonomy:.12,capabilityGrowthRate:.03};
  for(let y=0;y<22;y++)tickAiSystemicRisk(safe,365.2425);
  assert.ok(safe.aiSystemicRisk.demonstratedDurable,'AI durable control should require many years of safe operation');
}

{
  const fragile=region();
  ensureAiControlState(fragile);ensureAiSystemicRisk(fragile);
  fragile.aiControl.lossOfControlHazard=.01;
  setAiSystemicPolicy(fragile,{manualFallback:.05,independentVerification:.05,separationOfDuties:.05,accessSegmentation:.05});
  fragile.cyberThreatPressure=.8;fragile.stateCoercionPressure=.7;
  tickAiSystemicRisk(fragile,365.2425);
  const effects=strategicAiCommandEffects(fragile);
  assert.ok(effects.commandRisk>.01,'strategic command risk should include bad judgement, misuse and compromise, not only autonomous loss of control');
  assert.ok(Number.isFinite(effects.humanOverrideReliability));
}

console.log('AI systemic-risk regressions passed');
