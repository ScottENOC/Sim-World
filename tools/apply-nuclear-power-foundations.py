from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def rep(path, old, new):
    p=ROOT/path
    text=p.read_text()
    if old not in text:
        raise SystemExit(f'marker missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old,new,1))

# Construction: fuel fabrication, full-scale nuclear station and dedicated spent-fuel storage.
rep('js/economy/construction.js',
"  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,",
"  nuclear_fuel_plant: {\n    id: 'nuclear_fuel_plant', name: 'Nuclear fuel fabrication plant', requiredTechId: 'uranium_fuel_cycle', unique: false,\n    requiresInfrastructure: 'factory', minPopulation: 25000,\n    description: 'Shielded chemical and precision-engineering works concentrating uranium and fabricating controlled civilian reactor fuel. Imported uranium ore can feed the plant.',\n    workRequired: 72000, defaultWorkers: 720, minWorkers: 220, maxWorkers: 2400,\n    materials: { stone: 2400, steel: 950, copper: 180, aluminium: 80 }, wagePerWorkerWeek: 0.0055, maintenanceRate: 0.085,\n  },\n  nuclear_power_station: {\n    id: 'nuclear_power_station', name: 'Nuclear power station', requiredTechId: 'nuclear_power_generation', unique: false,\n    requiresInfrastructure: 'local_electric_grid', requiresCoolingWater: true, minPopulation: 50000,\n    description: 'A large civilian reactor complex with containment, steam plant, shielding, cooling systems and grid switchyard. It requires fabricated reactor fuel and dependable cooling water.',\n    workRequired: 450000, defaultWorkers: 1800, minWorkers: 550, maxWorkers: 5200,\n    materials: { stone: 9000, steel: 3600, copper: 650, aluminium: 180 }, wagePerWorkerWeek: 0.0065, maintenanceRate: 0.095,\n  },\n  spent_fuel_storage: {\n    id: 'spent_fuel_storage', name: 'Dedicated spent-fuel storage', requiredTechId: 'spent_fuel_management', unique: false,\n    requiresInfrastructure: 'nuclear_power_station', minPopulation: 15000,\n    description: 'Shielded pools, handling equipment and durable storage structures extending safe capacity for intensely radioactive spent reactor fuel.',\n    workRequired: 90000, defaultWorkers: 700, minWorkers: 220, maxWorkers: 2600,\n    materials: { stone: 4800, steel: 1200, copper: 100 }, wagePerWorkerWeek: 0.0055, maintenanceRate: 0.055,\n  },\n  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,")
rep('js/economy/construction.js',
"    (!type.requiresRiver || (region.hydrology?.riverIds || []).length > 0) &&\n    (!type.minPopulation || (region.population || 0) >= type.minPopulation) &&",
"    (!type.requiresRiver || (region.hydrology?.riverIds || []).length > 0) &&\n    (!type.requiresCoolingWater || region.isCoastal || (region.hydrology?.riverIds || []).length > 0) &&\n    (!type.minPopulation || (region.population || 0) >= type.minPopulation) &&")
rep('js/economy/construction.js',
"      (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) ||\n      (type.requiresRiver && !(region.hydrology?.riverIds || []).length) ||\n      (type.minPopulation && (region.population || 0) < type.minPopulation)) return null;",
"      (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) ||\n      (type.requiresRiver && !(region.hydrology?.riverIds || []).length) ||\n      (type.requiresCoolingWater && !region.isCoastal && !(region.hydrology?.riverIds || []).length) ||\n      (type.minPopulation && (region.population || 0) < type.minPopulation)) return null;")

# Tradeable civilian nuclear inputs are strategic. Spent fuel is intentionally NOT merchant cargo.
rep('js/economy/tradeGoods.js',
"  titanium:   { label: 'Titanium metal', basePrice: 95, referenceStock: 220, category: 'advanced_material', strategic: true, cargoKgPerUnit: 1 },",
"  titanium:   { label: 'Titanium metal', basePrice: 95, referenceStock: 220, category: 'advanced_material', strategic: true, cargoKgPerUnit: 1 },\n  uranium_ore: { label: 'Uranium ore', basePrice: 7, referenceStock: 700, category: 'raw_material', strategic: true, cargoKgPerUnit: 2.2 },\n  uranium_concentrate: { label: 'Uranium concentrate', basePrice: 48, referenceStock: 140, category: 'processed_material', strategic: true, cargoKgPerUnit: 0.8 },\n  reactor_fuel: { label: 'Civilian reactor fuel', basePrice: 190, referenceStock: 45, category: 'advanced_material', strategic: true, cargoKgPerUnit: 0.25 },")

# Electricity: run the fuel cycle first, then dispatch nuclear output as steady generation.
rep('js/economy/electricity.js',
"import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260917-electric1';",
"import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260920-nuclear1';\nimport { tickNuclearFuelCycle, nuclearGeneration } from './nuclearPower.js?v=20260920-nuclear1';")
rep('js/economy/electricity.js',
"    curtailed: 0, coalCyclingLoss: 0, balancingShortfall: 0, dispatchEfficiency: 1,",
"    curtailed: 0, coalCyclingLoss: 0, nuclearCyclingLoss: 0, balancingShortfall: 0, dispatchEfficiency: 1,\n    reactorFuelConsumed: 0, spentFuelGenerated: 0,")
rep('js/economy/electricity.js',
"  const peaking = nonNegative(outputs.peaking);\n  const grossPotential = coal + hydro + solar + wind + peaking;",
"  const peaking = nonNegative(outputs.peaking);\n  const nuclear = nonNegative(outputs.nuclear);\n  const grossPotential = coal + hydro + solar + wind + peaking + nuclear;")
rep('js/economy/electricity.js',
"    grossPotential: 0, usableGeneration: 0, curtailed: 0, coalCyclingLoss: 0,",
"    grossPotential: 0, usableGeneration: 0, curtailed: 0, coalCyclingLoss: 0, nuclearCyclingLoss: 0,")
rep('js/economy/electricity.js',
"  const coalCyclingLoss = Math.min(coal * 0.18, balancingShortfall * 0.45);\n  const usableGeneration = Math.max(0, grossPotential - curtailed - coalCyclingLoss);",
"  const coalCyclingLoss = Math.min(coal * 0.18, balancingShortfall * 0.45);\n  // Early large reactors are excellent steady generators but poor peakers. A system\n  // with insufficient flexible plant therefore cannot treat them as balancing supply.\n  const nuclearCyclingLoss = Math.min(nuclear * 0.08, balancingShortfall * 0.18);\n  const usableGeneration = Math.max(0, grossPotential - curtailed - coalCyclingLoss - nuclearCyclingLoss);")
rep('js/economy/electricity.js',
"    grossPotential, usableGeneration, demandLimitedGeneration, curtailed, coalCyclingLoss,",
"    grossPotential, usableGeneration, demandLimitedGeneration, curtailed, coalCyclingLoss, nuclearCyclingLoss,")
rep('js/economy/electricity.js',
"  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');\n\n  const coalPotential = coalStations * 5200 * years;",
"  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');\n  tickNuclearFuelCycle(region, elapsedDays);\n  const nuclear = nuclearGeneration(region, elapsedDays);\n\n  const coalPotential = coalStations * 5200 * years;")
rep('js/economy/electricity.js',
"  const dispatch = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput }, demand.total);",
"  const dispatch = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, nuclear: nuclear.output }, demand.total);")
rep('js/economy/electricity.js',
"  const copperNeed = (grids * 18 + (coalStations + hydroStations) * 5 + solarStations * 3 + windStations * 4) * years;",
"  const nuclearStations = effectiveInfrastructureCount(region, 'nuclear_power_station');\n  const copperNeed = (grids * 18 + (coalStations + hydroStations) * 5 + solarStations * 3 + windStations * 4 + nuclearStations * 8) * years;")
rep('js/economy/electricity.js',
"  state.coalCyclingLoss = dispatch.coalCyclingLoss;\n  state.balancingShortfall = dispatch.balancingShortfall;",
"  state.coalCyclingLoss = dispatch.coalCyclingLoss;\n  state.nuclearCyclingLoss = dispatch.nuclearCyclingLoss;\n  state.reactorFuelConsumed = nuclear.reactorFuelConsumed || 0;\n  state.spentFuelGenerated = nuclear.spentFuelGenerated || 0;\n  state.balancingShortfall = dispatch.balancingShortfall;")
rep('js/economy/electricity.js',
"    ...state, coalOutput, hydroOutput, solarOutput, windOutput, gridCapacity, networkReliability,",
"    ...state, coalOutput, hydroOutput, solarOutput, windOutput, nuclearOutput: nuclear.output || 0, nuclear, gridCapacity, networkReliability,")

# Technology progression joins the normal breakthrough tick.
rep('js/technology/breakthroughs.js',
"import { tickElectrificationBreakthroughs } from './electrification.js?v=20260917-electric1';",
"import { tickElectrificationBreakthroughs } from './electrification.js?v=20260917-electric1';\nimport { tickNuclearBreakthroughs } from './nuclear.js?v=20260920-nuclear1';")
rep('js/technology/breakthroughs.js',
"  events.push(...tickElectrificationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));",
"  events.push(...tickElectrificationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickNuclearBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));")

print('Nuclear power foundations integration applied')
