import { hydrateSelectedScenarioRuntime } from '../core/scenarioRuntime.js?v=20260923-modern-startup2';
import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';
import { applyModernScenarioAdvisorPresentation } from './modernScenarioAdvisorPresentation.js?v=20260923-modern-startup1';
import { applyModernScenarioPolish, refocusModernPlayerCountry } from './modernScenarioPolish.js?v=20260923-black-map1';
import { installMaritimeTradeVisuals } from './maritimeTradeVisuals.js?v=20260923-sea-routes1';

let started = false;

function buttonByStrongText(host, text) {
  return [...(host?.querySelectorAll?.('button') || [])].find((button) =>
    button.querySelector('strong')?.textContent?.trim() === text);
}

function completePendingModernCountryStart(sim) {
  const scenario = currentScenario();
  if (scenario?.rulesProfile !== 'modern-crisis' || !window.__pendingStartCountryName) return false;
  const picker = document.getElementById('picker-list');
  const pickerModal = document.getElementById('picker-modal');
  const pendingId = window.__pendingStartRegionId;
  const preferred = window.__pendingStartNavigation;
  if (!picker || !pendingId || !preferred || !sim?.regions?.some((region) => region.id === pendingId)) return false;

  // The modern country picker is the only player-facing choice. Keep the legacy
  // hierarchy hidden while we invoke its existing callback for the internal anchor.
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

  // Clear the pending state only after the legacy callback was successfully driven.
  // If world/picker setup was not ready yet, the retry loop keeps the selection intact.
  delete window.__pendingStartRegionId;
  delete window.__pendingStartRegionName;
  delete window.__pendingStartNavigation;
  delete window.__pendingStartCountryName;
  window.__modernCountryStartCompleted = true;
  requestAnimationFrame(() => refocusModernPlayerCountry(sim));
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
      applyModernScenarioAdvisorPresentation();
      finishModernCountryStartWhenReady(sim);
      applyModernScenarioPolish(sim);
    }
  } catch (error) {
    started = false;
    console.error('Could not hydrate selected scenario runtime', error);
    window.__worldsimScenarioRuntime = { attached: false, error: error.message };
  }
  return true;
}

if (typeof window !== 'undefined') {
  if (!tryStart()) {
    const timer = setInterval(async () => {
      if (await tryStart()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 60000);
  }
}
