import fs from 'node:fs';
import assert from 'node:assert/strict';

const nation = fs.readFileSync('js/ai/nationAi.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const exploration = fs.readFileSync('js/economy/oceanicExploration.js', 'utf8');

assert.ok(nation.includes('`Nation AI: ${label}`'), 'nested Nation AI profiler prefix missing');
for (const label of [
  'campaign management',
  'joint operations',
  'military policy',
  'military strategy',
  'memory policy',
  'agreement choice',
  'campaign choice',
  'raid choice',
]) {
  assert.ok(nation.includes(`detail('${label}'`), `missing nested profiler detail ${label}`);
}
assert.ok(nation.includes("metric('regions evaluated'"), 'AI region count metric missing');
assert.ok(nation.includes("metric('strategic reviews'"), 'AI strategic review metric missing');
assert.ok(main.includes('{ fleets, seaRegions, profiler }'), 'main does not pass profiler into Nation AI');

assert.ok(main.includes("event.type === 'exploration_voyage_success'"), 'missing success voyage presentation');
assert.ok(main.includes("event.type === 'exploration_voyage_failed' || event.type === 'exploration_voyage_lost'"), 'missing failed/lost voyage presentation');
assert.ok(exploration.includes('targetSeaName:'), 'exploration events do not carry a human-readable sea name');
assert.ok(main.includes('Unhandled simulation event: ${event.type'), 'unknown-event warning does not print event type');

console.log('performance profiling v2 regression passed');
