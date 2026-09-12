#!/usr/bin/env node
import assert from 'node:assert/strict';
import { steelmakingBreakthroughChance, tickSteelIndustry, tickSteelMilitaryAdoption, steelMilitaryQualityMultiplier, STEELMAKING_TECH_ID } from '../js/technology/steel.js';

const r={
  id:'r', population:20000,
  unlockedTechIds:new Set(['iron_smelting','crossbows','heavy_cavalry']),
  ironWorkingReadiness:0.9,
  experience:{smithing:500000}, education:{},
  stockpile:{iron:500,wood:1000,steel:0},
  occupations:{smith:120}, army:{personnel:1000,away:0},
  neighbors:[], tradePartnerIds:new Set(), recentTradePartners:new Map(),
};
const map=new Map([[r.id,r]]);
assert.ok(steelmakingBreakthroughChance(r,map)>0,'mature ironworking should permit steel discovery');
r.unlockedTechIds.add(STEELMAKING_TECH_ID);
const ironBefore=r.stockpile.iron;
tickSteelIndustry(r,365.2425);
assert.ok(r.stockpile.steel>0,'steel industry should produce steel');
assert.ok(r.stockpile.iron<ironBefore,'steelmaking should consume iron');
const steelBefore=r.stockpile.steel;
tickSteelMilitaryAdoption(r,365.2425*5);
assert.ok(r.steelIndustry.militaryCoverage>0,'army should adopt steel equipment gradually');
assert.ok(r.stockpile.steel<steelBefore,'military adoption should consume steel');
assert.ok(steelMilitaryQualityMultiplier(r)>1,'steel-equipped armies should gain quality');
const fresh={...r,id:'n',unlockedTechIds:new Set(['iron_smelting']),neighbors:['r'],tradePartnerIds:new Set(),recentTradePartners:new Map(),steelIndustry:undefined,stockpile:{iron:10,wood:100}};
const map2=new Map([['r',r],['n',fresh]]);
assert.ok(steelmakingBreakthroughChance(fresh,map2)>0,'steelmaking should diffuse from neighbours');
console.log('Steel tests passed');
