import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/ui/fleetUi.js', import.meta.url), 'utf8');

test('fleet UI does not permanently give up during slow scenario startup', () => {
  assert.match(source, /function waitForWorldsim\(callback\)/);
  assert.match(source, /if \(window\.__worldsim\) return callback\(window\.__worldsim\);/);
  assert.match(source, /setTimeout\(\(\) => waitForWorldsim\(callback\), 100\);/);
  assert.doesNotMatch(source, /attempts\s*<\s*100/);
  assert.doesNotMatch(source, /window\.__worldsim\?\.fleetApi/);
});

test('fleet modal explains temporary naval API unavailability instead of failing silently', () => {
  assert.match(source, /if \(!world\.fleetApi\)/);
  assert.match(source, /Naval command systems are still initialising/);
});
