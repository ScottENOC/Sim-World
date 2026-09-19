import assert from 'node:assert/strict';
import { EQUIPMENT_FAMILIES, authoriseEquipmentMark, stampEquipment } from '../js/military/equipmentGenerations.js';
import { rocketArtilleryCombatProfile } from '../js/military/earlyRocketry.js';
import { counterBatteryTargetability } from '../js/military/artilleryFireControl.js';

const region={id:'r',name:'R',unlockedTechIds:new Set(['gunpowder','steelmaking','precision_machining','early_rocketry','rocket_artillery','rocket_launcher_systems','rocket_stabilisation']),stockpile:{artillery_rockets:100},industrialSupply:{capability:{precision_machining:.8,industrial_chemistry:.5}},industrialPlants:{componentCapability:{gun_system:.6,wheeled_chassis:.85}},structuralTransformation:{capability:{manufacture:.8,chemicals:.4}},steelIndustry:{readiness:.7},massEducation:{literacy:.6}};
const design=authoriseEquipmentMark(region,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY,{tick:1});
const launcher=stampEquipment({kind:'rocket_artillery',condition:1},design);
assert.equal(launcher.designStats.guided,false);
const before=region.stockpile.artillery_rockets;
const combat=rocketArtilleryCombatProfile(region,{launchers:1,consumeSupplies:true});
assert.ok(combat.bombardment>0&&combat.areaSuppression>0);
assert.ok(region.stockpile.artillery_rockets<before);
const observer={id:'o',artilleryFireControl:{counterBattery:.8,soundRanging:0,targetIntelligence:.1},airRecon:{},artilleryIntelligence:{},telephone:{militaryCoordination:0}};
const target={id:'r'};
const blind=counterBatteryTargetability(observer,target,[launcher],10);
assert.ok(blind.targetability<.08,'mobile rocket artillery should remain difficult to acquire without intelligence');
console.log('Rocket artillery campaign equipment regression passed.');
