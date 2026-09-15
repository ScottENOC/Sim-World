import assert from 'node:assert/strict';
import {
  tickIndustrialMarine, industrialMarineFleetProfile, navalGunTechnologyMultiplier,
  STATIONARY_STEAM_TECH_ID, HIGH_PRESSURE_STEAM_TECH_ID, MARINE_STEAM_TECH_ID,
  SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID, NAVAL_GUN_TYPES,
} from '../js/technology/industrialMarine.js';

function industrialPort() {
  return {
    id: 'port', name: 'Industrial Port', isCoastal: true, neighbors: [], tradePartnerIds: [],
    unlockedTechIds: new Set(['iron_smelting', 'mine_drainage', 'advanced_boatbuilding', 'steelmaking', 'rifling']),
    stockpile: { coal: 10000, iron: 10000, steel: 10000, wood: 10000 },
    occupations: { miner: 900 },
    industrialSupply: {
      capability: { steelmaking: 0.9, precision_machining: 0.9, locomotive_engineering: 0.8, rail_vehicle_manufacture: 0.7, railway_engineering: 0.7 },
      inventory: { machine_components: 1000 },
    },
    construction: { projects: [], completed: {}, assets: [
      { id: 'h', typeId: 'harbour', condition: 1, scale: 1 },
      { id: 's', typeId: 'shipyard', condition: 1, scale: 1 },
    ] },
    corporateCapital: { firms: [{ status: 'active', capitalIndex: 30 }] },
    earlyModernMilitary: { naval: { readiness: 0.8, guns: Array.from({ length: 16 }, (_, i) => ({ metal: i < 8 ? 'iron' : 'steel', condition: 1 })) } },
  };
}

const port = industrialPort();
for (let year = 0; year < 40; year++) tickIndustrialMarine([port], 365.2425, () => 0);
for (const tech of [STATIONARY_STEAM_TECH_ID, HIGH_PRESSURE_STEAM_TECH_ID, MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID]) {
  assert.ok(port.unlockedTechIds.has(tech), `expected ${tech} to emerge from mature industrial capability`);
}
const profile = industrialMarineFleetProfile(port);
assert.ok(profile.merchantFleet.paddleSteamTonnage + profile.merchantFleet.screwSteamTonnage + profile.merchantFleet.ironSteamTonnage + profile.merchantFleet.steelSteamTonnage > 0,
  'steam merchant shipping should be physically built and consume inputs');
assert.ok(port.stockpile.coal < 10000 && port.stockpile.wood < 10000, 'steamship construction should consume real resources');
assert.ok(port.earlyModernMilitary.naval.guns.some((gun) => gun.technology === NAVAL_GUN_TYPES.BREECH),
  'rifling plus mature precision machining should modernise naval artillery beyond old smoothbores');
assert.ok(navalGunTechnologyMultiplier({ technology: NAVAL_GUN_TYPES.BREECH }) > navalGunTechnologyMultiplier({ technology: NAVAL_GUN_TYPES.RIFLED }));
assert.ok(navalGunTechnologyMultiplier({ technology: NAVAL_GUN_TYPES.RIFLED }) > navalGunTechnologyMultiplier({ technology: NAVAL_GUN_TYPES.SMOOTHBORE }));

const inland = industrialPort();
inland.id = 'inland'; inland.isCoastal = false; inland.construction.assets = [];
for (let year = 0; year < 40; year++) tickIndustrialMarine([inland], 365.2425, () => 0);
assert.ok(inland.unlockedTechIds.has(STATIONARY_STEAM_TECH_ID), 'stationary steam should not require a coast');
assert.ok(!inland.unlockedTechIds.has(MARINE_STEAM_TECH_ID), 'marine steam should require coastal shipbuilding practice');

console.log('Industrial steam, marine engineering, metal hull and naval-gun regressions passed.');
