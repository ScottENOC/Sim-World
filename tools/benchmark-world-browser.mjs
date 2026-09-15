import fs from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SIM_WORLD_URL || 'http://127.0.0.1:8000/';
const sampleTarget = Number(process.env.SIM_WORLD_BENCHMARK_SAMPLES || 24);
const outputPath = process.env.SIM_WORLD_BENCHMARK_OUTPUT || 'benchmarks/world-2024-ci.json';

function numberFrom(report, label) {
  const match = report.match(new RegExp(`^\\s*${label}:\\s+([0-9.]+) ms`, 'm'));
  return match ? Number(match[1]) : null;
}

function parseSubsystems(report) {
  const rows = [];
  const lines = report.split('\n');
  const start = lines.findIndex((line) => line.startsWith('SUBSYSTEMS'));
  if (start < 0) return rows;
  for (const line of lines.slice(start + 2)) {
    if (!line.trim()) break;
    const match = line.match(/^\s*([0-9.]+) ms\s*\|\s*([0-9.]+) ms\s*\|\s*([0-9.]+) ms\s*\|\s*([0-9.]+)%\s*\|\s*(.+)$/);
    if (match) rows.push({ avgMs: Number(match[1]), p95Ms: Number(match[2]), maxMs: Number(match[3]), sharePct: Number(match[4]), subsystem: match[5].trim() });
  }
  return rows;
}

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(() => window.__worldsim?.regions?.length > 0, null, { timeout: 120_000 });
  const world = await page.evaluate(() => ({ regions: window.__worldsim.regions.length, seas: window.__worldsim.seaRegions.length }));

  // Exercise the real start flow rather than creating a synthetic simulation.
  await page.locator('#picker-list .picker-group').first().click();
  await page.locator('#picker-list .picker-group').first().click();
  await page.locator('#picker-list .picker-option').first().click();
  await page.waitForFunction(() => window.__worldsim.clock.tickIndex >= 1, null, { timeout: 30_000 });

  await page.evaluate(() => {
    window.__worldsim.profiler.reset();
    window.__worldsim.profiler.setActive(true);
    window.__worldsim.clock.setSpeed(4);
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      samples: window.__worldsim.profiler.sampleCount,
      speed: window.__worldsim.clock.speed,
      tickIndex: window.__worldsim.clock.tickIndex,
    }));
    if (state.samples >= sampleTarget) break;
    if (state.speed !== 4) {
      // The product should auto-step down when a real device cannot sustain 4x.
      // The benchmark deliberately restores 4x between samples so wall-clock
      // pacing does not turn a slow-tick measurement into a multi-minute test.
      await page.evaluate(() => {
        for (let i = 0; i < 8; i++) window.__worldsim.clock.releaseAutoPause();
        window.__worldsim.clock.setSpeed(4);
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const result = await page.evaluate(() => {
    window.__worldsim.profiler.setActive(false);
    return {
      report: window.__worldsim.profiler.buildReport(),
      samples: window.__worldsim.profiler.sampleCount,
      tickIndex: window.__worldsim.clock.tickIndex,
      finalSpeed: window.__worldsim.clock.speed,
    };
  });
  if (result.samples < sampleTarget) throw new Error(`Only collected ${result.samples}/${sampleTarget} tick samples`);
  if (pageErrors.length) throw new Error(`Browser errors during benchmark:\n${pageErrors.join('\n')}`);

  const benchmark = {
    generatedAt: new Date().toISOString(),
    environment: 'GitHub Actions Ubuntu / hosted Chrome / iPhone-sized viewport (not iPhone hardware)',
    viewportCssPx: [393, 852],
    deviceScaleFactor: 3,
    regionCount: world.regions,
    seaRegionCount: world.seas,
    samples: result.samples,
    endingTickIndex: result.tickIndex,
    avgTickMs: numberFrom(result.report, 'avg'),
    p95TickMs: numberFrom(result.report, 'p95'),
    maxTickMs: numberFrom(result.report, 'max'),
    topSubsystems: parseSubsystems(result.report).slice(0, 12),
    report: result.report,
  };
  fs.mkdirSync(new URL('../benchmarks/', import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  console.log(JSON.stringify({ ...benchmark, report: undefined }, null, 2));
  console.log('\n' + result.report);
} finally {
  await browser.close();
}
