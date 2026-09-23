import { currentScenario, waitForScenarioSelection } from './scenarios.js?v=20260921-scenarios2';
import { hydrateScenarioInitialState, scenarioPlayablePolities } from './scenarioState.js?v=20260921-scenario-state3';
import { updateFocusedCampaignResolution, canDeclareFocusedScenarioResult } from './scenarioVictory.js?v=20260921-scenario-victory2';
import { consolidateScenarioSovereignty } from './scenarioSovereignty.js?v=20260921-scenario-sovereignty2';
import { applyModernScenarioBaseline } from './scenarioModernStart.js?v=20260923-modern-pop1';
import { hydrateScenarioForceDeployments } from './scenarioForces.js?v=20260921-scenario-forces1';
import { applyScenarioStrategicInformation } from './scenarioStrategicInformation.js?v=20260923-strategic-info1';

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
  const [initialState, factionBalance, pressureEvents, playability, victory, sovereignty, modernStart, forceDeployments, navigation] = await Promise.all([
    loadOptional(manifest.initialStateFile),
    loadOptional(manifest.factionBalanceFile),
    loadOptional(manifest.pressureEventsFile),
    loadOptional(manifest.playabilityFile),
    loadOptional(manifest.victoryFile),
    loadOptional(manifest.sovereigntyFile),
    loadOptional(manifest.modernStartFile),
    loadOptional(manifest.forceDeploymentsFile),
    fetchJson(`${scenario.mapBaseUrl}region-navigation.json`, fetchFn),
  ]);

  return { root, manifest, initialState, factionBalance, pressureEvents, playability, victory, sovereignty, modernStart, forceDeployments, navigation };
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
  const usesPolityFacade = !arr(sim.polities).length;
  const polities = usesPolityFacade ? inferredPolities(sim.regions) : sim.polities;
  return {
    regions: arr(sim.regions),
    seaRegions: arr(sim.seaRegions),
    polities,
    activeWars: arr(sim.activeWars),
    activeCampaigns: arr(sim.activeCampaigns),
    agreements: arr(sim.agreements),
    scenarioState: sim.scenarioState || {},
    scenarioVictoryState: sim.scenarioVictoryState || {},
    usesPolityFacade,
  };
}

function forcePhysicalWorldKnown(fogOfWar) {
  if (!fogOfWar) return false;
  // Do not rely on the browser having a fresh FogOfWar module. Older cached
  // implementations did not know about physicalWorldKnown, and optional chaining
  // made that fail silently. A modern scenario owns this runtime policy directly.
  fogOfWar.physicalWorldKnown = true;
  if (typeof fogOfWar.setPhysicalWorldKnown === 'function') fogOfWar.setPhysicalWorldKnown(true);
  const ordinaryIsVisible = typeof fogOfWar.isVisible === 'function' ? fogOfWar.isVisible.bind(fogOfWar) : null;
  if (!fogOfWar._scenarioPhysicalVisibilityPatched) {
    fogOfWar._scenarioPhysicalVisibilityPatched = true;
    fogOfWar._ordinaryIsVisible = ordinaryIsVisible;
    fogOfWar.isVisible = (region) => fogOfWar.physicalWorldKnown ? Boolean(region) : (fogOfWar._ordinaryIsVisible?.(region) ?? false);
    fogOfWar.visibleRegions = () => fogOfWar.physicalWorldKnown
      ? arr(fogOfWar.regions)
      : arr(fogOfWar.regions).filter((region) => fogOfWar.isVisible(region));
  }
  return fogOfWar.physicalWorldKnown === true && arr(fogOfWar.visibleRegions?.()).length > 0;
}

