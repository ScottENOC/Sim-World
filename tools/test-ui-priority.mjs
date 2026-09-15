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

await frame(0);
if (ticks !== 0) throw new Error('clock ticked before its normal interval');

now = MS_PER_TICK_AT_1X - 100;
clock.deferForInteraction(500);
if (!clock.isInteractionDeferred()) throw new Error('interaction deferral was not exposed to cooperative tick work');
await frame(MS_PER_TICK_AT_1X);
if (ticks !== 0) throw new Error('simulation tick ran while UI interaction deferral was active');

now = MS_PER_TICK_AT_1X + 400;
await frame(MS_PER_TICK_AT_1X + 400);
if (ticks !== 1) throw new Error(`expected one deferred tick, saw ${ticks}`);

let asyncNow = 0;
let asyncFrame = null;
let releaseTick;
const asyncClock = new Clock({
  now: () => asyncNow,
  requestFrame: (fn) => { asyncFrame = fn; return 2; },
  cancelFrame: () => {},
});
let asyncFinished = false;
asyncClock.onTick(async () => {
  await new Promise((resolve) => { releaseTick = resolve; });
  asyncFinished = true;
});
asyncClock.start();
await asyncFrame(0);
asyncNow = MS_PER_TICK_AT_1X;
const inFlight = asyncFrame(MS_PER_TICK_AT_1X);
await Promise.resolve();
if (asyncFinished) throw new Error('async tick listener completed before its yielded work');
if (typeof releaseTick !== 'function') throw new Error('clock did not await the async tick listener');
releaseTick();
await inFlight;
if (!asyncFinished) throw new Error('async tick listener did not resume');
if (!asyncFrame) throw new Error('clock did not schedule the next frame after async tick work');
asyncClock.stop();

console.log('UI-priority clock deferral and cooperative scheduling regression passed');