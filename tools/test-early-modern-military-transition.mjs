import assert from 'node:assert/strict';
import {
  artilleryCampaignProfile,
  banditCombatMultiplier,
  ensureEarlyModernMilitary,
  firearmSteelQualityMultiplier,
  navalGunCombatProfile,
  takeGunpowderSiegeTrain,
  tickEarlyModernIndustry,
  tickIrregularTechnology,
} from '../js/military/earlyModernWarfare.js';
import { firearmCombatProfile } from '../js/military/firearms.js';

function region(overrides = {}) {
  return {
    id: 'r1', name: 'Test Coast', isCoastal: true, population: 10000, banditPopulation: 300,
    stability: 0.35, safetyRating: 0.4,
    unlockedTechIds: new Set(['iron_smelting', 'gunpowder', 'steelmaking']),
    stockpile: { iron: 500, bronze: 300, steel: 150, wood: 600, gunpowder: 120, firearms: 500, saltpetre: 100, sulfur: 100 },
    army: { personnel: 4500, away: 0 }, navy: { boats: 4, advancedBoats: 3, personnel: 48 },
    construction: { assets: [
      { typeId: 'harbour', condition: 1, scale: 1 },
      { typeId: 'shipyard', condition: 1, scale: 1 },
    ] },
    firearms: { readiness: 0.55, exposure: 0, combatExperience: 0 },
    steelIndustry: { readiness: 0.8, militaryCoverage: 0.45 },
    marketDemand: {},
    ...overrides,
  };
}

const gunState = region();
assert.ok(firearmSteelQualityMultiplier(gunState) > 1, 'steel should improve firearms rather than gate them');
const nonSteel = region({ unlockedTechIds: new Set(['iron_smelting', 'gunpowder']), steelIndustry: { readiness: 0, militaryCoverage: 0 } });
assert.equal(firearmSteelQualityMultiplier(nonSteel), 1, 'gunpowder weapons must work without steel');

const industryRegion = region();
tickEarlyModernIndustry([industryRegion], 365);
const early = ensureEarlyModernMilitary(industryRegion);
assert.ok(early.artillery.inventory.length > 0, 'gunpowder polity should build siege artillery');
assert.ok(early.naval.guns.length > 0, 'coastal dockyard polity should fit naval guns');
assert.ok(early.artillery.inventory.some((gun) => ['steel', 'bronze', 'iron'].includes(gun.metal)), 'artillery should retain material quality');

const train = takeGunpowderSiegeTrain(industryRegion, 2000);
assert.ok(train.length > 0, 'campaign should take real artillery from inventory');
const powderBeforeSiege = industryRegion.stockpile.gunpowder;
const siege = artilleryCampaignProfile(industryRegion, train, { elapsedDays: 7, logisticsSupply: 1, consumeSupplies: true });
assert.ok(siege.fortDefenceMultiplier < 1, 'supplied gunpowder artillery should reduce fort advantage');
assert.ok(siege.combatMultiplier > 1, 'field artillery should help attacking combat power');
assert.ok(industryRegion.stockpile.gunpowder < powderBeforeSiege, 'artillery must consume gunpowder');

const fleetRegion = region();
tickEarlyModernIndustry([fleetRegion], 365);
const ships = [
  { designId: 'advanced_warship', condition: 1 },
  { designId: 'advanced_warship', condition: 1 },
  { designId: 'basic_war_boat', condition: 1 },
];
const powderBeforeFleet = fleetRegion.stockpile.gunpowder;
const gunnery = navalGunCombatProfile(fleetRegion, ships, { consumeSupplies: true });
assert.ok(gunnery.multiplier > 1, 'gun-armed ships should gain combat power');
assert.ok(gunnery.gunsUsed > 0, 'persistent fleet should use fitted naval guns');
assert.ok(fleetRegion.stockpile.gunpowder < powderBeforeFleet, 'naval guns must consume powder');

const firearmRegion = region();
const opponent = region({ id: 'r2', unlockedTechIds: new Set(['iron_smelting']), stockpile: { iron: 100, bronze: 100, wood: 100, gunpowder: 0, firearms: 0 }, firearms: { readiness: 0, exposure: 0, combatExperience: 0 }, steelIndustry: { readiness: 0, militaryCoverage: 0 } });
const firearmProfile = firearmCombatProfile(firearmRegion, opponent, 400, { consumeSupplies: false, elapsedDays: 7 });
assert.ok(firearmProfile.metallurgyMultiplier > 1, 'steel military adoption should improve firearm combat quality');

const irregularRegion = region();
tickEarlyModernIndustry([irregularRegion], 365);
const world = { nonStateOrganisations: [{
  id: 'pirates', type: 'pirate_haven', active: true, hostRegionIds: new Set([irregularRegion.id]),
  militaryCapacity: 200,
}] };
tickIrregularTechnology([irregularRegion], world, 365, () => 0);
assert.ok(irregularRegion.banditTechnology.firearms > 0, 'bandits should steal locally available firearms');
assert.ok(irregularRegion.banditTechnology.gunpowder > 0, 'bandits should acquire powder with firearms');
assert.ok(banditCombatMultiplier(irregularRegion) > 1, 'armed bandits should become harder to suppress');
assert.ok(world.nonStateOrganisations[0].militaryTechnology.firearms > 0, 'pirate havens should diffuse firearm knowledge from host regions');
assert.ok(world.nonStateOrganisations[0].militaryTechnology.navalGunnery > 0, 'pirate havens should learn naval gunnery from host regions');
assert.ok(world.nonStateOrganisations[0].militaryTechnologyMultiplier > 1, 'pirate military capacity should improve with diffused technology');

console.log('Early-modern military transition regression passed');
