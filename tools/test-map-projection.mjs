import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const settings = fs.readFileSync('js/ui/mapProjectionSettings.js', 'utf8');
const renderer = fs.readFileSync('js/ui/mapRenderer.js', 'utf8');

assert.match(html, /id="map-projection"/);
assert.match(html, /value="equal-earth"/);
assert.match(html, /value="natural-earth"/);
assert.match(html, /value="mercator"/);
assert.match(html, /mapProjectionSettings\.js/);

assert.match(settings, /worldsim-map-projection/);
assert.match(settings, /DEFAULT_PROJECTION = 'equal-earth'/);
assert.match(settings, /geoEqualEarth/);
assert.match(settings, /geoNaturalEarth1/);
assert.match(settings, /geoMercator/);
assert.match(settings, /new Proxy\(baseD3/);
assert.match(settings, /Projection changes are applied when the game is next loaded/);

// The existing renderer deliberately remains projection-agnostic at runtime:
// it asks D3 for a projection once during construction, and the boot-time
// settings shim supplies the selected projection before main.js starts.
assert.match(renderer, /this\.projection = d3\.geoMercator\(\)/);
assert.match(renderer, /this\._fitProjection\(featureCollection\)/);
assert.match(renderer, /this\._cacheProjectedPaths\(\)/);

console.log('Map projection settings regressions passed.');
