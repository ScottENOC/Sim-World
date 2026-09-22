from pathlib import Path

scenarios = Path('js/core/scenarios.js')
s = scenarios.read_text()
anchor = """export function scenarioAssetUrl(relativePath, scenario = selectedScenario) {\n  if (!scenario) throw new Error('A scenario must be selected before scenario assets can be resolved.');\n  return `${scenario.mapBaseUrl}${String(relativePath || '').replace(/^\\/+/, '')}`;\n}\n"""
replacement = anchor + """\nexport function fetchScenarioAssetDirect(relativePath, scenario, init) {\n  const url = scenarioAssetUrl(relativePath, scenario);\n  const directFetch = originalFetch || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);\n  if (!directFetch) throw new Error('Browser fetch is not available for scenario assets.');\n  return directFetch(url, init);\n}\n"""
if anchor not in s:
    raise SystemExit('scenarioAssetUrl anchor not found')
s = s.replace(anchor, replacement, 1)
scenarios.write_text(s)

picker = Path('js/ui/startupPicker.js')
p = picker.read_text()
old_import = "import { SCENARIOS, currentScenario, scenarioAssetUrl, selectScenario } from '../core/scenarios.js?v=20260921-scenarios2';"
new_import = "import { SCENARIOS, currentScenario, fetchScenarioAssetDirect, scenarioAssetUrl, selectScenario } from '../core/scenarios.js?v=20260922-picker-deadlock1';"
if old_import not in p:
    raise SystemExit('startupPicker import anchor not found')
p = p.replace(old_import, new_import, 1)
old_fetch = "const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });"
new_fetch = "const response = await fetchScenarioAssetDirect(relativePath, scenario, { signal: controller.signal, cache: 'no-store' });"
if old_fetch not in p:
    raise SystemExit('picker fetch anchor not found')
p = p.replace(old_fetch, new_fetch, 1)
picker.write_text(p)
