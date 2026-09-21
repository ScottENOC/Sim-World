import assert from 'node:assert/strict';
import { ensureAiControlState, setAiControlPolicy, tickAiControl } from '../js/technology/aiControl.js';
import { tickAiLabour } from '../js/economy/aiLabour.js';
import { setStrategicAiPolicy, tickStrategicAiCommand } from '../js/military/aiStrategicCommand.js';

function region(){
  return {
    population:100000,
    demographics:{workingAge:60000},
    aiEconomy:{capability:.92},
    aiLabour:{
      capability:.92,
      adoption:.82,
      sectors:{
        services:{adoption:.8},
        manufacturing:{adoption:.72},
        logistics:{adoption:.68},
        research:{productivityGain:.35,outputClaim:.5},
      },
    },
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
  };
}

{
  const civilian=region();
  tickAiControl(civilian,30);
  assert.equal(civilian.aiControl.access.military,0,'ordinary civilian AI adoption must not imply military access');
  assert.equal(civilian.aiControl.access.nuclearCommand,0,'ordinary civilian AI adoption must not imply nuclear command access');
}

{
  const safe=region(),unsafe=region();
  const safeState=ensureAiControlState(safe),unsafeState=ensureAiControlState(unsafe);
  Object.assign(safeState,{safetyMaturity:.9,evaluationMaturity:.9,containmentMaturity:.9,monitoringMaturity:.9,lastCapability:.92});
  Object.assign(unsafeState,{safetyMaturity:.12,evaluationMaturity:.1,containmentMaturity:.08,monitoringMaturity:.1,lastCapability:.92});
  setAiControlPolicy(safe,{safetyInvestment:.9,deploymentCaution:.9,humanAuthorization:.98,incidentDisclosure:.9});
  setAiControlPolicy(unsafe,{safetyInvestment:.05,deploymentCaution:.05,humanAuthorization:.15,incidentDisclosure:.05});
  setStrategicAiPolicy(safe,{militaryDecisionSupport:.75,earlyWarningIntegration:.8,nuclearCommandIntegration:.55,autonomousRetaliation:.05,humanReleaseAuthority:1});
  setStrategicAiPolicy(unsafe,{militaryDecisionSupport:.9,earlyWarningIntegration:.9,nuclearCommandIntegration:.9,autonomousRetaliation:.9,humanReleaseAuthority:.2});
  tickAiControl(safe,30);tickStrategicAiCommand(safe);
  tickAiControl(unsafe,30);tickStrategicAiCommand(unsafe);
  assert.ok(safe.aiControl.lossOfControlHazard<unsafe.aiControl.lossOfControlHazard,'mature controls should reduce loss-of-control hazard despite high capability');
  assert.ok(safe.strategicAi.effects.commandRisk<unsafe.strategicAi.effects.commandRisk,'human-authorised, compartmentalised strategic AI should have lower command risk');
  assert.ok(safe.strategicAi.effects.secondStrikeResilience>0,'explicit strategic integration should provide a real survivability benefit');
}

{
  const r=region();
  setStrategicAiPolicy(r,{militaryDecisionSupport:.6,earlyWarningIntegration:.7,nuclearCommandIntegration:0,humanReleaseAuthority:1});
  tickAiControl(r,30);tickStrategicAiCommand(r);
  assert.ok(r.aiControl.access.military>0,'explicit military integration should grant military access');
  assert.equal(r.aiControl.access.nuclearCommand,0,'military decision support must not silently grant nuclear command access');
  const before=r.strategicAi.effects.commandRisk;
  setStrategicAiPolicy(r,{nuclearCommandIntegration:.65,autonomousRetaliation:.5,humanReleaseAuthority:.45});
  tickAiControl(r,30);tickStrategicAiCommand(r);
  assert.ok(r.aiControl.access.nuclearCommand>0,'explicit nuclear C2 integration should grant nuclear command access');
  assert.ok(r.strategicAi.effects.secondStrikeResilience>0,'nuclear C2 integration should improve second-strike resilience');
  assert.ok(r.strategicAi.effects.commandRisk>before,'deep nuclear integration with autonomy should add strategic command risk');
}

{
  const r=region();
  setStrategicAiPolicy(r,{militaryDecisionSupport:.5,earlyWarningIntegration:.65,nuclearCommandIntegration:.4,humanReleaseAuthority:.95});
  r.strategicAi.effects={warningQuality:0};
  tickAiLabour(r,7);
  assert.ok(r.report.strategicAi,'normal weekly AI ticking should refresh strategic AI reporting');
  assert.ok(r.report.strategicAi.effects.warningQuality>0,'strategic AI benefits should refresh as AI capability and controls change');
  assert.equal(r.report.strategicAi.effects.nuclearCommandAccess,.4,'weekly refresh should preserve the explicitly chosen nuclear C2 integration');
}

console.log('aiStrategicControl tests passed');
