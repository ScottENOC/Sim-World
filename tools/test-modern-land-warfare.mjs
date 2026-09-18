import assert from 'node:assert/strict';
import {
  BREECH_ARTILLERY_TECH_ID, BREECH_RIFLE_TECH_ID, FIELD_ENTRENCHMENT_TECH_ID,
  HEAVY_HOWITZER_TECH_ID, MACHINE_GUN_TECH_ID, MAGAZINE_RIFLE_TECH_ID,
  QUICK_FIRE_ARTILLERY_TECH_ID, SMOKELESS_POWDER_TECH_ID,
  bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile,
  modernInfantryProfile, tickModernLandBreakthroughs,
} from '../js/military/modernLandWarfare.js';

const region=(id)=>({
  id,name:id,neighbors:[],tradePartnerIds:new Set(),unlockedTechIds:new Set(['gunpowder','rifling','steelmaking','military_drill']),
  firearms:{readiness:.9,riflingReadiness:.8,combatExperience:.4},steelIndustry:{readiness:.8},
  earlyModernMilitary:{artillery:{inventory:[{kind:'field_cannon',metal:'steel',condition:1},{kind:'field_cannon',metal:'steel',condition:1}],away:[]}},
  stockpile:{gunpowder:100,steel:100,iron:100,bronze:0},construction:{projects:[],completed:{},assets:[]},
});

// Breakthroughs require the industrial/firearms prerequisites and can diffuse/develop.
const innovator=region('innovator');
const events=tickModernLandBreakthroughs([innovator],100,()=>0,7);
assert(events.some(e=>e.techId===BREECH_RIFLE_TECH_ID),'breech-loading rifle breakthrough should be possible with prerequisites');
assert(innovator.unlockedTechIds.has(BREECH_ARTILLERY_TECH_ID),'breech-loading artillery should enter the progression');

// Modern infantry gets stronger, especially in defence, but consumes extra ammunition.
for(const id of [BREECH_RIFLE_TECH_ID,MAGAZINE_RIFLE_TECH_ID,SMOKELESS_POWDER_TECH_ID,MACHINE_GUN_TECH_ID]) innovator.unlockedTechIds.add(id);
const powderBefore=innovator.stockpile.gunpowder;
const infantry=modernInfantryProfile(innovator,1000,{suppliedShare:.9},{role:'defender',consumeSupplies:true,logisticsSupply:1});
assert(infantry.multiplier>1,'modern infantry should increase firepower');
assert(infantry.defenceMultiplier>infantry.multiplier-0.2,'machine guns should be particularly valuable to defence');
assert(innovator.stockpile.gunpowder<powderBefore,'modern firepower must consume additional ammunition');

// Entrenchment is time-dependent, not an instant static combat bonus.
const trenches=region('trenches'); trenches.unlockedTechIds.add(FIELD_ENTRENCHMENT_TECH_ID);
assert.equal(entrenchmentDefenceMultiplier(trenches,0),1);
assert(entrenchmentDefenceMultiplier(trenches,6)>entrenchmentDefenceMultiplier(trenches,1));

// Modern artillery consumes extra ammunition and enables bombardment without occupation.
const attacker=region('attacker');
for(const id of [BREECH_ARTILLERY_TECH_ID,HEAVY_HOWITZER_TECH_ID,QUICK_FIRE_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID]) attacker.unlockedTechIds.add(id);
const defender=region('defender');
defender.construction.assets.push({id:'wire',typeId:'telegraph_network',condition:1,scale:1},{id:'grid',typeId:'local_electric_grid',condition:1,scale:1});
const polity={id:'p',railways:{lines:[{id:'rail-1',type:'railway',fromRegionId:'defender',toRegionId:'other',status:'operational',condition:1,capacity:1,effectiveCapacity:1,value:100}]}};
const artilleryBase={guns:4,suppliedFraction:1};
const powder0=attacker.stockpile.gunpowder;
const modern=modernArtilleryProfile(attacker,artilleryBase,{consumeSupplies:true,logisticsSupply:1});
assert(modern.bombardment>0,'breech-loading artillery should support ranged infrastructure bombardment');
assert(attacker.stockpile.gunpowder<powder0,'quick/heavy artillery must consume extra ammunition');
const result=bombardRegionalInfrastructure(attacker,defender,[polity],artilleryBase,{objective:'punitive',rng:()=>.5,currentTick:42});
assert(result.totalDamage>0,'bombardment should damage infrastructure without occupation');
assert(polity.railways.lines[0].condition<1,'railway should be vulnerable to artillery bombardment');
assert(defender.construction.assets.some(a=>a.condition<1),'regional infrastructure should also be damaged');

// Old artillery does not gain long-range infrastructure destruction automatically.
const old=region('old');
const untouched=region('untouched'); untouched.construction.assets.push({id:'wire2',typeId:'telegraph_network',condition:1,scale:1});
const noModern=bombardRegionalInfrastructure(old,untouched,[],artilleryBase,{objective:'punitive',rng:()=>.5});
assert.equal(noModern.totalDamage,0);
assert.equal(untouched.construction.assets[0].condition,1);

console.log('modern land warfare regression passed');
