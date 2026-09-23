import assert from 'node:assert/strict';
import {
  armouredVehicleOperationalProfile,
  HYDROGEN_ARMOURED_PROPULSION_TECH_ID,
  modernInfantryProfile,
} from '../js/military/modernLandWarfare.js';
import {
  HYDROGEN_AVIATION_PROPULSION_TECH_ID,
  rebaseAircraft,
} from '../js/military/aviation.js';

function armouredRegion(techs = []) {
  return {
    id: 'armour-test',
    unlockedTechIds: new Set(techs),
    stockpile: { diesel: 0, hydrogen: 20, small_arms_ammunition: 0 },
    industrialSupply: { inventory: { tank: 8, self_propelled_gun: 2 } },
  };
}

{
  const region = armouredRegion(['hydrogen_transport_fuels']);
  const openingHydrogen = region.stockpile.hydrogen;
  const profile = armouredVehicleOperationalProfile(region, 180, { elapsedDays: 7, consumeFuel: true });
  assert.equal(profile.hydrogenCapable, false, 'generic hydrogen transport tech must not make tanks hydrogen-capable');
  assert.equal(profile.operationalFraction, 0, 'diesel-starved conventional armour should be immobilised');
  assert.equal(region.stockpile.hydrogen, openingHydrogen, 'conventional armour must not consume hydrogen');
}

{
  const region = armouredRegion(['hydrogen_transport_fuels', HYDROGEN_ARMOURED_PROPULSION_TECH_ID]);
  const openingHydrogen = region.stockpile.hydrogen;
  const profile = armouredVehicleOperationalProfile(region, 180, { elapsedDays: 7, consumeFuel: true });
  assert.equal(profile.hydrogenCapable, true);
  assert(profile.operationalFraction > 0.99, 'hydrogen-capable armour should operate from adequate hydrogen when diesel is unavailable');
  assert(profile.hydrogenUsed > 0, 'hydrogen-capable armour should consume real hydrogen inventory');
  assert(region.stockpile.hydrogen < openingHydrogen);
  assert(profile.combatMultiplier > 1, 'fuelled armour should contribute to battlefield power');
}

{
  const region = armouredRegion(['hydrogen_transport_fuels', HYDROGEN_ARMOURED_PROPULSION_TECH_ID]);
  const profile = modernInfantryProfile(region, 180, { suppliedShare: 0 }, { elapsedDays: 7, consumeSupplies: true });
  assert(profile.multiplier > 1, 'fuelled armour must still contribute when small-arms supply is zero');
  assert.equal(profile.machineGuns, false);
  assert(profile.armour.hydrogenUsed > 0);
}

function aviationRegion(id, techs = []) {
  return {
    id,
    governance: { sovereignPolityId: 'test-polity' },
    unlockedTechIds: new Set(techs),
    stockpile: { aviation_fuel: 0, hydrogen: 20 },
    construction: { assets: [{ id: `${id}-airfield`, typeId: 'airfield', condition: 1, status: 'operational', scale: 1 }] },
    aviation: {
      aircraft: [{
        id: 'air-h2-test', aircraftType: 'fixed_wing', ownerType: 'civilian', ownerActorId: 'test-polity', role: 'mail',
        homeBaseRegionId: 'origin', baseRegionId: 'origin', condition: 1, fuel: 1, status: 'serviceable', mission: 'idle', totalFlights: 0,
      }],
      flightExperience: 0,
    },
  };
}

{
  const origin = aviationRegion('origin', ['hydrogen_transport_fuels']);
  const target = aviationRegion('target', ['hydrogen_transport_fuels']);
  target.aviation.aircraft = [];
  const openingHydrogen = origin.stockpile.hydrogen;
  const result = rebaseAircraft(origin, target, 'air-h2-test', [], new Map([[origin.id, origin], [target.id, target]]));
  assert.equal(result.rebased, false, 'generic hydrogen transport tech must not let conventional aircraft burn hydrogen');
  assert.equal(result.reason, 'insufficient_fuel');
  assert.equal(origin.stockpile.hydrogen, openingHydrogen);
}

{
  const techs = ['hydrogen_transport_fuels', HYDROGEN_AVIATION_PROPULSION_TECH_ID];
  const origin = aviationRegion('origin', techs);
  const target = aviationRegion('target', techs);
  target.aviation.aircraft = [];
  const openingHydrogen = origin.stockpile.hydrogen;
  const result = rebaseAircraft(origin, target, 'air-h2-test', [], new Map([[origin.id, origin], [target.id, target]]));
  assert.equal(result.rebased, true, 'hydrogen-specific aircraft should be able to rebase without fossil aviation fuel');
  assert(origin.stockpile.hydrogen < openingHydrogen, 'hydrogen aircraft must consume real hydrogen stock');
  assert.equal(target.aviation.aircraft.some(a => a.id === 'air-h2-test'), true);
}

console.log('Hydrogen military propulsion regression passed.');
