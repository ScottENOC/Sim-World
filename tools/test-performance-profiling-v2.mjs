import fs from 'node:fs';
import assert from 'node:assert/strict';

const nation = fs.readFileSync('js/ai/nationAi.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const exploration = fs.readFileSync('js/economy/oceanicExploration.js', 'utf8');

for (const label of [
  'Nation AI: campaign management',
  'Nation AI: joint operations',
  'Nation AI: military policy',
  'Nation AI: military strategy',
  'Nation AI: memory policy',
  'Nation AI: agreement choice',
  'Nation AI: campaign choice',
  'Nation AI: raid choice',
]) {
  assert.ok(nation.includes(label), `missing nested profiler label ${label}`);
}
assert.ok(nation.includes("metric('regions evaluated'"), 'AI region count metric missing');
assert.ok(nation.includes("metric('strategic reviews'"), 'AI strategic review metric missing');
assert.ok(main.includes('{ fleets, seaRegions, profiler }'), 'main does not pass profiler into Nation AI');

for (const type of ['exploration_voyage_success', 'exploration_voyage_failed', 'exploration_voyage_lost']) {
  assert.ok(main.includes(`event.type === '${type}'`) || main.includes(`event.type === 'exploration_voyage_failed' || event.type === 'exploration_voyage_lost'`), `missing event presentation for ${type}`);
}
assert.ok(exploration.includes('targetSeaName:'), 'exploration events do not carry a human-readable sea name');
assert.ok(main.includes('Unhandled simulation event: ${event.type'), 'unknown-event warning does not print event type');

console.log('performance profiling v2 regression passed');
