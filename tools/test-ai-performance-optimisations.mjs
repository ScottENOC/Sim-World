import fs from 'node:fs';
import assert from 'node:assert/strict';

const strategy = fs.readFileSync('js/military/strategicPlanning.js', 'utf8');
const scouting = fs.readFileSync('js/core/scouting.js', 'utf8');
const nation = fs.readFileSync('js/ai/nationAi.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');

assert.ok(strategy.includes('export function buildMilitaryStrategyContext'), 'military strategy context missing');
assert.ok(strategy.includes('supportByRegion'), 'support agreement index missing');
assert.ok(strategy.includes('strategyContext?.regionsById.get'), 'strategy target lookup is not indexed');
assert.ok(strategy.includes('ctx.regionsById.get(id)'), 'known military contacts are not indexed');
assert.ok(strategy.includes('vassalLevyOffer(subject, region, currentTick)'), 'indexed vassal levy calculation missing');

assert.ok(scouting.includes('export function buildScoutingContext'), 'scouting context missing');
assert.ok(scouting.includes('coastalBySea'), 'coastal sea index missing');
assert.ok(scouting.includes('context.coastalBySea.get(seaId)'), 'sea scouting does not use coastal index');

assert.ok(nation.includes("detail('military strategy context'"), 'Nation AI does not build military context once');
assert.ok(nation.includes("detail('scouting context'"), 'Nation AI does not build scouting context once');
assert.ok(nation.includes('militaryStrategyContext));'), 'Nation AI does not pass military context');
assert.ok(nation.includes('scoutingContext));'), 'Nation AI does not pass scouting context');

assert.ok(main.includes("event.type === 'disease_recognised' || event.type === 'disease_outbreak'"), 'disease event renderer missing');
assert.ok(main.includes("`${event.pathogenLabel || 'Disease'} outbreak`"), 'disease outbreak title missing');

console.log('AI performance optimisation regression passed');
