import assert from 'node:assert/strict';
import {
  GUIDED_WEAPON_TECH_ID, SURFACE_TO_AIR_MISSILE_TECH_ID, RADAR_GUIDED_SAM_TECH_ID,
  buildSurfaceToAirMissile, ensureGuidedAirDefence, layeredAirDefenceEngagement,
  tickGuidedAirDefenceBreakthroughs
} from '../js/military/guidedAirDefence.js';

function region(){
  return {
    id:'defender',population:2_000_000,treasury:5000,conflictPressure:.7,
    stockpile:{steel:500},
    industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:300}},
    industrialPlants:{componentCapability:{electronics:.9,radio_navigation:.88,radar_set:.85},plants:[{},{}]},
    structuralTransformation:{capability:{manufacture:.86}},
    construction:{assets:[{typeId:'factory',condition:1},{typeId:'factory',condition:1}]},
    unlockedTechIds:new Set(['rocket_stabilisation','radar','machine_guns']),
    airDefenceIndustry:{
      designs:[{id:'aa1',stats:{lethality:.78,rateOfFire:.84,fireControl:.72,traverse:.8}}],
      inventoryByDesign:{aa1:8}
    }
  };
}

const r=region();
for(let i=0;i<3;i++) tickGuidedAirDefenceBreakthroughs([r],i,()=>0,365);
assert.ok(r.unlockedTechIds.has(GUIDED_WEAPON_TECH_ID),'guided missile control should emerge first');
assert.ok(r.unlockedTechIds.has(SURFACE_TO_AIR_MISSILE_TECH_ID),'SAM technology should follow guided control');
assert.ok(r.unlockedTechIds.has(RADAR_GUIDED_SAM_TECH_ID),'radar-guided area defence should be a later step');

const beforeCash=r.treasury;
let built=buildSurfaceToAirMissile(r,{count:2});
assert.equal(built.built,true);
assert.equal(ensureGuidedAirDefence(r).samInventory,2);
assert.ok(beforeCash-r.treasury>10,'SAM rounds should have material cost');

built=buildSurfaceToAirMissile(r,{radarGuided:true,count:1});
assert.equal(built.built,true);
assert.equal(ensureGuidedAirDefence(r).radarSamInventory,1);

const cheapThreat={signature:.18,speed:.16,altitude:.12,replacementValue:2.2,damagePotential:.18};
let sequence=[0.01];
let result=layeredAirDefenceEngagement(r,cheapThreat,{rng:()=>sequence.shift()??.99,targetValue:40});
assert.equal(result.layer,'gun','cheap gun layer should engage a slow drone first');
assert.equal(result.killed,true,'gun layer should be able to kill the drone');
assert.equal(ensureGuidedAirDefence(r).samInventory,2,'successful gun defence must preserve missiles');

const lowConsequence={signature:.2,speed:.2,altitude:.15,replacementValue:2.2,damagePotential:.08};
sequence=[.99,.99];
result=layeredAirDefenceEngagement(r,lowConsequence,{rng:()=>sequence.shift()??.99,targetValue:30});
assert.equal(result.layer,'gun','low-value threat should not automatically consume a missile after a gun miss');
assert.equal(ensureGuidedAirDefence(r).samInventory,2,'SAM inventory should remain for threats that justify it');

const seriousThreat={signature:.34,speed:.36,altitude:.30,replacementValue:5.5,damagePotential:.55};
sequence=[.99,0];
result=layeredAirDefenceEngagement(r,seriousThreat,{rng:()=>sequence.shift()??0,targetValue:500});
assert.equal(result.layer,'sam','cheap layer should be tried before a SAM against a slow attack drone');
assert.equal(result.killed,true,'SAM should be able to stop a serious incoming drone after gun failure');
assert.equal(ensureGuidedAirDefence(r).samInventory,1,'SAM engagement must consume a real interceptor round');
assert.ok(result.interceptorCost>seriousThreat.replacementValue,'defender can rationally spend more on interception than attacker spent on drone');

const fastThreat={signature:.7,speed:.82,altitude:.8,replacementValue:120,damagePotential:.7};
sequence=[.99,0];
result=layeredAirDefenceEngagement(r,fastThreat,{rng:()=>sequence.shift()??0,targetValue:900});
assert.equal(result.layer,'radar_sam','high-speed/high-altitude threats should reserve/use area radar SAM layer');
assert.equal(ensureGuidedAirDefence(r).radarSamInventory,0);

console.log('Guided air-defence regressions passed');
