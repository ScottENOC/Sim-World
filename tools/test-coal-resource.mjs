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
assert.match(region, /id: 'surface'.*Outcropping and shallow coal seams/s, 'coal needs an accessible shallow tier');
assert.match(region, /id: 'shaft'.*requiredTechId: 'deep_mining'/s, 'shaft coal must require deep mining');
assert.match(region, /id: 'deep'.*requiredTechId: 'early_steam_pumping'/s, 'deep wet seams must require steam-era pumping');
assert.match(region, /const deep = Math\.round\(scale \* \(420 \+ coalSignal \* 720\)\)/, 'deep coal should hold substantially larger later reserves');
assert.match(industry, /region\.stockpile\.coal = Math\.max\(0, \(region\.stockpile\.coal \|\| 0\) - burned\)/, 'industry must consume coal stock');
assert.match(industry, /asset\.productivity \*= fuelRatio/, 'coal-fired assets must idle when fuel is unavailable');

console.log('coal resource regressions passed');
