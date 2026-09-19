import assert from 'node:assert/strict';
import { modernLandBreakthroughChance, EARLY_ROCKETRY_TECH_ID, ROCKET_ARTILLERY_TECH_ID, IMPROVED_ROCKET_PROPELLANT_TECH_ID, ROCKET_STABILISATION_TECH_ID, ROCKET_LAUNCHER_SYSTEMS_TECH_ID } from '../js/military/modernLandWarfare.js';
import { EQUIPMENT_FAMILIES, authoriseEquipmentMark, currentEquipmentDesign, equipmentFrontierImprovement } from '../js/military/equipmentGenerations.js';
import { rocketArtilleryFrontier, rocketArtilleryCombatProfile } from '../js/military/earlyRocketry.js';

function region(){return {
 id:'rocket-test',name:'Rocket Test',population:400000,unlockedTechIds:new Set(['gunpowder','steelmaking','rifling','breech_loading_rifles','smokeless_powder','precision_machining',EARLY_ROCKETRY_TECH_ID,ROCKET_ARTILLERY_TECH_ID]),
 stockpile:{artillery_rockets:1000},industrialSupply:{capability:{precision_machining:.45,industrial_chemistry:.32}},industrialPlants:{componentCapability:{gun_system:.45,wheeled_chassis:.35}},structuralTransformation:{capability:{manufacture:.5,chemicals:.3}},steelIndustry:{readiness:.5},massEducation:{literacy:.55},artilleryFireControl:{rangeFinding:.3,survey:.3,fireDirection:.25,predictedFire:.1,targetIntelligence:.25}
};}

const r=region();
const early=rocketArtilleryFrontier(r);
assert.ok(early.rangeKm>2.4,'early rockets should gain range beyond the primitive baseline');
assert.ok(early.intrinsicAccuracy<.35,'early rocket artillery should remain much less accurate than mature tube artillery');
assert.equal(early.guided,false,'this tranche must not create guided missiles');
assert.ok(early.salvoDensity>0,'rocket artillery should model saturation separately from accuracy');

const mk1=authoriseEquipmentMark(r,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY,{tick:10,reason:'test'});
assert.ok(mk1 && mk1.stats.areaWeapon,'rocket artillery should use persistent equipment Marks');
const mk1Range=mk1.stats.rangeKm,mk1Accuracy=mk1.stats.intrinsicAccuracy;
r.unlockedTechIds.add(IMPROVED_ROCKET_PROPELLANT_TECH_ID);r.unlockedTechIds.add(ROCKET_STABILISATION_TECH_ID);r.unlockedTechIds.add(ROCKET_LAUNCHER_SYSTEMS_TECH_ID);
r.industrialSupply.capability.precision_machining=.82;r.industrialPlants.componentCapability.wheeled_chassis=.82;r.structuralTransformation.capability.manufacture=.82;
assert.ok(equipmentFrontierImprovement(r,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY)>0,'better components and techniques should create a better rocket-artillery frontier');
const mk2=authoriseEquipmentMark(r,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY,{tick:20,reason:'improved'});
assert.ok(mk2.stats.rangeKm>mk1Range,'better propellant/casing should extend range');
assert.ok(mk2.stats.intrinsicAccuracy>mk1Accuracy,'stabilisation and precision manufacture should reduce dispersion');
assert.equal(mk1.stats.rangeKm,mk1Range,'old rocket batteries must not magically upgrade when new tech is learned');

const before=r.stockpile.artillery_rockets;
const combat=rocketArtilleryCombatProfile(r,{launchers:6,elapsedDays:7,logisticsSupply:1,consumeSupplies:true});
assert.ok(combat.rocketsUsed>0 && r.stockpile.artillery_rockets<before,'rocket salvos must consume artillery rockets');
assert.ok(combat.areaSuppression>combat.precision*.5,'their core battlefield value should include area saturation, not only point accuracy');

const prereqOnly={...region(),id:'prereq',unlockedTechIds:new Set(['gunpowder'])};
const chance=modernLandBreakthroughChance(prereqOnly,{id:EARLY_ROCKETRY_TECH_ID,prereq:['gunpowder'],base:.000012},new Map());
assert.ok(chance>0,'gunpowder practice should permit early military rocketry to emerge');

console.log('Early rocketry regressions passed.');
