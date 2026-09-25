from pathlib import Path
import json


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, count))

# Construction loop: machinery is durable capital and the workforce size matters to equipment coverage.
replace('js/economy/construction.js',
        "import { constructionProductivity } from './constructionProductivity.js?v=20260925-construction-productivity1';\n",
        "import { constructionProductivity } from './constructionProductivity.js?v=20260925-construction-productivity1';\nimport { tickConstructionEquipment } from './constructionEquipment.js?v=20260925-construction-equipment1';\n")
replace('js/economy/construction.js',
        "const productivity = constructionProductivity(region, typeId);",
        "const productivity = constructionProductivity(region, typeId, assigned);")
replace('js/economy/construction.js',
        "export function tickConstruction(regions, currentTick, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const events = [];\n  for (const region of regions) {",
        "export function tickConstruction(regions, currentTick, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const events = [];\n  for (const region of regions) {\n    tickConstructionEquipment(region, elapsedDays);")
replace('js/economy/construction.js',
        "const productivity = constructionProductivity(region, project.typeId);",
        "const productivity = constructionProductivity(region, project.typeId, workers);")

# Region state: equipment is durable regional capital, not an inferred bonus.
replace('js/world/region.js',
        "    this.construction = { projects: [], completed: {}, assets: [], workersReserved: 0,\n      maintenanceWorkersReserved: 0, lastWeek: null };\n",
        "    this.construction = { projects: [], completed: {}, assets: [], workersReserved: 0,\n      maintenanceWorkersReserved: 0, lastWeek: null };\n    this.constructionEquipment = { stock: {}, serviceable: {}, targets: {}, utilisation: {}, lastReport: {} };\n")

# Scenario modern baseline: seed ordinary construction plant everywhere and rare specialist plant explicitly.
replace('js/core/scenarioModernStart.js',
        "import { syncRailwayConnectionEntry } from '../economy/railways.js';\n",
        "import { syncRailwayConnectionEntry } from '../economy/railways.js';\nimport { seedConstructionEquipment } from '../economy/constructionEquipment.js?v=20260925-construction-equipment1';\n")
replace('js/core/scenarioModernStart.js',
        "  const machinery = regionalProfileEntry(profile, 'regionalAgriculturalMachineryPer1000', region);\n  if (!stock && !industrial && !machinery) return false;",
        "  const machinery = regionalProfileEntry(profile, 'regionalAgriculturalMachineryPer1000', region);\n  const countryId = regionCountryId(region);\n  const equipmentPer1000 = { ...(profile?.constructionEquipmentDefaultsPer1000 || {}), ...(profile?.countryConstructionEquipmentPer1000?.[countryId] || {}), ...(regionalProfileEntry(profile, 'regionalConstructionEquipmentPer1000', region) || {}) };\n  const equipmentAbsolute = regionalProfileEntry(profile, 'regionalConstructionEquipment', region);\n  if (!stock && !industrial && !machinery && !Object.keys(equipmentPer1000).length && !equipmentAbsolute) return false;")
replace('js/core/scenarioModernStart.js',
        "  if (machinery) {\n    region.agriculturalMachinery ||= {};",
        "  if (Object.keys(equipmentPer1000).length || equipmentAbsolute) {\n    const equipment = {};\n    for (const [id, per1000] of Object.entries(equipmentPer1000)) equipment[id] = nonNegative(per1000) * scale;\n    for (const [id, absolute] of Object.entries(equipmentAbsolute || {})) equipment[id] = Math.max(nonNegative(equipment[id]), nonNegative(absolute));\n    seedConstructionEquipment(region, equipment);\n  }\n\n  if (machinery) {\n    region.agriculturalMachinery ||= {};")

# Subsea cables: a cable-laying ship is a hard specialised-capital gate.
replace('js/economy/electricityInterconnectors.js',
        "const DAYS_PER_YEAR = 365.2425;\n",
        "import { availableSpecialisedEquipment } from './constructionEquipment.js?v=20260925-construction-equipment1';\n\nconst DAYS_PER_YEAR = 365.2425;\n")
replace('js/economy/electricityInterconnectors.js',
        "      const remainingFraction = clamp(1 - project.workDone / project.workRequired);\n      const desiredFraction = Math.min(remainingFraction, years * (project.undersea ? 0.48 : 0.75));",
        "      const remainingFraction = clamp(1 - project.workDone / project.workRequired);\n      const cableShips = project.undersea ? availableSpecialisedEquipment(regions, origin, 'cableLayingVessels') : 0;\n      if (project.undersea && cableShips < 0.5) { project.stalledReason = 'cable_laying_vessel_unavailable'; continue; }\n      const specialistFactor = project.undersea ? Math.min(2.4, 0.75 + cableShips * 0.70) : 1;\n      const desiredFraction = Math.min(remainingFraction, years * (project.undersea ? 0.48 : 0.75) * specialistFactor);")

