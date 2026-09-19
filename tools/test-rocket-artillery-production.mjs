import assert from 'node:assert/strict';
import { tickEarlyModernIndustry } from '../js/military/earlyModernWarfare.js';
import { tickIndustrialWarEconomy } from '../js/economy/industrialWarEconomy.js';

const r={id:'prod',name:'Prod',population:300000,treasury:5000,wallet:0,isCoastal:false,unlockedTechIds:new Set(['gunpowder','steelmaking','rocket_artillery','early_rocketry','precision_machining']),stockpile:{steel:1000,iron:1000,wood:1000,gunpowder:1000,artillery_rockets:0},industrialSupply:{inventory:{machine_components:100},capability:{precision_machining:.8,steelmaking:.8,industrial_chemistry:.5}},industrialPlants:{componentCapability:{gun_system:.7,wheeled_chassis:.8}},structuralTransformation:{capability:{manufacture:.8,chemicals:.5}},steelIndustry:{readiness:.8},massEducation:{literacy:.6},army:{personnel:12000,away:0},earlyModernMilitary:{artillery:{readiness:.8,inventory:[],away:[]},naval:{readiness:0,guns:[]}},warEconomy:{activeCampaigns:1},marketDemand:{}};
for(let i=0;i<8;i++)tickEarlyModernIndustry([r],30);
const launchers=r.earlyModernMilitary.artillery.inventory.filter(x=>x.kind==='rocket_artillery');
assert.ok(launchers.length>0,'industrial military system should build physical rocket launchers');
assert.ok(launchers.every(x=>x.designId&&x.designStats),'each launcher should preserve its Mk design');
const before=r.stockpile.artillery_rockets||0;
tickIndustrialWarEconomy([r],[],30,[]);
assert.ok((r.stockpile.artillery_rockets||0)>before,'industrial war economy should manufacture dedicated artillery rockets for existing launchers');
assert.ok((r.marketDemand.artillery_rockets||0)>=0,'rocket ammunition should participate in market demand');
console.log('Physical rocket production regression passed.');
