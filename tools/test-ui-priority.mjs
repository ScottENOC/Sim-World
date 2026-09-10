import { Clock, MS_PER_TICK_AT_1X } from '../js/core/clock.js';

let now = 0;
let frame = null;
const clock = new Clock({
  now: () => now,
  requestFrame: (fn) => { frame = fn; return 1; },
  cancelFrame: () => {},
});
let ticks = 0;
clock.onTick(() => { ticks += 1; });
clock.start();
if (!frame) throw new Error('clock did not request an animation frame');

frame(0);
if (ticks !== 0) throw new Error('clock ticked before its normal interval');

now = MS_PER_TICK_AT_1X - 100;
clock.deferForInteraction(500);
frame(MS_PER_TICK_AT_1X);
if (ticks !== 0) throw new Error('simulation tick ran while UI interaction deferral was active');

now = MS_PER_TICK_AT_1X + 400;
frame(MS_PER_TICK_AT_1X + 400);
if (ticks !== 1) throw new Error(`expected one deferred tick, saw ${ticks}`);

console.log('UI-priority clock deferral regression passed');
