// Scenario selection is deliberately separate from simulation mechanics.
// A scenario chooses a map package, initial date/rules profile and victory model;
// the ordinary simulation modules continue to load their normal data/world/* URLs.
// For alternate scenarios we redirect those URLs to the selected map package.

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
    victoryModel: 'military-control',
    targetRealHours: 30,
    targetSimYears: 6,
    available: false,
    status: 'Scenario map, ownership and initial diplomatic state to be authored',
  }),
]);

const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
let selectedScenario = null;
let resolveSelection;
const selectionPromise = new Promise((resolve) => { resolveSelection = resolve; });
let fetchRoutingInstalled = false;
let originalFetch = null;

export function scenarioById(id) { return byId.get(id) || null; }
export function currentScenario() { return selectedScenario; }
export function waitForScenarioSelection() { return selectedScenario ? Promise.resolve(selectedScenario) : selectionPromise; }

function stripWorldPrefix(url) {
  const value = String(url || '');
  const marker = 'data/world/';
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return { prefix: value.slice(0, index), suffix: value.slice(index + marker.length) };
}

export function scenarioAssetUrl(relativePath, scenario = selectedScenario) {
  if (!scenario) throw new Error('A scenario must be selected before scenario assets can be resolved.');
  return `${scenario.mapBaseUrl}${String(relativePath || '').replace(/^\/+/, '')}`;
}

export function installScenarioFetchRouting() {
  if (fetchRoutingInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchRoutingInstalled = true;
  originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const scenario = selectedScenario;
    if (!scenario || scenario.mapBaseUrl === 'data/world/') return originalFetch(input, init);
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const parts = stripWorldPrefix(rawUrl);
    if (!parts) return originalFetch(input, init);
    const rewritten = `${parts.prefix}${scenario.mapBaseUrl}${parts.suffix}`;
    if (typeof Request !== 'undefined' && input instanceof Request) return originalFetch(new Request(rewritten, input), init);
    return originalFetch(rewritten, init);
  };
}

export function selectScenario(id) {
  const scenario = scenarioById(id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  if (!scenario.available) throw new Error(`${scenario.name} is not playable yet. ${scenario.status || ''}`.trim());
  if (selectedScenario && selectedScenario.id !== scenario.id) throw new Error('Scenario is already locked for this game session. Reload to choose another scenario.');
  if (!selectedScenario) {
    selectedScenario = scenario;
    if (typeof window !== 'undefined') window.__worldsimScenario = scenario;
    installScenarioFetchRouting();
    resolveSelection(scenario);
  }
  return selectedScenario;
}

export function scenarioStartYear(fallback = -1300) {
  const value = Number(selectedScenario?.startYear ?? (typeof window !== 'undefined' ? window.__worldsimScenario?.startYear : NaN));
  return Number.isFinite(value) ? value : fallback;
}
