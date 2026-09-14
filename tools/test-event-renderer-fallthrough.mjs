import fs from 'node:fs';

const source = fs.readFileSync('js/main.js', 'utf8');
const showStart = source.indexOf('function showNextEvent(clock, eventQueue)');
const wireStart = source.indexOf('function wireEventContinue(clock, eventQueue)');
if (showStart < 0 || wireStart < 0) throw new Error('event renderer functions missing');
const show = source.slice(showStart, wireStart);
const wire = source.slice(wireStart, source.indexOf('const RESOURCE_LABELS', wireStart));

for (const needle of [
  "event.type === 'religious_variant'",
  "event.type === 'religious_directive'",
  "event.type !== 'raid_resolved' || !event.outcome || !event.raid",
  "const won = outcome.attackerRatio > 0.5",
]) {
  if (!show.includes(needle)) throw new Error(`showNextEvent missing: ${needle}`);
}
if (wire.includes('event.type') || wire.includes('event.religion') || wire.includes('event.directive')) {
  throw new Error('wireEventContinue still references out-of-scope event');
}
const guardPos = show.indexOf("event.type !== 'raid_resolved'");
const ratioPos = show.indexOf('outcome.attackerRatio');
if (!(guardPos >= 0 && ratioPos > guardPos)) throw new Error('raid shape guard must precede attackerRatio access');

console.log('event renderer fallthrough regression passed');
