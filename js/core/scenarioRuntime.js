import { currentScenario, waitForScenarioSelection } from './scenarios.js?v=20260921-scenarios1';
import { hydrateScenarioInitialState, scenarioPlayablePolities } from './scenarioState.js?v=20260921-scenario-state1';
import { updateFocusedCampaignResolution, canDeclareFocusedScenarioResult } from './scenarioVictory.js?v=20260921-scenario-victory1';

const jsonClone = (value) => JSON.parse(JSON.stringify(value));
const arr = (value) => Array.isArray(value) ? value : [];

export function scenarioPackageRoot(scenario) {
  if (!scenario || scenario.id === 'grand-campaign') return null;
  const base = String(scenario.mapBaseUrl || '');
  return base.endsWith('/world/') ? base.slice(0, -'world/'.length) : base;
}

async function fetchJson(url, fetchFn = fetch) {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Scenario asset HTTP ${response.status}: ${url}`);
  return response.json();
}

export async function loadScenarioPackage(scenario = currentScenario(), fetchFn = fetch) {
  const root = scenarioPackageRoot(scenario);
  if (!root) return null;
  const manifest = await fetchJson(`${root}scenario.json`, fetchFn);
  if (manifest.id !== scenario.id) throw new Error(`Scenario package mismatch: selected ${scenario.id}, loaded ${manifest.id}`);

  const loadOptional = async (file) => file ? fetchJson(`${root}${file}`, fetchFn) : null;
  const [initialState, factionBalance, pressureEvents, playability, victory] = await Promise.all([
    loadOptional(manifest.initialStateFile),
    loadOptional(manifest.factionBalanceFile),
    loadOptional(manifest.pressureEventsFile),
    loadOptional(manifest.playabilityFile),
    loadOptional(manifest.victoryFile),
  ]);

  return { root, manifest, initialState, factionBalance, pressureEvents, playability, victory };
}

function inferredPolities(regions) {
  const byId = new Map();
  for (const region of arr(regions)) {
    const id = region?.governance?.sovereignPolityId || region?.polityId || null;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: region?.governance?.sovereignPolityName || region?.polityName || id,
      scenarioFacade: true,
    });
  }
  return [...byId.values()];
}

export function scenarioWorldAdapter(sim) {
  if (!sim) throw new Error('scenarioWorldAdapter requires a live simulation object');
  const polities = arr(sim.polities).length ? sim.polities : inferredPolities(sim.regions);
  const world = {
    regions: arr(sim.regions),
    seaRegions: arr(sim.seaRegions),
    polities,
    activeWars: arr(sim.activeWars),
    activeCampaigns: arr(sim.activeCampaigns),
    agreements: arr(sim.agreements),
    scenarioState: sim.scenarioState || {},
    scenarioVictoryState: sim.scenarioVictoryState || {},
  };
  return world;
}

export function attachScenarioPackage(sim, scenario, pkg, options = {}) {
  if (!sim || !scenario) throw new Error('attachScenarioPackage requires simulation and scenario');
  if (!pkg) return { attached: false, reason: 'grand_campaign_no_package' };
  const world = scenarioWorldAdapter(sim);
  const hydration = pkg.initialState
    ? hydrateScenarioInitialState(world, jsonClone(pkg.initialState), { currentTick: options.currentTick || 0 })
    : null;

  world.scenarioState.package = {
    manifest: pkg.manifest,
    factionBalance: pkg.factionBalance,
    pressureEvents: pkg.pressureEvents,
    playability: pkg.playability,
    victory: pkg.victory,
  };
  world.scenarioState.scenarioId = scenario.id;
  sim.scenarioState = world.scenarioState;
  sim.scenarioVictoryState = world.scenarioVictoryState;
  sim.scenarioPackage = world.scenarioState.package;
  sim.scenarioPolities = world.polities;
  sim.scenarioPlayablePolities = () => scenarioPlayablePolities(world, pkg.playability || {});
  sim.updateScenarioResolution = (currentDay = sim.clock?.elapsedDays || 0) =>
    pkg.victory ? updateFocusedCampaignResolution(world, pkg.victory, currentDay) : { resolved: false, reason: 'no_victory_model' };
  sim.scenarioOutcomeFor = (countryId) =>
    pkg.victory ? canDeclareFocusedScenarioResult(world, countryId, pkg.victory) : { ready: false, reason: 'no_victory_model' };

  return {
    attached: true,
    scenarioId: scenario.id,
    hydration,
    playablePolityIds: sim.scenarioPlayablePolities().map((polity) => polity.id),
  };
}

export async function hydrateSelectedScenarioRuntime(sim, options = {}) {
  const scenario = currentScenario() || await waitForScenarioSelection();
  if (scenario.id === 'grand-campaign') {
    sim.scenarioState ||= { id: scenario.id, hydrated: false };
    return { attached: false, reason: 'grand_campaign_no_package', scenarioId: scenario.id };
  }
  const pkg = await loadScenarioPackage(scenario, options.fetchFn || fetch);
  return attachScenarioPackage(sim, scenario, pkg, options);
}
