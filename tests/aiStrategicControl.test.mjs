import assert from 'node:assert/strict';
import { ensureAiControlState, setAiControlPolicy, tickAiControl } from '../js/technology/aiControl.js';
import { setStrategicAiPolicy, tickStrategicAiCommand } from '../js/military/aiStrategicCommand.js';

function region(){
  return {
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

console.log('aiStrategicControl tests passed');
