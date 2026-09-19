from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def rep(path, old, new):
    p=ROOT/path
    text=p.read_text()
    if new in text:
        return False
    if old not in text:
        raise SystemExit(f'marker missing in {path}: {old[:160]!r}')
    p.write_text(text.replace(old,new,1))
    return True

# Strategic fuel-cycle facilities are large, persistent industrial assets.
rep('js/economy/construction.js',
"  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,",
"  uranium_enrichment_complex: {\n    id: 'uranium_enrichment_complex', name: 'Uranium isotope-separation complex', requiredTechId: 'isotope_separation', unique: false,\n    requiresInfrastructure: 'local_electric_grid', minPopulation: 50000,\n    description: 'A large precision-industrial isotope-separation complex. It can support advanced civilian fuel production or, under a deliberate strategic programme, accumulate proliferation-significant material. Its electricity and procurement footprint is difficult to hide completely.',\n    workRequired: 260000, defaultWorkers: 1500, minWorkers: 450, maxWorkers: 4800,\n    materials: { stone: 5200, steel: 2600, copper: 900, aluminium: 260 }, wagePerWorkerWeek: 0.0062, maintenanceRate: 0.105,\n  },\n  nuclear_reprocessing_plant: {\n    id: 'nuclear_reprocessing_plant', name: 'Nuclear reprocessing plant', requiredTechId: 'spent_fuel_reprocessing', unique: false,\n    requiresInfrastructure: 'nuclear_power_station', minPopulation: 40000,\n    description: 'A shielded chemical-industrial complex for recovering useful material from spent reactor fuel. It reduces waste pressure and extends fuel supply, while also creating strategically sensitive separation capability.',\n    workRequired: 210000, defaultWorkers: 1300, minWorkers: 400, maxWorkers: 4200,\n    materials: { stone: 6500, steel: 2300, copper: 520, aluminium: 130 }, wagePerWorkerWeek: 0.0060, maintenanceRate: 0.10,\n  },\n  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,")

# Electricity: strategic fuel-cycle plants are major industrial loads and must run before demand is calculated.
rep('js/economy/electricity.js',
"import { tickNuclearFuelCycle, nuclearGeneration } from './nuclearPower.js?v=20260920-nuclear1';",
"import { tickNuclearFuelCycle, nuclearGeneration } from './nuclearPower.js?v=20260920-nuclear1';\nimport { tickStrategicNuclearFuelCycle, strategicNuclearElectricityDemand } from './strategicNuclear.js?v=20260920-strategic-nuclear1';")
rep('js/economy/electricity.js',
"  const lightMetalsDemand = nonNegative(region.lightMetals?.electricityLoad);\n  const industrialDemand = baseIndustrialDemand + lightMetalsDemand;\n  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand, lightMetalsDemand };",
"  const lightMetalsDemand = nonNegative(region.lightMetals?.electricityLoad);\n  const strategicNuclearDemand = nonNegative(region.strategicNuclear?.electricityLoad);\n  const industrialDemand = baseIndustrialDemand + lightMetalsDemand + strategicNuclearDemand;\n  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand, lightMetalsDemand, strategicNuclearDemand };")
rep('js/economy/electricity.js',
"  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');\n  tickNuclearFuelCycle(region, elapsedDays);\n  const nuclear = nuclearGeneration(region, elapsedDays);",
"  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');\n  tickNuclearFuelCycle(region, elapsedDays);\n  tickStrategicNuclearFuelCycle(region, elapsedDays);\n  // Demand uses the fuel-cycle load computed above. The exported helper keeps this\n  // explicit for tests and future planning UI even though the tick stores it on state.\n  strategicNuclearElectricityDemand(region, elapsedDays);\n  const nuclear = nuclearGeneration(region, elapsedDays);")
rep('js/economy/electricity.js',
"  state.lightMetalsDemand = demand.lightMetalsDemand || 0;",
"  state.lightMetalsDemand = demand.lightMetalsDemand || 0;\n  state.strategicNuclearDemand = demand.strategicNuclearDemand || 0;")

# Technology progression is separate from weaponisation.
rep('js/technology/breakthroughs.js',
"import { tickNuclearBreakthroughs } from './nuclear.js?v=20260920-nuclear1';",
"import { tickNuclearBreakthroughs } from './nuclear.js?v=20260920-nuclear1';\nimport { tickStrategicNuclearBreakthroughs } from './strategicNuclear.js?v=20260920-strategic-nuclear1';")
rep('js/technology/breakthroughs.js',
"  events.push(...tickNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));",
"  events.push(...tickNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickStrategicNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));")

print('Strategic nuclear fuel-cycle integration applied')
