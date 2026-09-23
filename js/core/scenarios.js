// Scenario selection is deliberately separate from simulation mechanics.
// A scenario chooses a map package, initial date/rules profile and victory model;
// the ordinary simulation modules continue to load their normal data/world/* URLs.
// Alternate scenarios redirect only the explicit map contract, leaving shared
// game definitions (for example toolTypes.json) on the common data/world path.

export const SCENARIO_MAP_FILES = Object.freeze(new Set([
  'regions.geo.json',
  'regions.meta.json',
  'region-navigation.json',
  'resources.initial.json',
  'terrain.initial.json',
  'seaRegions.geo.json',
  'seaRegions.meta.json',
  'spatial.base.json',
  'majorRivers.real.json',
]));

export const SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'grand-campaign',
    name: 'Grand Campaign',
    subtitle: '1300 BCE – c. 2050 CE',
    description: 'Lead a society across more than three millennia. Long-run success is about resilience, sustainability, prosperity and safety rather than simple conquest.',
    startYear: -1300,
    mapBaseUrl: 'data/world/',
    mapStyle: 'enduring-regions',
    rulesProfile: 'grand-campaign',
    technologyProfile: 'emergent-full-history',
    victoryModel: 'sustainable-future',
    targetRealHours: 50,
    targetSimYears: 3350,
    available: true,
  }),
  Object.freeze({
    id: 'wwii-1939',
    name: 'World War II',
    subtitle: '1939 – 1945',
    description: 'A slower, military-focused campaign using period-specific borders, ownership, forces and a deeper treatment of technologies such as cryptography, radar and logistics.',
    startYear: 1939,
    mapBaseUrl: 'data/scenarios/wwii-1939/world/',
    mapStyle: 'historical-1939',
    rulesProfile: 'total-war',
    technologyProfile: 'wwii-deep-dive',
    victoryModel: 'military-surrender',
    targetRealHours: 30,
    targetSimYears: 6,
    available: false,
    status: 'Map and initial-state package to be authored',
  }),
  Object.freeze({
    id: 'fractured-2027',
    name: 'Fractured World',
    subtitle: '2027 · alternate history',
    description: 'A fictional near-future crisis scenario: the United States occupies Greenland, the EU and UK enter the war in defence of Denmark/Greenland, Russia’s war in Ukraine continues, China blockades Taiwan, and middle powers begin uncommitted.',
    startYear: 2027,
    mapBaseUrl: 'data/scenarios/fractured-2027/world/',
    mapStyle: 'modern-strategic',
    rulesProfile: 'modern-crisis',
    technologyProfile: 'near-future-conventional',
    victoryModel: 'country-survival-and-aims',
    targetRealHours: 30,
    targetSimYears: 6,
    available: true,
    status: 'Playable baseline enabled; balance, AI behaviour and scenario-specific calibration remain under active development',
  }),
]);

const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

// Cache-busting query strings can cause this ES module source to be evaluated
// more than once. Keep selection and routing state browser-global so every
// module instance observes the same locked scenario and one fetch wrapper.
const scenarioRouterState = (() => {
  const host = typeof globalThis !== 'undefined' ? globalThis : {};
  const key = '__worldsimScenarioRouterState';
  if (!host[key]) {
    let resolveSelection;
    const selectionPromise = new Promise((resolve) => { resolveSelection = resolve; });
    host[key] = {
      selectedScenario: null,
      resolveSelection,
      selectionPromise,
      fetchRoutingInstalled: false,
      originalFetch: null,
    };
  }
  return host[key];
})();

export function scenarioById(id) { return byId.get(id) || null; }
export function currentScenario() { return scenarioRouterState.selectedScenario; }
export function waitForScenarioSelection() { return scenarioRouterState.selectedScenario ? Promise.resolve(scenarioRouterState.selectedScenario) : scenarioRouterState.selectionPromise; }

function stripWorldPrefix(url) {
  const value = String(url || '');
  const marker = 'data/world/';
  const index = value.indexOf(marker);
  if (index < 0) return null;
  const suffix = value.slice(index + marker.length);
  const path = suffix.split(/[?#]/, 1)[0];
  return { prefix: value.slice(0, index), suffix, path };
}

export function isScenarioMapAsset(relativePath) {
  return SCENARIO_MAP_FILES.has(String(relativePath || '').split(/[?#]/, 1)[0]);
}

export function scenarioAssetUrl(relativePath, scenario = scenarioRouterState.selectedScenario) {
  if (!scenario) throw new Error('A scenario must be selected before scenario assets can be resolved.');
  return `${scenario.mapBaseUrl}${String(relativePath || '').replace(/^\/+/, '')}`;
}

export function fetchScenarioAssetDirect(relativePath, scenario, init) {
  const url = scenarioAssetUrl(relativePath, scenario);
  const directFetch = scenarioRouterState.originalFetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
  if (!directFetch) throw new Error('Browser fetch is not available for scenario assets.');
  return directFetch(url, init);
}

export function installScenarioFetchRouting() {
  if (scenarioRouterState.fetchRoutingInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  scenarioRouterState.fetchRoutingInstalled = true;
  scenarioRouterState.originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const parts = stripWorldPrefix(rawUrl);
    if (!parts || !isScenarioMapAsset(parts.path)) return scenarioRouterState.originalFetch(input, init);

    // main.js starts loading immediately. Holding only map-data requests here keeps
    // startup deterministic without accidentally redirecting shared definitions.
    const scenario = await waitForScenarioSelection();
    if (scenario.mapBaseUrl === 'data/world/') return scenarioRouterState.originalFetch(input, init);

    const rewritten = `${parts.prefix}${scenario.mapBaseUrl}${parts.suffix}`;
    if (typeof Request !== 'undefined' && input instanceof Request) return scenarioRouterState.originalFetch(new Request(rewritten, input), init);
    return scenarioRouterState.originalFetch(rewritten, init);
  };
}

export function selectScenario(id) {
  const scenario = scenarioById(id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  if (!scenario.available) throw new Error(`${scenario.name} is not playable yet. ${scenario.status || ''}`.trim());
  if (scenarioRouterState.selectedScenario && scenarioRouterState.selectedScenario.id !== scenario.id) throw new Error('Scenario is already locked for this game session. Reload to choose another scenario.');
  if (!scenarioRouterState.selectedScenario) {
    scenarioRouterState.selectedScenario = scenario;
    if (typeof window !== 'undefined') window.__worldsimScenario = scenario;
    scenarioRouterState.resolveSelection(scenario);
  }
  return scenarioRouterState.selectedScenario;
}

export function scenarioStartYear(fallback = -1300) {
  const value = Number(scenarioRouterState.selectedScenario?.startYear ?? (typeof window !== 'undefined' ? window.__worldsimScenario?.startYear : NaN));
  return Number.isFinite(value) ? value : fallback;
}

// Install as soon as this module is imported, before main.js reaches its first
// map-data fetch. The picker resolves held map requests when a scenario is chosen.
installScenarioFetchRouting();
