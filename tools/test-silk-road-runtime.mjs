#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tradeGood } from '../js/economy/tradeGoods.js';

for (const resource of ['silk', 'saltpetre', 'sulfur']) {
  assert.ok(tradeGood(resource), `${resource} must be a tradable good`);
}

const geo = JSON.parse(fs.readFileSync(new URL('../data/world/regions.geo.json', import.meta.url), 'utf8'));
const resources = JSON.parse(fs.readFileSync(new URL('../data/world/resources.initial.json', import.meta.url), 'utf8'));
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const labor = fs.readFileSync(new URL('../js/economy/laborCore.js', import.meta.url), 'utf8');
const regionLoader = fs.readFileSync(new URL('../js/world/region.js', import.meta.url), 'utf8');

assert.equal(geo.features.length, 720, 'expanded world must have 720 land regions');
const byGroup = new Map();
for (const feature of geo.features) {
  const group = feature.properties?.sourceGroup;
  if (!byGroup.has(group)) byGroup.set(group, []);
  byGroup.get(group).push(feature);
}
assert.equal(byGroup.get('CHN')?.length, 36, 'China should have 36 gameplay regions');
assert.equal(byGroup.get('PAK')?.length, 10, 'Indus/NW corridor should have 10 gameplay regions');
for (const group of ['KAZ','TKM','UZB','KGZ','TJK','AFG','PAK','CHN','MNG']) {
  assert.match(main, new RegExp(`'${group}': \\{ continent: 'Asia'`), `${group} must appear under Asia in picker navigation`);
}
const china = byGroup.get('CHN')[0];
const chinaEndowment = resources[china.properties.id];
assert.ok(chinaEndowment.specialResources?.silk > 0, 'Chinese regions need silk potential');
assert.ok(chinaEndowment.deposits?.saltpetre, 'Chinese regions need saltpetre endowment');
assert.ok(chinaEndowment.deposits?.sulfur, 'Chinese regions need sulfur endowment');
assert.match(regionLoader, /region\.specialResources/, 'runtime loader must preserve special resources');
assert.match(labor, /silkMade/, 'economy must produce silk from sericulture potential');
assert.match(labor, /saltpetre/, 'economy must be able to mine saltpetre');
assert.match(labor, /sulfur/, 'economy must be able to mine sulfur');

console.log('Silk Road runtime tests passed');
