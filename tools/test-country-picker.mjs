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
for (const expected of ['United Kingdom', 'France', 'Spain', 'China', 'India', 'Japan', 'Australia', 'New Zealand', 'Türkiye', 'Palestine', 'Kosovo', 'Western Sahara']) {
  assert.ok(countries.has(expected), `expected modern navigation country/economy ${expected}`);
}
for (const forbidden of ['Anatolia', 'Mesopotamia', 'Kazakh Steppe', 'Mongolian Steppe', 'Western Iran', 'Southern Levant']) {
  assert.ok(!countries.has(forbidden), `physical simulation grouping ${forbidden} must not be presented as a modern country`);
}
assert.ok((navigation.multiCountryRegionCount || 0) > 0, 'at least one simulation region should be discoverable through multiple modern countries');

// North America now includes the continental USA, Canada and Mexico tranche,
// alongside the pre-existing Greenland/Hawaii coverage. Keep this explicit so
// unrelated countries cannot leak into the picker through physical-region tags.
const northAmericaCountries = new Set();
for (const memberships of Object.values(navigation.regions)) {
  for (const membership of memberships) {
    if (membership.continent === 'North America') northAmericaCountries.add(membership.country);
  }
}
for (const expected of ['Canada', 'Greenland', 'Mexico', 'United States of America']) {
  assert.ok(northAmericaCountries.has(expected), `expected North America picker country ${expected}`);
}
for (const country of northAmericaCountries) {
  assert.ok(['Canada', 'Greenland', 'Mexico', 'United States of America'].includes(country), `unexpected North America picker country ${country}`);
}

// Spot-check that country memberships carry their modern geographic continent,
// not the physical-zone continent of whichever simulation region intersects it.
const expectedContinents = new Map([
  ['Sudan', 'Africa'], ['Ethiopia', 'Africa'], ['Kenya', 'Africa'], ['Somalia', 'Africa'],
  ['Papua New Guinea', 'Oceania'], ['United Kingdom', 'Europe'], ['Faroe Islands', 'Europe'],
]);
for (const memberships of Object.values(navigation.regions)) {
  for (const membership of memberships) {
    const expected = expectedContinents.get(membership.country);
    if (expected) assert.equal(membership.continent, expected, `${membership.country} should be under ${expected}`);
  }
}

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
  northAmericaCountries: [...northAmericaCountries].sort(),
}, null, 2));
