import assert from 'node:assert/strict';
import {
  NAVAL_REACTOR_TECH_ID,
  SUBMARINE_SNORKEL_TECH_ID,
  SUBMARINE_MODES,
  SUBMARINE_PROPULSION,
  ensureSubmarineSystems,
  submarineCanAmbush,
  submarineDetectionSignature,
  tickSubmarineFleet,
  tickSubmarineShip,
} from '../js/military/submarineOperations.js';
import { BATTERY_TECH_IDS } from '../js/economy/batteryStorage.js';

function region(extraTech = []) {
  return {
    id: 'home', isCoastal: true,
    unlockedTechIds: new Set(['practical_submarine', BATTERY_TECH_IDS.LEAD_ACID, ...extraTech]),
    stockpile: { diesel: 30 },
    industrialSupply: { capability: { precision_machining: 0.8 } },
    industrialMarine: { marineEngineering: 0.8 },
    electricity: { industrialService: 0.8 },
  };
}
function sub(id = 'sub1') { return { id, designId: 'submarine', condition: 1 }; }
function fleet(owner = region(), ship = sub()) {
  return { id: 'fleet1', ownerRegionId: owner.id, locationType: 'sea', seaRegionId: 'sea1', mission: 'submarine_patrol', ships: [ship] };
}

// Battery and atmosphere are separate submerged constraints.
{
  const owner = region();
  const ship = sub();
  const initial = ensureSubmarineSystems(ship, owner);
  assert.equal(initial.propulsion, SUBMARINE_PROPULSION.DIESEL_ELECTRIC);
  tickSubmarineShip(ship, owner, { elapsedDays: 7, requestedMode: SUBMARINE_MODES.QUIET, atSea: true });
  assert.ok(ship.submarineSystems.batteryCharge < 1);
  assert.ok(ship.submarineSystems.atmosphereReserve < 1);
  assert.notEqual(ship.submarineSystems.batteryCharge, ship.submarineSystems.atmosphereReserve);
}

// A boat without a snorkel has to surface when battery/air become critical.
{
  const owner = region();
  const ship = sub();
  const state = ensureSubmarineSystems(ship, owner);
  state.batteryCharge = 0.12;
  state.atmosphereReserve = 0.14;
  tickSubmarineShip(ship, owner, { elapsedDays: 7, atSea: true });
  assert.equal(state.mode, SUBMARINE_MODES.SURFACED);
  assert.ok(state.batteryCharge > 0.12);
  assert.ok(state.atmosphereReserve > 0.14);
  assert.ok(state.lastSignature > 0.85);
}

// A snorkel lets the same submarine recharge and ventilate without fully surfacing,
// but it remains far more detectable than a quiet submerged boat.
{
  const owner = region([SUBMARINE_SNORKEL_TECH_ID]);
  const ship = sub();
  const state = ensureSubmarineSystems(ship, owner);
  state.batteryCharge = 0.12;
  state.atmosphereReserve = 0.14;
  tickSubmarineShip(ship, owner, { elapsedDays: 7, atSea: true });
  assert.equal(state.mode, SUBMARINE_MODES.SNORKEL);
  assert.ok(state.batteryCharge > 0.12);
  assert.ok(state.atmosphereReserve > 0.14);
  assert.ok(state.lastSignature > 0.6 && state.lastSignature < 0.8);
}

// Better batteries materially extend quiet submerged endurance.
{
  const lead = region();
  const lithium = region([BATTERY_TECH_IDS.ADVANCED, BATTERY_TECH_IDS.LITHIUM_ION]);
  const a = sub('lead');
  const b = sub('lithium');
  tickSubmarineShip(a, lead, { elapsedDays: 14, requestedMode: SUBMARINE_MODES.QUIET, atSea: true });
  tickSubmarineShip(b, lithium, { elapsedDays: 14, requestedMode: SUBMARINE_MODES.QUIET, atSea: true });
  assert.ok(b.submarineSystems.batteryCharge > a.submarineSystems.batteryCharge);
  assert.ok(b.submarineSystems.lastSignature < a.submarineSystems.lastSignature);
}

// Naval reactor propulsion is a distinct submarine type: no snorkelling cycle,
// propulsion battery does not drain, atmosphere is regenerated, and stores become the long-term constraint.
{
  const owner = region([NAVAL_REACTOR_TECH_ID]);
  const ship = sub();
  const state = ensureSubmarineSystems(ship, owner);
  assert.equal(state.propulsion, SUBMARINE_PROPULSION.NUCLEAR);
  state.batteryCharge = 0.55;
  state.atmosphereReserve = 0.55;
  tickSubmarineShip(ship, owner, { elapsedDays: 21, atSea: true });
  assert.equal(state.mode, SUBMARINE_MODES.NUCLEAR_CRUISE);
  assert.ok(state.batteryCharge >= 0.55);
  assert.ok(state.atmosphereReserve >= 0.55);
  assert.ok(state.storesReserve < 1);
}

// Fleet status drives actual ambush availability and acoustic exposure.
{
  const owner = region([SUBMARINE_SNORKEL_TECH_ID]);
  const f = fleet(owner);
  const state = ensureSubmarineSystems(f.ships[0], owner);
  state.batteryCharge = 0.10;
  state.atmosphereReserve = 0.10;
  const status = tickSubmarineFleet(f, owner, { elapsedDays: 7 });
  assert.equal(status.mode, SUBMARINE_MODES.SNORKEL);
  assert.equal(submarineCanAmbush(f), false);
  assert.ok(submarineDetectionSignature(f) > 0.6);
}

console.log('submarine endurance regressions passed');
