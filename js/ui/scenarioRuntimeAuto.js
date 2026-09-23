import { hydrateSelectedScenarioRuntime } from '../core/scenarioRuntime.js?v=20260923-modern-visibility2';
import { currentScenario, waitForScenarioSelection } from '../core/scenarios.js?v=20260921-scenarios2';
import { applyModernScenarioAdvisorPresentation } from './modernScenarioAdvisorPresentation.js?v=20260923-modern-startup1';
import { applyModernScenarioPolish, refocusModernPlayerCountry } from './modernScenarioPolish.js?v=20260923-black-map1';
import { installMaritimeTradeVisuals } from './maritimeTradeVisuals.js?v=20260923-sea-routes1';

let started = false;

function buttonByStrongText(host, text) {
  return [...(host?.querySelectorAll?.('button') || [])].find((button) =>
    button.querySelector('strong')?.textContent?.trim() === text);
}

function resetModernMapView(sim) {
  const map = sim?.map;
  if (!map?.canvas || typeof d3 === 'undefined') return false;
  map.canvas.style.transform = '';
  map.canvas.style.transformOrigin = '';
  map.canvas.style.willChange = '';
  const identity = d3.zoomIdentity;
  map.transform = identity;
  map._lastRenderedTransform = identity;
  map._gesturePreviewActive = false;
  if (map._zoom) d3.select(map.canvas).call(map._zoom.transform, identity);
  map.refreshLayer?.();
  map.draw?.();
  return true;
}

function enforceModernPhysicalWorldVisibility(sim) {
  const scenario = currentScenario();
  if (scenario?.rulesProfile !== 'modern-crisis' || !sim?.map) return false;

  // Modern scenarios know the physical/geopolitical world from turn one. Apply
  // that rule at both the fog model and renderer boundary. The renderer override
  // deliberately avoids depending on the browser having a fresh FogOfWar module:
  // older cached FogOfWar implementations must not be able to blank the modern map.
  if (sim.fogOfWar) {
    sim.fogOfWar.physicalWorldKnown = true;
    sim.fogOfWar.setPhysicalWorldKnown?.(true);
  }
  sim.map.isRegionVisible = () => true;
  sim.map.isSeaRegionVisible = () => true;
  sim.map.refreshLayer?.();
  sim.map.draw?.();

  const visibleLand = (sim.regions || []).filter((region) => sim.map.isRegionVisible(region)).length;
  const visibleSea = (sim.seaRegions || []).filter((sea) => sim.map.isSeaRegionVisible(sea)).length;
  console.log(`[fractured-2027] Physical world visibility forced: ${visibleLand}/${sim.regions?.length || 0} land, ${visibleSea}/${sim.seaRegions?.length || 0} sea regions visible.`);
  return visibleLand > 0;
}

function completePendingModernCountryStart(sim) {
  const scenario = currentScenario();
  if (scenario?.rulesProfile !== 'modern-crisis' || !window.__pendingStartCountryName) return false;
  const picker = document.getElementById('picker-list');
  const pickerModal = document.getElementById('picker-modal');
  const pendingId = window.__pendingStartRegionId;
  const preferred = window.__pendingStartNavigation;
  if (!picker || !pendingId || !preferred || !sim?.regions?.some((region) => region.id === pendingId)) return false;

  pickerModal?.classList.add('hidden');
  const continentButton = buttonByStrongText(picker, preferred.continent);
  if (!continentButton) return false;
  continentButton.click();
  const countryButton = buttonByStrongText(picker, preferred.country);
  if (!countryButton) return false;
  countryButton.click();
  const regionButton = picker.querySelector(`button[data-id="${CSS.escape(pendingId)}"]`);
  if (!regionButton) return false;
  regionButton.click();

  delete window.__pendingStartRegionId;
  delete window.__pendingStartRegionName;
  delete window.__pendingStartNavigation;
  delete window.__pendingStartCountryName;
  window.__modernCountryStartCompleted = true;
  requestAnimationFrame(() => {
    enforceModernPhysicalWorldVisibility(sim);
    resetModernMapView(sim);
    const focused = refocusModernPlayerCountry(sim);
    if (!focused) resetModernMapView(sim);
  });
  return true;
}

function finishModernCountryStartWhenReady(sim, attempt = 0) {
  if (!window.__pendingStartCountryName || window.__modernCountryStartCompleted) return;
  if (completePendingModernCountryStart(sim)) return;
  if (attempt >= 600) {
    console.error('Modern country start could not complete after scenario hydration.');
    return;
  }
  setTimeout(() => finishModernCountryStartWhenReady(sim, attempt + 1), 50);
}

async function tryStart() {
  if (started) return true;
  const sim = window.__worldsim;
  if (!sim?.regions || !sim?.clock) return false;
  started = true;
  installMaritimeTradeVisuals(sim.map);
  try {
    const result = await hydrateSelectedScenarioRuntime(sim, { currentTick: sim.clock.elapsedDays || 0 });
    window.__worldsimScenarioRuntime = result;
    if (result.attached) {
      console.log(`Scenario runtime hydrated: ${result.scenarioId}`);
      const visible = enforceModernPhysicalWorldVisibility(sim);
      resetModernMapView(sim);
      console.log(`[fractured-2027] Runtime visibility check: ${visible ? 'PASS' : 'FAIL'}; population model=${result.modernBaseline?.populationModel || 'unknown'}.`);
      applyModernScenarioAdvisorPresentation();
      finishModernCountryStartWhenReady(sim);
      applyModernScenarioPolish(sim);
      requestAnimationFrame(() => {
        enforceModernPhysicalWorldVisibility(sim);
        sim.map?.draw?.();
      });
    }
  } catch (error) {
    started = false;
    console.error('Could not hydrate selected scenario runtime', error);
    window.__worldsimScenarioRuntime = { attached: false, error: error.message };
  }
  return true;
}

async function startWhenRuntimeReady() {
  // This module is loaded with index.html, while main.js is intentionally delayed
  // until after the player chooses a scenario and can take a while to build a large
  // world. Wait for that choice first, then keep checking until main publishes the
  // runtime. Do not test `!tryStart()` directly: tryStart is async, so that tests the
  // Promise object rather than its eventual boolean result and skips the retry path.
  await waitForScenarioSelection();
  if (await tryStart()) return;

  const startedWaitingAt = Date.now();
  const timer = setInterval(async () => {
    if (await tryStart()) {
      clearInterval(timer);
      return;
    }
    if (Date.now() - startedWaitingAt >= 5 * 60 * 1000) {
      clearInterval(timer);
      console.error('Scenario runtime did not become available within five minutes of scenario selection.');
    }
  }, 50);
}

if (typeof window !== 'undefined') {
  startWhenRuntimeReady().catch((error) => {
    console.error('Could not start scenario runtime bootstrap', error);
  });
}
