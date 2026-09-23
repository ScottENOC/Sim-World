import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SIM_WORLD_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1179, height: 780 } });
const consoleLines = [];
const pageErrors = [];

page.on('console', (message) => {
  const line = `[${message.type()}] ${message.text()}`;
  consoleLines.push(line);
  console.log(line);
});
page.on('pageerror', (error) => {
  pageErrors.push(error.message);
  console.error('[pageerror]', error);
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const fractured = page.locator('#picker-list button', { has: page.locator('strong', { hasText: /^Fractured World$/ }) });
  await fractured.waitFor({ state: 'visible', timeout: 15_000 });
  await fractured.click();

  const australia = page.locator('#picker-list button', { has: page.locator('strong', { hasText: /^Australia$/ }) });
  await australia.waitFor({ state: 'visible', timeout: 30_000 });
  await australia.click();

  await page.waitForFunction(() => {
    return Boolean(
      window.__worldsimScenarioRuntime?.attached &&
      window.__modernCountryStartCompleted &&
      window.__worldsim?.map?.canvas &&
      window.__worldsim?.regions?.length
    );
  }, null, { timeout: 240_000, polling: 250 });

  // Give the requestAnimationFrame visibility/map redraws time to paint the final frame.
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const sim = window.__worldsim;
    const runtime = window.__worldsimScenarioRuntime;
    const canvas = sim.map.canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const pixelCount = canvas.width * canvas.height;
    const stridePixels = Math.max(1, Math.floor(pixelCount / 12_000));
    const colours = new Set();
    let opaqueSamples = 0;

    for (let pixel = 0; pixel < pixelCount; pixel += stridePixels) {
      const i = pixel * 4;
      if (data[i + 3] > 0) opaqueSamples += 1;
      colours.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
      if (colours.size >= 32) break;
    }

    const visibleLand = sim.regions.filter((region) => sim.map.isRegionVisible(region)).length;
    const visibleSea = (sim.seaRegions || []).filter((region) => sim.map.isSeaRegionVisible(region)).length;

    return {
      scenarioId: runtime.scenarioId,
      attached: runtime.attached,
      modernCountryStartCompleted: window.__modernCountryStartCompleted,
      regionCount: sim.regions.length,
      seaRegionCount: sim.seaRegions?.length || 0,
      visibleLand,
      visibleSea,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      sampledColourCount: colours.size,
      opaqueSamples,
    };
  });

  console.log('Fractured 2027 browser smoke state:', JSON.stringify(state, null, 2));

  assert.equal(state.scenarioId, 'fractured-2027');
  assert.equal(state.attached, true);
  assert.equal(state.modernCountryStartCompleted, true);
  assert.ok(state.regionCount > 0, '2027 world must contain land regions');
  assert.equal(state.visibleLand, state.regionCount, 'modern scenario should reveal every physical land region');
  assert.equal(state.visibleSea, state.seaRegionCount, 'modern scenario should reveal every physical sea region');
  assert.ok(state.canvasWidth > 0 && state.canvasHeight > 0, 'map canvas must have non-zero dimensions');
  assert.ok(state.opaqueSamples > 0, 'map canvas must contain painted pixels');
  assert.ok(state.sampledColourCount >= 4, `map canvas appears blank/flat; only ${state.sampledColourCount} sampled colours were rendered`);

  const fatalStartupErrors = pageErrors.filter((message) => /scenario|startup|hydrate|map/i.test(message));
  assert.deepEqual(fatalStartupErrors, [], `browser emitted startup errors: ${fatalStartupErrors.join(' | ')}`);
} catch (error) {
  console.error('\nRecent browser console output:');
  for (const line of consoleLines.slice(-80)) console.error(line);
  throw error;
} finally {
  await browser.close();
}
