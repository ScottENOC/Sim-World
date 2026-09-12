#!/usr/bin/env node
import assert from 'node:assert/strict';
import { medievalBreakthroughChances, CROSSBOW_TECH_ID, HEAVY_CAVALRY_TECH_ID, OCEAN_SAILING_TECH_ID, oceanSailingProfile } from '../js/technology/medievalTransition.js';
import { FORMATION_ARCHETYPES, formationCombatMultiplier } from '../js/military/formations.js';
import { seaTransportProfile } from '../js/economy/trade.js';

function region(id) {
  return {
    id, name: id, population: 20000, isCoastal: true,
    unlockedTechIds: new Set(['iron_smelting','advanced_boatbuilding','mounted_cavalry','military_drill']),
    ironWorkingReadiness: 0.8,
    experience: { smithing: 300000, boatbuilding: 500000, horseHusbandry: 500000, maritimeTrade: 500000, maritimeScouting: 250000 },
    education: {}, neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(),
    army: { personnel: 1000, away: 0 }, navy: { boats: 10, advancedBoats: 8, personnel: 120 },
    horseEconomy: { war: 180 }, stockpile: { iron: 500, bronze: 0 },
    tradeEconomy: { merchantBoats: 10, advancedMerchantBoats: 8 },
    militaryExperience: { field: 0.45, institutional: 0.55, lastFieldTick: 0, engagementWeeks: 20, trainingYears: 12 },
    militaryInstitutions: { officerSchoolProgress: 1, officerSchoolActive: true },
    militaryPolicy: { armyPermanence: 0.7 },
    infrastructure: {
      drill_ground: { count: 1, condition: 1 }, royal_arsenal: { count: 1, condition: 1 },
      harbour: { count: 1, condition: 1 }, administrative_centre: { count: 1, condition: 1 },
    },
    militaryFormations: { traditions: [], progress: {}, retired: [] },
  };
}

const r = region('r');
const map = new Map([[r.id,r]]);
const chances = medievalBreakthroughChances(r,map);
assert.ok(chances[CROSSBOW_TECH_ID] > 0, 'crossbows should emerge from iron/smithing/military practice');
assert.ok(chances[HEAVY_CAVALRY_TECH_ID] > 0, 'heavy cavalry should emerge from cavalry, horses, iron and institutions');
assert.ok(chances[OCEAN_SAILING_TECH_ID] > 0, 'ocean sailing should emerge from advanced boats and maritime practice');

assert.ok(FORMATION_ARCHETYPES.crossbow_companies, 'crossbow formation missing');
assert.ok(FORMATION_ARCHETYPES.knightly_retinues, 'knightly formation missing');
r.militaryFormations.traditions.push({ archetypeId:'crossbow_companies', status:'active', coverage:0.3, readiness:0.9 });
assert.ok(formationCombatMultiplier(r,'plains') > 1, 'formation combat bonuses should affect combat');

const before = oceanSailingProfile(r);
assert.equal(before.known, false);
r.unlockedTechIds.add(OCEAN_SAILING_TECH_ID);
const after = oceanSailingProfile(r);
assert.ok(after.rangeMultiplier > 1.5, 'ocean sailing should materially extend range');
const other = region('other');
other.unlockedTechIds.delete(OCEAN_SAILING_TECH_ID);
const sea = seaTransportProfile(r, other);
assert.ok(sea.oceanCapable, 'advanced fleet with ocean sailing should be ocean capable');
assert.ok(sea.rangeKm > 3000, 'medieval ocean-capable trade should cross large open-water distances');

console.log('Medieval learning tests passed');
