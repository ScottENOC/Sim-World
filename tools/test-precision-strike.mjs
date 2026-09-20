import assert from 'node:assert/strict';
import { buildPrecisionMunition, conductAntiShipMissileStrike, conductLandAttackCruiseMissile, ensurePrecisionStrike, PRECISION_MUNITION_TYPES, PRECISION_STRIKE_TECH_IDS, precisionStrikeSummary } from '../js/military/precisionStrike.js';
import { GUIDED_WEAPON_TECH_ID } from '../js/military/guidedAirDefence.js';
import { STRATEGIC_MISSILE_TECH_ID } from '../js/military/strategicDelivery.js';
import { SATELLITE_NAVIGATION_TECH_IDS } from '../js/technology/satelliteNavigation.js';

function region(id='a'){
 return {id,name:id,population:5_000_000,isCoastal:true,treasury:5000,stockpile:{steel:500,aviation_fuel:100},industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:500,electronics:500}},industrialPlants:{componentCapability:{electronics:.9,radio_navigation:.9,radar_set:.9}},structuralTransformation:{capability:{manufacture:.9}},unlockedTechIds:new Set([GUIDED_WEAPON_TECH_ID,STRATEGIC_MISSILE_TECH_ID,'radar','military_aviation',PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE,PRECISION_STRIKE_TECH_IDS.ANTI_SHIP,PRECISION_STRIKE_TECH_IDS.AIR_LAUNCHED,PRECISION_STRIKE_TECH_IDS.TERMINAL_SEEKER,SATELLITE_NAVIGATION_TECH_IDS.SYSTEM,SATELLITE_NAVIGATION_TECH_IDS.PRECISION_GUIDANCE,SATELLITE_NAVIGATION_TECH_IDS.INTEGRATED_NAVIGATION]),satelliteNavigation:{precisionStrike:.9,militaryNavigation:.9,contestedRetention:.72,airNavigation:.85,navalNavigation:.85},aviation:{aircraft:[{ownerType:'military',role:'bomber',status:'serviceable'}],flightExperience:3000}};
}

{
 const r=region();const before=r.treasury;const built=buildPrecisionMunition(r,PRECISION_MUNITION_TYPES.ANTI_SHIP,{count:3});
 assert.equal(built.built,true);assert.equal(ensurePrecisionStrike(r).inventory[PRECISION_MUNITION_TYPES.ANTI_SHIP],3);assert.ok(r.treasury<before);
}

{
 const attacker=region('attacker'),defender=region('defender');
 ensurePrecisionStrike(attacker).inventory[PRECISION_MUNITION_TYPES.ANTI_SHIP]=3;
 const fleet={id:'fleet-b',ships:[{id:'carrier-1',designId:'dreadnought',carrierFacilities:{},condition:1},{id:'escort-1',designId:'destroyer',condition:1}]};
 const result=conductAntiShipMissileStrike(attacker,defender,fleet,{count:3,rng:()=>0,currentTick:50});
 assert.equal(result.launched,true);assert.equal(result.count,3);assert.ok(result.hits>=1);assert.ok(fleet.ships.some(s=>s.condition<1));assert.equal(ensurePrecisionStrike(attacker).inventory[PRECISION_MUNITION_TYPES.ANTI_SHIP],0);
}

{
 const attacker=region('land-a'),target=region('land-b');ensurePrecisionStrike(attacker).inventory[PRECISION_MUNITION_TYPES.LAND_ATTACK]=1;
 const result=conductLandAttackCruiseMissile(attacker,target,{rng:()=>0,currentTick:80});
 assert.equal(result.launched,true);assert.equal(result.hit,true);assert.ok(target.warDamage.infrastructureDamage>0);
}

{
 const r=region('nav');ensurePrecisionStrike(r).inventory[PRECISION_MUNITION_TYPES.LAND_ATTACK]=2;
 const good=precisionStrikeSummary(r).navigation.precisionStrike;
 r.satelliteNavigation={...r.satelliteNavigation,precisionStrike:.08,militaryNavigation:.15};
 const degraded=precisionStrikeSummary(r).navigation.precisionStrike;
 assert.ok(good>degraded);
}

console.log('precision strike regressions passed');
