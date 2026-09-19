import assert from 'node:assert/strict';
import {
  NUCLEAR_ALLIANCE_TYPES, ALLIED_NUCLEAR_ASSETS, ALLIED_DEPLOYMENT_MODES,
  ALLIED_RED_LINE_CATEGORIES, establishNuclearSecurityArrangement,
  setAlliedNuclearRedLines, setNuclearHostConsent, deployNuclearAssetsToAlly,
  estimateHostedNuclearPresence, estimateExtendedDeterrenceForAttack,
  tickAlliedNuclearDeployments
} from '../js/diplomacy/nuclearAlliedDeployments.js';
import { estimateRedLineRisk } from '../js/diplomacy/nuclearDeterrence.js';
import { ensureNuclearWeaponState } from '../js/military/nuclearWeaponisation.js';
import { ensureStrategicDelivery, STRATEGIC_MISSILE_TECH_ID } from '../js/military/strategicDelivery.js';
import { npcStrategicArmsDecision } from '../js/diplomacy/nuclearArmsControl.js';

function region(id){
  return {id,name:id,unlockedTechIds:new Set(),fleets:[],relations:{},governance:{administrativeControl:.75},nuclearDeterrence:{riskTolerance:.28},industrialSupply:{capability:{precision_machining:.8},inventory:{}},industrialPlants:{componentCapability:{electronics:.8,engine:.8}},structuralTransformation:{capability:{manufacture:.8}}};
}
function makeNuclear(region){
  const w=ensureNuclearWeaponState(region);w.prototypeCount=1;w.tests.push({completed:true,publiclyDeclared:true,tick:1});w.validationConfidence=.9;
}

const provider=region('provider'),host=region('host'),observer=region('observer');
makeNuclear(provider);
provider.unlockedTechIds.add(STRATEGIC_MISSILE_TECH_ID);
const delivery=ensureStrategicDelivery(provider);delivery.land.fixedLaunchers=5;delivery.land.readiness=.8;
const arrangement=establishNuclearSecurityArrangement(provider,host,{
  id:'umbrella',type:NUCLEAR_ALLIANCE_TYPES.EXTENDED_DETERRENCE,commitment:.9,publiclyDeclared:true,
  basingRights:true,peacetimeBasing:false,crisisBasing:true,assetTypes:[ALLIED_NUCLEAR_ASSETS.LAND_MISSILE],maxAssets:3,
  redLineCategories:[ALLIED_RED_LINE_CATEGORIES.HOMELAND_INVASION],redLineAmbiguity:.1,currentTick:10
});
assert.ok(arrangement);

tickAlliedNuclearDeployments([provider,host,observer],11,7);
let umbrella=estimateExtendedDeterrenceForAttack(observer,host,{category:'homeland_invasion',severity:.8});
assert.ok(umbrella.perceivedRisk>0,'an explicit allied invasion red line should create deterrence without forward deployment');
let capital=estimateExtendedDeterrenceForAttack(observer,host,{category:'capital_attack',severity:.8});
assert.equal(capital.perceivedRisk,0,'red-line coverage should be category-specific');

setAlliedNuclearRedLines(provider,host,'umbrella',{categories:[ALLIED_RED_LINE_CATEGORIES.HOMELAND_INVASION,ALLIED_RED_LINE_CATEGORIES.CAPITAL_ATTACK],currentTick:12});
tickAlliedNuclearDeployments([provider,host,observer],13,7);
capital=estimateExtendedDeterrenceForAttack(observer,host,{category:'capital_attack',severity:.8});
assert.ok(capital.perceivedRisk>0,'provider should be able to add an allied capital attack to its nuclear red-line defence');

let deployed=deployNuclearAssetsToAlly(provider,host,{arrangementId:'umbrella',assetType:ALLIED_NUCLEAR_ASSETS.LAND_MISSILE,count:2,mode:ALLIED_DEPLOYMENT_MODES.PERMANENT,startTick:14});
assert.equal(deployed.deployed,false,'peacetime permanent basing must respect arrangement limits');
deployed=deployNuclearAssetsToAlly(provider,host,{arrangementId:'umbrella',assetType:ALLIED_NUCLEAR_ASSETS.LAND_MISSILE,count:2,mode:ALLIED_DEPLOYMENT_MODES.CRISIS,publiclyDeclared:false,startTick:15});
assert.equal(deployed.deployed,true,'crisis basing should permit an authorised Cuban-crisis-style forward missile deployment');
assert.equal(deployed.deployment.count,2);
tickAlliedNuclearDeployments([provider,host,observer],16,7);
const withMissiles=estimateExtendedDeterrenceForAttack(observer,host,{category:'homeland_invasion',severity:.8});
assert.ok(withMissiles.forwardDeploymentSignal>0,'forward-deployed strategic assets should strengthen the observable deterrence signal');
const presence=estimateHostedNuclearPresence(host,host);
assert.equal(presence.suspected,true,'the host must know it is hosting allied nuclear assets');

setNuclearHostConsent(host,'umbrella',false,{currentTick:17});
const blocked=deployNuclearAssetsToAlly(provider,host,{arrangementId:'umbrella',assetType:ALLIED_NUCLEAR_ASSETS.LAND_MISSILE,count:1,mode:ALLIED_DEPLOYMENT_MODES.CRISIS,startTick:18});
assert.equal(blocked.deployed,false,'revoked host consent must immediately block new deployments');
tickAlliedNuclearDeployments([provider,host,observer],19,7);
assert.equal(host.nuclearAlliance.coverage.length,0,'revoking host consent should suspend umbrella coverage until consent is restored');

setNuclearHostConsent(host,'umbrella',true,{currentTick:20});
tickAlliedNuclearDeployments([provider,host,observer],21,7);
const risk=estimateRedLineRisk(observer,host,{category:'homeland_invasion',severity:.8,deniability:0,reversible:0});
assert.ok(risk.alliedDeterrenceRisk>0,'allied nuclear red-line coverage should feed the existing deterrence risk calculation');
assert.equal(risk.alliedProviderActorId,'provider');

const rival=region('rival');makeNuclear(rival);rival.unlockedTechIds.add(STRATEGIC_MISSILE_TECH_ID);ensureStrategicDelivery(rival).land.mobileLaunchers=8;host.relations.rival={hostility:.9};
const decision=npcStrategicArmsDecision(host,{rivals:[rival],currentTick:22});
assert.ok(decision.threatPressure<.8,'credible extended deterrence should reduce pressure for an ally to build an independent deterrent');

console.log('nuclear allied deployment regressions passed');
