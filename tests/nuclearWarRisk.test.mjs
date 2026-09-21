import assert from 'node:assert/strict';
import { assessNuclearWarRisk, ensureNuclearRiskState, setNuclearRiskPolicy, tickNuclearWarRisk, NUCLEAR_ALERT_POSTURES, NUCLEAR_DOCTRINES } from '../js/military/nuclearWarRisk.js';

function nuclearRegion(id='a'){
  return {
    id,name:id.toUpperCase(),polityId:id,
    governance:{sovereignPolityId:id},
    nuclearWeapons:{operationalWarheads:180,prototypeCount:1,validationConfidence:.9,tests:[{completed:true}]},
    nuclearForces:{operationalWarheads:180,reserveWarheads:60},
    strategicAi:{effects:{warningQuality:.35,falseAlarmFiltering:.30,secondStrikeResilience:.20,commandRisk:.01,humanReleaseAuthority:.98}},
    report:{},
  };
}

{
  const conventional={id:'c',name:'Conventional',polityId:'c',governance:{sovereignPolityId:'c'},report:{}};
  const s=assessNuclearWarRisk(conventional,{regions:[conventional],activeWars:[]});
  assert.equal(s.nuclearPower,false,'a state without nuclear capability must not be treated as a nuclear power');
  assert.equal(s.annualCatastrophicExchangeRisk,0,'non-nuclear states should not generate nuclear exchange risk');
}

{
  const stable=nuclearRegion('stable'),fragile=nuclearRegion('fragile');
  setNuclearRiskPolicy(stable,{alertPosture:NUCLEAR_ALERT_POSTURES.LOW,doctrine:NUCLEAR_DOCTRINES.NO_FIRST_USE,launchOnWarning:.02,delegatedRelease:.01,commandReliability:.95,earlyWarningQuality:.90,forceSurvivability:.9,dispersal:.85,armsControlConfidence:.8,crisisHotline:.9});
  stable.strategicAi.effects.secondStrikeResilience=.75;
  stable.strategicAi.effects.falseAlarmFiltering=.85;
  setNuclearRiskPolicy(fragile,{alertPosture:NUCLEAR_ALERT_POSTURES.HAIR_TRIGGER,doctrine:NUCLEAR_DOCTRINES.FIRST_USE,launchOnWarning:.95,delegatedRelease:.65,commandReliability:.35,earlyWarningQuality:.4,forceSurvivability:.12,dispersal:.1,armsControlConfidence:.05,crisisHotline:.05});
  stable.strategicCrisisPressure=.75;fragile.strategicCrisisPressure=.75;
  const stableRisk=assessNuclearWarRisk(stable,{regions:[stable,fragile],activeWars:[]});
  const fragileRisk=assessNuclearWarRisk(fragile,{regions:[stable,fragile],activeWars:[]});
  assert.ok(stableRisk.secureSecondStrike>fragileRisk.secureSecondStrike,'survivable, dispersed forces should create a more secure second strike');
  assert.ok(stableRisk.firstStrikeVulnerability<fragileRisk.firstStrikeVulnerability,'secure second strike should reduce first-strike vulnerability');
  assert.ok(stableRisk.annualCatastrophicExchangeRisk<fragileRisk.annualCatastrophicExchangeRisk,'low alert, NFU and reliable command should reduce catastrophic exchange risk');
}

{
  const human=nuclearRegion('human'),autonomous=nuclearRegion('autonomous');
  for(const r of [human,autonomous]){
    setNuclearRiskPolicy(r,{alertPosture:NUCLEAR_ALERT_POSTURES.HIGH,launchOnWarning:.65,forceSurvivability:.45,dispersal:.4});
    r.strategicCrisisPressure=.7;
  }
  human.strategicAi.effects.commandRisk=.01;human.strategicAi.effects.humanReleaseAuthority=1;human.strategicAi.effects.falseAlarmFiltering=.75;
  autonomous.strategicAi.effects.commandRisk=.32;autonomous.strategicAi.effects.humanReleaseAuthority=.2;autonomous.strategicAi.effects.falseAlarmFiltering=.35;
  const h=assessNuclearWarRisk(human,{regions:[human,autonomous]});
  const a=assessNuclearWarRisk(autonomous,{regions:[human,autonomous]});
  assert.ok(a.annualCatastrophicExchangeRisk>h.annualCatastrophicExchangeRisk,'loss-of-control exposure in strategic AI should increase nuclear command risk');
}

{
  const a=nuclearRegion('a'),b=nuclearRegion('b'),c=nuclearRegion('c'),d=nuclearRegion('d');
  for(const r of [a,b,c,d])setNuclearRiskPolicy(r,{alertPosture:NUCLEAR_ALERT_POSTURES.NORMAL,launchOnWarning:.2,forceSurvivability:.5});
  a.strategicCrisisPressure=.55;
  const bipolar=assessNuclearWarRisk(a,{regions:[a,b]});
  const multipolar=assessNuclearWarRisk(a,{regions:[a,b,c,d]});
  assert.ok(multipolar.multipolarPressure>bipolar.multipolarPressure,'additional nuclear powers should increase multipolar coordination pressure');
  assert.ok(multipolar.annualCatastrophicExchangeRisk>=bipolar.annualCatastrophicExchangeRisk,'all else equal, multipolar complexity should not reduce systemic exchange risk');
}

{
  const a=nuclearRegion('a'),b=nuclearRegion('b');
  setNuclearRiskPolicy(a,{alertPosture:NUCLEAR_ALERT_POSTURES.HIGH,launchOnWarning:.8,forceSurvivability:.2});
  const war={attackerPolityId:'a',defenderPolityId:'b'};
  const events=tickNuclearWarRisk([a,b],[war],42,7,()=>.5);
  assert.ok(a.nuclearRisk.crisisPressure>=.7,'active war participation should create acute crisis pressure');
  assert.ok(a.report.nuclearRisk,'weekly risk tick should publish an advisor-facing nuclear risk report');
  assert.ok(Array.isArray(events),'nuclear risk tick should return event records without directly resolving a nuclear exchange');
}

console.log('nuclearWarRisk tests passed');
