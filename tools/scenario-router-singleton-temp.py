from pathlib import Path

p = Path('js/core/scenarios.js')
s = p.read_text()
old = """const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
let selectedScenario = null;
let resolveSelection;
const selectionPromise = new Promise((resolve) => { resolveSelection = resolve; });
let fetchRoutingInstalled = false;
let originalFetch = null;
"""
new = """const byId = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

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
"""
if old not in s:
    raise SystemExit('state anchor not found')
s = s.replace(old, new, 1)
repls = [
("export function currentScenario() { return selectedScenario; }", "export function currentScenario() { return scenarioRouterState.selectedScenario; }"),
("export function waitForScenarioSelection() { return selectedScenario ? Promise.resolve(selectedScenario) : selectionPromise; }", "export function waitForScenarioSelection() { return scenarioRouterState.selectedScenario ? Promise.resolve(scenarioRouterState.selectedScenario) : scenarioRouterState.selectionPromise; }"),
("export function scenarioAssetUrl(relativePath, scenario = selectedScenario) {", "export function scenarioAssetUrl(relativePath, scenario = scenarioRouterState.selectedScenario) {"),
("  const directFetch = originalFetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);", "  const directFetch = scenarioRouterState.originalFetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);"),
("  if (fetchRoutingInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;\n  fetchRoutingInstalled = true;\n  originalFetch = window.fetch.bind(window);", "  if (scenarioRouterState.fetchRoutingInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;\n  scenarioRouterState.fetchRoutingInstalled = true;\n  scenarioRouterState.originalFetch = window.fetch.bind(window);"),
("    if (!parts || !isScenarioMapAsset(parts.path)) return originalFetch(input, init);", "    if (!parts || !isScenarioMapAsset(parts.path)) return scenarioRouterState.originalFetch(input, init);"),
("    if (scenario.mapBaseUrl === 'data/world/') return originalFetch(input, init);", "    if (scenario.mapBaseUrl === 'data/world/') return scenarioRouterState.originalFetch(input, init);"),
("    if (typeof Request !== 'undefined' && input instanceof Request) return originalFetch(new Request(rewritten, input), init);\n    return originalFetch(rewritten, init);", "    if (typeof Request !== 'undefined' && input instanceof Request) return scenarioRouterState.originalFetch(new Request(rewritten, input), init);\n    return scenarioRouterState.originalFetch(rewritten, init);"),
("  if (selectedScenario && selectedScenario.id !== scenario.id) throw new Error('Scenario is already locked for this game session. Reload to choose another scenario.');\n  if (!selectedScenario) {\n    selectedScenario = scenario;\n    if (typeof window !== 'undefined') window.__worldsimScenario = scenario;\n    resolveSelection(scenario);\n  }\n  return selectedScenario;", "  if (scenarioRouterState.selectedScenario && scenarioRouterState.selectedScenario.id !== scenario.id) throw new Error('Scenario is already locked for this game session. Reload to choose another scenario.');\n  if (!scenarioRouterState.selectedScenario) {\n    scenarioRouterState.selectedScenario = scenario;\n    if (typeof window !== 'undefined') window.__worldsimScenario = scenario;\n    scenarioRouterState.resolveSelection(scenario);\n  }\n  return scenarioRouterState.selectedScenario;"),
("  const value = Number(selectedScenario?.startYear ?? (typeof window !== 'undefined' ? window.__worldsimScenario?.startYear : NaN));", "  const value = Number(scenarioRouterState.selectedScenario?.startYear ?? (typeof window !== 'undefined' ? window.__worldsimScenario?.startYear : NaN));"),
]
for old_text, new_text in repls:
    if old_text not in s:
        raise SystemExit(f'missing replacement anchor: {old_text[:100]}')
    s = s.replace(old_text, new_text, 1)
p.write_text(s)
