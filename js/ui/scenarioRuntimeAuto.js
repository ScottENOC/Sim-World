import { hydrateSelectedScenarioRuntime } from '../core/scenarioRuntime.js?v=20260921-scenario-runtime2';

let started = false;

async function tryStart() {
  if (started) return true;
  const sim = window.__worldsim;
  if (!sim?.regions || !sim?.clock) return false;
  started = true;
  try {
    const result = await hydrateSelectedScenarioRuntime(sim, { currentTick: sim.clock.elapsedDays || 0 });
    window.__worldsimScenarioRuntime = result;
    if (result.attached) console.log(`Scenario runtime hydrated: ${result.scenarioId}`);
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