export function applyScenarioRuntimeRules(sim, scenario, pkg = null) {
  if (!sim || !scenario) return { dailyTurns: false, physicalWorldKnown: false };
  const preferredUnit = pkg?.manifest?.pacing?.preferredStrategicTurnUnit || null;
  const dailyTurns = preferredUnit === 'day' || scenario.rulesProfile === 'modern-crisis';
  if (dailyTurns && sim.clock?.setWorldTempo) {
    if (!sim.clock._scenarioDailyTempoPatched) {
      const ordinarySetWorldTempo = sim.clock.setWorldTempo.bind(sim.clock);
      sim.clock._scenarioDailyTempoPatched = true;
      sim.clock._ordinarySetWorldTempo = ordinarySetWorldTempo;
      sim.clock.setWorldTempo = (tempo = {}) => ordinarySetWorldTempo({
        ...tempo,
        daysPerTick: 1,
        label: 'daily',
      });
    }
    sim.clock.setWorldTempo({ index: 1, daysPerTick: 1, label: 'daily', signals: { scenario: scenario.id } });
  }

  const wantsPhysicalWorldKnown = scenario.rulesProfile === 'modern-crisis';
  const physicalWorldKnown = wantsPhysicalWorldKnown ? forcePhysicalWorldKnown(sim.fogOfWar) : false;
  if (wantsPhysicalWorldKnown && !physicalWorldKnown) {
    console.error('Modern scenario failed to expose the physical world map.', {
      scenarioId: scenario.id,
      hasFogOfWar: Boolean(sim.fogOfWar),
      regionCount: arr(sim.regions).length,
    });
  }
  return { dailyTurns, physicalWorldKnown };
}

export function attachScenarioPackage(sim, scenario, pkg, options = {}) {
  if (!sim || !scenario) throw new Error('attachScenarioPackage requires simulation and scenario');
  if (!pkg) return { attached: false, reason: 'grand_campaign_no_package' };
  const world = scenarioWorldAdapter(sim);

  const sovereignty = pkg.sovereignty && pkg.navigation
    ? consolidateScenarioSovereignty(world, pkg.navigation, pkg.sovereignty)
    : null;

  const modernBaseline = pkg.modernStart
    ? applyModernScenarioBaseline(world, pkg.modernStart)
    : null;

  const forceDeployments = pkg.forceDeployments
    ? hydrateScenarioForceDeployments(world, pkg.forceDeployments)
    : null;

  const hydration = pkg.initialState
    ? hydrateScenarioInitialState(world, jsonClone(pkg.initialState), { currentTick: options.currentTick || 0 })
    : null;

  const strategicInformation = pkg.initialState
    ? applyScenarioStrategicInformation(world, pkg.initialState)
    : null;

  world.scenarioState.package = {
    manifest: pkg.manifest,
    factionBalance: pkg.factionBalance,
    pressureEvents: pkg.pressureEvents,
    playability: pkg.playability,
    victory: pkg.victory,
    sovereignty: pkg.sovereignty,
    modernStart: pkg.modernStart,
    forceDeployments: pkg.forceDeployments,
  };
  world.scenarioState.scenarioId = scenario.id;
  world.scenarioState.sovereignty = sovereignty;
  world.scenarioState.modernBaseline = modernBaseline;
  world.scenarioState.forceDeployments = forceDeployments;
  world.scenarioState.strategicInformation = strategicInformation;
  sim.scenarioState = world.scenarioState;
  sim.scenarioVictoryState = world.scenarioVictoryState;
  sim.scenarioPackage = world.scenarioState.package;
  sim.scenarioPolities = world.polities;
  sim.scenarioActorToPolityId = world.scenarioActorToPolityId || {};
  sim.scenarioForceDeployments = world.scenarioForceDeployments || null;
  sim.scenarioPlayablePolities = () => scenarioPlayablePolities(world, pkg.playability || {});
  sim.updateScenarioResolution = (currentDay = sim.clock?.elapsedDays || 0) =>
    pkg.victory ? updateFocusedCampaignResolution(world, pkg.victory, currentDay) : { resolved: false, reason: 'no_victory_model' };
  sim.scenarioOutcomeFor = (countryId) =>
    pkg.victory ? canDeclareFocusedScenarioResult(world, countryId, pkg.victory) : { ready: false, reason: 'no_victory_model' };

  const runtimeRules = applyScenarioRuntimeRules(sim, scenario, pkg);
  world.scenarioState.runtimeRules = runtimeRules;

  return {
    attached: true,
    scenarioId: scenario.id,
    hydration,
    sovereignty,
    modernBaseline,
    forceDeployments,
    strategicInformation,
    runtimeRules,
    usedPolityFacade: world.usesPolityFacade,
    playablePolityIds: sim.scenarioPlayablePolities().map((polity) => polity.scenarioActorId || polity.id),
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