# Infrastructure UI: show real plant and task bottlenecks.
replace('js/ui/mobileGameplayControls.js',
        "import { constructionProductivityBreakdown } from '../economy/constructionProductivity.js?v=20260925-construction-productivity1';\n",
        "import { constructionProductivityBreakdown } from '../economy/constructionProductivity.js?v=20260925-construction-productivity1';\nimport { constructionEquipmentSummary } from '../economy/constructionEquipment.js?v=20260925-construction-equipment1';\n")
replace('js/ui/mobileGameplayControls.js',
        "function renderInfrastructureModal(sim, region) {",
        "function equipmentSummaryHtml(region) {\n  const equipment = constructionEquipmentSummary(region).filter((item) => item.stock > 0.01 || item.target > 0.01);\n  if (!equipment.length) return '<div class=\"mobile-build-summary\"><strong>Construction plant</strong><div class=\"mobile-build-muted\">No powered construction equipment recorded.</div></div>';\n  return `<div class=\"mobile-build-summary\"><strong>Construction plant</strong><div class=\"mobile-build-muted\">${equipment.map((item) => `${esc(item.label)} ${Math.floor(item.serviceable).toLocaleString()} serviceable / ${Math.floor(item.stock).toLocaleString()} owned`).join(' · ')}</div></div>`;\n}\n\nfunction productivityHtml(region, typeId, workers) {\n  const breakdown = constructionProductivityBreakdown(region, typeId, workers);\n  const bottlenecks = (breakdown.bottlenecks || []).slice(0, 3).map((item) => `${item.task.replaceAll('_',' ')} ${item.factor.toFixed(2)}×`).join(' · ');\n  return `${breakdown.total.toFixed(2)}× effective work per worker-week${bottlenecks ? ` · plant bottlenecks: ${esc(bottlenecks)}` : ''}`;\n}\n\nfunction renderInfrastructureModal(sim, region) {")
replace('js/ui/mobileGameplayControls.js',
        "    ${labourSummary(region)}\n    <div class=\"mobile-build-summary\">",
        "    ${labourSummary(region)}\n    ${equipmentSummaryHtml(region)}\n    <div class=\"mobile-build-summary\">")
replace('js/ui/mobileGameplayControls.js',
        "<div class=\"mobile-build-muted\">Current productivity: ${constructionProductivityBreakdown(region, project.typeId).total.toFixed(2)}× effective work per worker-week</div>",
        "<div class=\"mobile-build-muted\">Current productivity: ${productivityHtml(region, project.typeId, project.targetWorkers || type?.defaultWorkers || 100)}</div>")
replace('js/ui/mobileGameplayControls.js',
        "if (detail) { const productivity = constructionProductivityBreakdown(region, entry.type.id).total; detail.innerHTML = `${esc(entry.type.description || '')}<br><strong>Materials:</strong> ${esc(materialText(entry.type.materials))} · <strong>Base work:</strong> ${Math.round(entry.type.workRequired || 0).toLocaleString()} worker-weeks · <strong>Current productivity:</strong> ${productivity.toFixed(2)}×`; }",
        "if (detail) { const requested = Number(workers?.value) || entry.type.defaultWorkers || 100; detail.innerHTML = `${esc(entry.type.description || '')}<br><strong>Materials:</strong> ${esc(materialText(entry.type.materials))} · <strong>Base work:</strong> ${Math.round(entry.type.workRequired || 0).toLocaleString()} worker-weeks · <strong>Current productivity:</strong> ${productivityHtml(region, entry.type.id, requested)}`; }")

p = Path('data/scenarios/fractured-2027/modern-start.json')
data = json.loads(p.read_text())
data['constructionEquipmentDefaultsPer1000'] = {
    'powerToolSets': 4.0,
    'excavators': 0.40,
    'bulldozers': 0.08,
    'constructionTrucks': 1.10,
    'mobileCranes': 0.07,
    'concretePlantUnits': 0.025,
    'tunnelBoringMachines': 0,
    'cableLayingVessels': 0,
}
data.setdefault('regionalConstructionEquipment', {})['kent'] = {
    'tunnelBoringMachines': 1,
    'cableLayingVessels': 1,
}
p.write_text(json.dumps(data, indent=2) + '\n')

print('Construction equipment capital integration applied.')
