import assert from 'node:assert/strict';
import fs from 'node:fs';

const navigation = JSON.parse(fs.readFileSync('data/world/region-navigation.json', 'utf8'));
const geo = JSON.parse(fs.readFileSync('data/world/regions.geo.json', 'utf8'));
const regionIds = new Set(geo.features.map((feature) => feature.properties.id));

assert.equal(Object.keys(navigation.regions).length, regionIds.size, 'every simulation region needs navigation metadata');
for (const id of regionIds) {
  const memberships = navigation.regions[id];
  assert.ok(Array.isArray(memberships) && memberships.length > 0, `${id} needs at least one navigation membership`);
  for (const membership of memberships) {
    assert.ok(membership.continent && membership.country, `${id} navigation membership must name continent and country`);
  }
}

const countries = new Set(navigation.countries || []);
for (const expected of ['United Kingdom', 'France', 'Spain', 'China', 'India', 'Japan', 'Australia', 'New Zealand', 'Türkiye', 'Palestine', 'Kosovo']) {
  assert.ok(countries.has(expected), `expected modern navigation country/economy ${expected}`);
}
for (const forbidden of ['Anatolia', 'Mesopotamia', 'Kazakh Steppe', 'Mongolian Steppe', 'Western Iran', 'Southern Levant']) {
  assert.ok(!countries.has(forbidden), `physical simulation grouping ${forbidden} must not be presented as a modern country`);
}
assert.ok((navigation.multiCountryRegionCount || 0) > 0, 'at least one simulation region should be discoverable through multiple modern countries');

const startup = fs.readFileSync('js/ui/startupPicker.js', 'utf8');
assert.match(startup, /Choose a modern country or territory/);
assert.match(startup, /__pendingStartNavigation/);

const main = fs.readFileSync('js/main.js', 'utf8');
assert.match(main, /region-navigation\.json/);
assert.match(main, /navigationIndex\?\.regions\?\.\[region\.id\]/);
assert.doesNotMatch(main, /country: 'Anatolia'/);

const css = fs.readFileSync('css/mobile-fixes.css', 'utf8');
assert.match(css, /\.menu-card[\s\S]*overflow-y:\s*auto/);
assert.match(css, /100dvh/);

console.log(JSON.stringify({
  regions: regionIds.size,
  countries: countries.size,
  multiCountryRegions: navigation.multiCountryRegionCount,
}, null, 2));
