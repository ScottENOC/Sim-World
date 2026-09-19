import assert from 'node:assert/strict';
import {
  NAVAL_SUPERSTRUCTURE_MATERIALS,NAVAL_SEAWATER_SYSTEMS,SUBMARINE_PRESSURE_HULLS,
  navalDesignMaterialOptions,previewNavalDesign,authoriseNavalMark,currentNavalDesign,
} from '../js/military/fleets.js';
import { buildWarshipClass } from '../js/economy/laborCore.js';

function region(){return {
  id:'naval-test',name:'Naval Test',isCoastal:true,targetNavySize:6,treasury:5000,
  unlockedTechIds:new Set(['marine_steam_engine','screw_propulsion','iron_hull_shipbuilding','steel_hull_shipbuilding','self_propelled_torpedo','practical_submarine','dreadnought_design','aerospace_light_alloys','hall_heroult_aluminium','kroll_titanium','radar']),
  construction:{assets:[{typeId:'shipyard',condition:1,scale:1},{typeId:'naval_base',condition:1,scale:1}]},
  stockpile:{wood:5000,steel:5000,iron:1000,coal:5000,machine_components:0,gunpowder:1000,petrol:1000,aluminium:1000,titanium:1000},
  industrialSupply:{inventory:{machine_components:5000},capability:{precision_machining:.92,steelmaking:.9}},
  industrialPlants:{componentCapability:{hull_fabrication:.92,gun_system:.88,armour_plate:.9,optics:.82,electronics:.82,engine:.9,transmission:.88,radar_set:.78,naval_fire_control:.82,sonar_set:.8,torpedo_system:.86,damage_control:.88}},
  earlyModernMilitary:{naval:{readiness:.88}},navalProcurement:{targets:{},built:{}},
};}

const r=region();
const opts=navalDesignMaterialOptions(r,'destroyer');
assert.equal(opts.superstructure.find(x=>x.id==='aluminium')?.available,true);
assert.equal(opts.seawaterSystems.find(x=>x.id==='titanium')?.available,true);

const steel=previewNavalDesign(r,'destroyer',{superstructure:'steel',seawaterSystems:'conventional',priorities:{}});
const al=previewNavalDesign(r,'destroyer',{superstructure:'aluminium',seawaterSystems:'conventional',priorities:{}});
const tiSystems=previewNavalDesign(r,'destroyer',{superstructure:'steel',seawaterSystems:'titanium',priorities:{}});
assert.ok(al.speed>steel.speed,'aluminium superstructure should improve speed through lower topside/displacement weight');
assert.ok(al.topweightMultiplier<steel.topweightMultiplier,'aluminium should reduce topside weight');
assert.ok(al.fireResistance<steel.fireResistance,'aluminium topside construction should carry a fire/heat trade-off');
assert.ok(al.systemInputs.aluminium>0,'aluminium design must physically require aluminium');
assert.ok(tiSystems.corrosionResistance>steel.corrosionResistance,'titanium seawater systems should resist corrosion');
assert.ok(tiSystems.maintenanceMultiplier<steel.maintenanceMultiplier,'titanium seawater systems should reduce maintenance burden');
assert.ok(tiSystems.systemInputs.titanium>0,'titanium machinery must physically require titanium');

const subSteel=previewNavalDesign(r,'submarine',{seawaterSystems:'conventional',pressureHull:'steel',priorities:{}});
const subTi=previewNavalDesign(r,'submarine',{seawaterSystems:'titanium',pressureHull:'titanium',priorities:{}});
assert.ok(subTi.testDepthMultiplier>subSteel.testDepthMultiplier,'titanium pressure hull should permit deeper operation');
assert.ok(subTi.signature<subSteel.signature,'titanium submarine should have a modest signature advantage');
assert.ok(subTi.systemInputs.titanium>=40,'titanium pressure hull should be a major strategic-material commitment');
assert.ok(subTi.fabricationComplexity>subSteel.fabricationComplexity,'titanium pressure hull should be difficult to fabricate');

const fast=previewNavalDesign(r,'destroyer',{superstructure:'aluminium',seawaterSystems:'titanium',priorities:{speed:2,endurance:.7,firepower:.8,protection:.7,sensors:.8,reliability:1}});
const armoured=previewNavalDesign(r,'destroyer',{superstructure:'aluminium',seawaterSystems:'titanium',priorities:{speed:.7,endurance:.7,firepower:.8,protection:2,sensors:.8,reliability:1}});
assert.ok(fast.speed>armoured.speed,'speed priority should produce a faster design');
assert.ok(armoured.durability>fast.durability,'protection priority should produce a tougher design');

const quoteResult=authoriseNavalMark(r,'destroyer',{authorisedBy:'player',choices:{superstructure:'aluminium',seawaterSystems:'titanium',priorities:{speed:1.4,endurance:1.1,firepower:1,protection:.9,sensors:1.2,reliability:1}}});
assert.equal(quoteResult.authorised,true);
assert.equal(quoteResult.design.designChoices.superstructure,NAVAL_SUPERSTRUCTURE_MATERIALS.ALUMINIUM);
assert.equal(quoteResult.design.designChoices.seawaterSystems,NAVAL_SEAWATER_SYSTEMS.TITANIUM);
assert.ok(quoteResult.design.stats.systemInputs.aluminium>0&&quoteResult.design.stats.systemInputs.titanium>0);
// Finish tooling so construction uses the new current design.
quoteResult.design.toolingReady=true;r.navalProcurement.designTooling.destroyer.pendingDesignId=null;
assert.equal(currentNavalDesign(r,'destroyer').id,quoteResult.design.id);
const alBefore=r.stockpile.aluminium,tiBefore=r.stockpile.titanium,steelBefore=r.stockpile.steel;
const build=buildWarshipClass(r,'destroyer',1,2000);
assert.ok(build.built>0,'late industrial destroyers should now be physically constructible');
assert.ok(r.stockpile.aluminium<alBefore,'construction should consume the chosen aluminium BOM');
assert.ok(r.stockpile.titanium<tiBefore,'construction should consume the chosen titanium BOM');
assert.ok(r.stockpile.steel<steelBefore,'steel remains the structural hull baseline');

const noTi=region();noTi.unlockedTechIds.delete('kroll_titanium');
const unavailable=navalDesignMaterialOptions(noTi,'submarine');
assert.equal(unavailable.pressureHull.find(x=>x.id===SUBMARINE_PRESSURE_HULLS.TITANIUM)?.available,false);
const fallback=previewNavalDesign(noTi,'submarine',{pressureHull:'titanium',seawaterSystems:'titanium',priorities:{}});
assert.equal(fallback.pressureHullMaterial,SUBMARINE_PRESSURE_HULLS.STEEL,'unavailable titanium hull choice should fall back safely');

console.log('Naval light-metal design regressions passed.');
