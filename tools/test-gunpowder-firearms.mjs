#!/usr/bin/env node
import assert from 'node:assert/strict';
import { gunpowderBreakthroughChance, GUNPOWDER_TECH_ID } from '../js/technology/breakthroughs.js';
import { firearmCombatProfile, tickGunpowderIndustry } from '../js/military/firearms.js';
import { tradeGood } from '../js/economy/tradeGoods.js';

function region(id) {
  return {
    id,
    name: id,
    unlockedTechIds: new Set(),
    recentTradePartners: new Map(),
    tradePartnerIds: new Set(),
    deposits: {},
    stockpile: { wood: 1000, iron: 1000, bronze: 0, saltpetre: 0, sulfur: 0, gunpowder: 0, firearms: 0 },
    forest: { currentStock: 10000 },
    army: { personnel: 1000, away: 0 },
    experience: { mining: 120000, smithing: 120000, pottery: 120000 },
    education: {},
    marketDemand: {},
    firearms: { readiness: 0, exposure: 0, combatExperience: 0 },
  };
}

assert.ok(tradeGood('gunpowder')?.strategic, 'gunpowder must be a strategic trade good');
assert.ok(tradeGood('firearms')?.strategic, 'firearms must be a strategic trade good');

const local = region('local');
local.deposits.saltpetre = { tiers: [{}] };
local.deposits.sulfur = { tiers: [{}] };
const noInputs = region('none');
const localMap = new Map([[local.id, local], [noInputs.id, noInputs]]);
const localChance = gunpowderBreakthroughChance(local, localMap, 100);
assert.ok(localChance > 0, 'a region with all ingredients should be able to discover gunpowder');
assert.equal(gunpowderBreakthroughChance(noInputs, localMap, 100), 0, 'missing ingredient access should block independent discovery');

const network = region('network');
const salt = region('salt'); salt.deposits.saltpetre = { tiers: [{}] };
const sulfur = region('sulfur'); sulfur.deposits.sulfur = { tiers: [{}] };
network.recentTradePartners.set('salt', 100);
network.recentTradePartners.set('sulfur', 100);
const networkMap = new Map([[network.id, network], [salt.id, salt], [sulfur.id, sulfur]]);
const networkChance = gunpowderBreakthroughChance(network, networkMap, 100);
assert.ok(networkChance > 0, 'ingredients distributed across active trade partners should enable discovery');
assert.ok(localChance > networkChance, 'co-located ingredients should favour independent invention over distributed access');

const teacher = region('teacher');
teacher.unlockedTechIds.add(GUNPOWDER_TECH_ID);
network.recentTradePartners.set('teacher', 100);
networkMap.set('teacher', teacher);
assert.ok(gunpowderBreakthroughChance(network, networkMap, 100) > networkChance * 100,
  'trade with a gunpowder-using partner should diffuse knowledge much faster than reinvention');

const maker = region('maker');
maker.unlockedTechIds.add(GUNPOWDER_TECH_ID);
maker.stockpile.saltpetre = 500;
maker.stockpile.sulfur = 200;
maker.stockpile.wood = 1000;
maker.stockpile.iron = 1000;
tickGunpowderIndustry([maker], 30);
assert.ok(maker.stockpile.gunpowder > 0, 'gunpowder industry should produce powder');
assert.ok(maker.stockpile.firearms > 0, 'gunpowder industry should build firearms');
assert.ok(maker.stockpile.saltpetre < 500 && maker.stockpile.sulfur < 200, 'powder production must consume chemical inputs');
assert.ok(maker.stockpile.iron < 1000, 'firearms must consume metal');

const defender = region('defender');
const supplied = region('supplied');
supplied.unlockedTechIds.add(GUNPOWDER_TECH_ID);
supplied.firearms.readiness = 0.8;
supplied.stockpile.firearms = 800;
supplied.stockpile.gunpowder = 1000;
supplied.stockpile.iron = 1000;
const suppliedProfile = firearmCombatProfile(supplied, defender, 1000, { consumeSupplies: false, elapsedDays: 7 });
assert.ok(suppliedProfile.multiplier > 1.5, 'well supplied firearms should give a large advantage against an unfamiliar opponent');
assert.ok(suppliedProfile.surpriseBonus > 0.2, 'unfamiliar opponents should suffer a first-contact firearm shock');

const cutOffProfile = firearmCombatProfile(supplied, defender, 1000, {
  consumeSupplies: false,
  elapsedDays: 7,
  logisticsSupply: 0.1,
});
assert.ok(cutOffProfile.multiplier < suppliedProfile.multiplier, 'cut campaign supply should sharply reduce firearm effectiveness even when home stocks are full');
assert.ok(cutOffProfile.supplyFraction <= 0.1 + 1e-9, 'field logistics must cap usable firearm ammunition');

const familiarDefender = region('familiar');
familiarDefender.firearms.exposure = 0.9;
const familiarProfile = firearmCombatProfile(supplied, familiarDefender, 1000, { consumeSupplies: false, elapsedDays: 7 });
assert.ok(familiarProfile.multiplier < suppliedProfile.multiplier, 'firearm familiarity should reduce the surprise advantage');

const dry = region('dry');
dry.unlockedTechIds.add(GUNPOWDER_TECH_ID);
dry.firearms.readiness = 0.9;
dry.stockpile.firearms = 900;
dry.stockpile.gunpowder = 0;
dry.stockpile.iron = 0;
dry.stockpile.bronze = 0;
const dryProfile = firearmCombatProfile(dry, defender, 1000, { consumeSupplies: false, elapsedDays: 7 });
assert.ok(dryProfile.multiplier < 1, 'a firearms-dependent army without powder/shot should be worse than a never-firearm baseline');

const learningDefender = region('learning');
firearmCombatProfile(supplied, learningDefender, 1000, { consumeSupplies: true, elapsedDays: 7 });
assert.ok(learningDefender.firearms.exposure > 0, 'fighting firearms should build opponent familiarity');
assert.ok(supplied.stockpile.gunpowder < 1000, 'combat must consume gunpowder');

console.log('Gunpowder and firearms tests passed');
