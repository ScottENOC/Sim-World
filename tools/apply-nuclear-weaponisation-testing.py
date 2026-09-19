from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def rep(path,old,new):
 p=ROOT/path;t=p.read_text()
 if old not in t: raise SystemExit(f'marker missing in {path}: {old[:140]!r}')
 p.write_text(t.replace(old,new,1))

rep('js/economy/construction.js',
"  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,",
"  nuclear_weapons_research_establishment: {\n    id: 'nuclear_weapons_research_establishment', name: 'Strategic nuclear research establishment', requiredTechId: 'isotope_separation', unique: false,\n    requiresInfrastructure: 'factory', minPopulation: 50000,\n    description: 'A secure state research and engineering establishment able to pursue an experimental nuclear explosive programme. It creates a visible procurement and staffing footprint but contains no deployable weapon by itself.',\n    workRequired: 180000, defaultWorkers: 1100, minWorkers: 320, maxWorkers: 3600,\n    materials: { stone: 4200, steel: 1900, copper: 420, aluminium: 180 }, wagePerWorkerWeek: 0.0064, maintenanceRate: 0.095,\n  },\n  nuclear_test_range: {\n    id: 'nuclear_test_range', name: 'Nuclear test range', requiredTechId: 'nuclear_test_validation', unique: true,\n    minPopulation: 5000,\n    description: 'A controlled remote test infrastructure used to instrument and contain an experimental nuclear demonstration. The simulation deliberately abstracts all device engineering and yield details.',\n    workRequired: 120000, defaultWorkers: 700, minWorkers: 200, maxWorkers: 2400,\n    materials: { stone: 3200, steel: 950, copper: 180 }, wagePerWorkerWeek: 0.0058, maintenanceRate: 0.055,\n  },\n  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,")

rep('js/technology/breakthroughs.js',
"import { tickStrategicNuclearBreakthroughs } from './strategicNuclear.js?v=20260920-strategic-nuclear1';",
"import { tickStrategicNuclearBreakthroughs } from './strategicNuclear.js?v=20260920-strategic-nuclear1';\nimport { tickNuclearWeaponisationBreakthroughs } from './nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';\nimport { tickNuclearWeaponProgramme } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';")
rep('js/technology/breakthroughs.js',
"  events.push(...tickStrategicNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));",
"  events.push(...tickStrategicNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickNuclearWeaponisationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  for (const region of regions) events.push(...tickNuclearWeaponProgramme(region, currentTick, elapsedDays, rng));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));")

print('Nuclear weaponisation and testing integration applied')
