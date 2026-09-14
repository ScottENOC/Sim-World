import fs from 'node:fs';
import assert from 'node:assert/strict';

const goods = fs.readFileSync('js/economy/tradeGoods.js', 'utf8');
const labour = fs.readFileSync('js/economy/laborCore.js', 'utf8');
const region = fs.readFileSync('js/world/region.js', 'utf8');
const industry = fs.readFileSync('js/economy/protoIndustry.js', 'utf8');

assert.match(goods, /coal:\s+\{ label: 'Coal'/, 'coal must be a normal trade good');
assert.match(goods, /category: 'bulk_fuel'/, 'coal must be classified as bulk fuel');
assert.match(labour, /coal: 2\.4/, 'miners must allocate labour to coal');
assert.match(labour, /coal: 3500/, 'coal mines need a sale buffer like other ores');
assert.match(region, /region\.deposits\.coal = \{ tiers:/, 'regions must be able to contain coal deposits');
assert.match(region, /requiredTechId: 'deep_mining'/, 'deep coal must be gated by deep mining');
assert.match(industry, /region\.stockpile\.coal = Math\.max\(0, \(region\.stockpile\.coal \|\| 0\) - burned\)/, 'industry must consume coal stock');
assert.match(industry, /asset\.productivity \*= fuelRatio/, 'coal-fired assets must idle when fuel is unavailable');

console.log('coal resource regressions passed');
