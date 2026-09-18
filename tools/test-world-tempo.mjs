import assert from 'node:assert/strict';
import { assessWorldTempo } from '../js/core/worldTempo.js';
import { Clock, MS_PER_TICK_AT_1X } from '../js/core/clock.js';

function region(id, population=100000) {
  return {
    id, population,
    unlockedTechIds: new Set(),
    construction: { projects: [], completed: {}, assets: [], workersReserved: 0 },
    governance: { administrativeControl: 0.25 },
    publicEducation: { literacy: 0.04 },
  };
}
function asset(typeId, condition=1) { return { id: `${typeId}-${Math.random()}`, typeId, condition, scale: 1 }; }

const bronze = Array.from({ length: 20 }, (_, i) => region(`b${i}`));
const bronzeTempo = assessWorldTempo(bronze);
assert.ok(bronzeTempo.daysPerTick > 28.5, `Bronze baseline should remain about monthly, got ${bronzeTempo.daysPerTick}`);

const prototype = bronze.map((r, i) => ({ ...r, unlockedTechIds: new Set(r.unlockedTechIds), construction: { ...r.construction, assets: [...r.construction.assets] } }));
prototype[0].unlockedTechIds.add('electrical_telegraphy');
prototype[0].construction.assets.push(asset('telegraph_network'));
const prototypeTempo = assessWorldTempo(prototype);
assert.ok(prototypeTempo.daysPerTick > 26, 'One telegraph prototype must not collapse global turn length');

const industrial = Array.from({ length: 20 }, (_, i) => region(`i${i}`, i < 12 ? 200000 : 60000));
for (let i = 0; i < 14; i++) {
  const r = industrial[i];
  r.publicEducation.literacy = 0.72;
  r.governance.administrativeControl = 0.78;
  r.unlockedTechIds.add('printing_press');
  r.unlockedTechIds.add('rail_transport');
  r.unlockedTechIds.add('electrical_telegraphy');
  r.unlockedTechIds.add('telephone_networks');
  r.unlockedTechIds.add('local_electric_distribution');
  r.railway = { networkLevel: 0.72 };
  r.telephoneNetwork = { coverage: 0.52 };
  r.electricity = { coverage: 0.48 };
  r.construction.assets.push(asset('relay_stations'), asset('telegraph_network'), asset('telephone_exchange'), asset('local_electric_grid'));
}
const industrialTempo = assessWorldTempo(industrial);
assert.ok(industrialTempo.daysPerTick < 14, `Broad industrial adoption should produce sub-fortnight turns, got ${industrialTempo.daysPerTick}`);
assert.ok(industrialTempo.daysPerTick > 3, 'Rail/telegraph/telephone without mature aviation should not instantly force daily turns');

const fast = industrial.map((r) => ({ ...r, unlockedTechIds: new Set(r.unlockedTechIds), construction: { ...r.construction, assets: [...r.construction.assets] } }));
for (const r of fast.slice(0, 16)) {
  r.unlockedTechIds.add('powered_flight');
  r.construction.assets.push(asset('airfield'), asset('airfield'));
  r.aviation = { aircraftCount: 20 };
  r.telephoneNetwork = { coverage: 0.9 };
  r.electricity = { coverage: 0.9 };
  r.railway = { networkLevel: 0.95 };
}
const fastTempo = assessWorldTempo(fast);
assert.ok(fastTempo.daysPerTick < industrialTempo.daysPerTick, 'Further deployment must continue to shorten turns gradually');
assert.ok(fastTempo.daysPerTick >= 1, 'Adaptive cadence must never go below one simulated day');

const clock = new Clock({ now: () => 0, requestFrame: () => 1, cancelFrame: () => {} });
clock.setWorldTempo(industrialTempo);
assert.equal(clock.daysPerTick, industrialTempo.daysPerTick);
assert.equal(clock.resolution.id, 'adaptive');
assert.equal(MS_PER_TICK_AT_1X, 2000, '1x wall-clock target should be two seconds');

console.log('World tempo regression passed', {
  bronzeDays: bronzeTempo.daysPerTick.toFixed(2),
  prototypeDays: prototypeTempo.daysPerTick.toFixed(2),
  industrialDays: industrialTempo.daysPerTick.toFixed(2),
  fastDays: fastTempo.daysPerTick.toFixed(2),
});
