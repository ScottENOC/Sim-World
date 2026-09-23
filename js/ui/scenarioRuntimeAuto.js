import { hydrateSelectedScenarioRuntime } from '../core/scenarioRuntime.js?v=20260923-modern-startup1';
import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';

let started = false;

function buttonByStrongText(host, text) {
  return [...(host?.querySelectorAll?.('button') || [])].find((button) =>
    button.querySelector('strong')?.textContent?.trim() === text);
}

function completePendingModernCountryStart(sim) {
  const scenario = currentScenario();
  if (scenario?.rulesProfile !== 'modern-crisis' || !window.__pendingStartCountryName) return false;
  const picker = document.getElementById('picker-list');
  const pendingId = window.__pendingStartRegionId;
  const preferred = window.__pendingStartNavigation;
  if (!picker || !pendingId || !preferred || !sim?.regions?.some((region) => region.id === pendingId)) return false;

  const continentButton = buttonByStrongText(picker, preferred.continent);
  if (!continentButton) return false;
  continentButton.click();
  const countryButton = buttonByStrongText(picker, preferred.country);
  if (!countryButton) return false;
  countryButton.click();
  const regionButton = picker.querySelector(`button[data-id="${CSS.escape(pendingId)}"]`);
  if (!regionButton) return false;
  regionButton.click();
  return true;
}

async function tryStart() {
  if (started) return true;
  const sim = window.__worldsim;
  if (!sim?.regions || !sim?.clock) return false;
  started = true;
  try {
    const result = await hydrateSelectedScenarioRuntime(sim, { currentTick: sim.clock.elapsedDays || 0 });
    window.__worldsimScenarioRuntime = result;
    if (result.attached) {
      console.log(`Scenario runtime hydrated: ${result.scenarioId}`);
      // The modern startup picker has already selected the country. The legacy
      // region picker exists only as the grand-campaign handoff mechanism; drive
      // it automatically so the player is not asked to make a second Bronze Age choice.
      completePendingModernCountryStart(sim);
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
