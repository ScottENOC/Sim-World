from pathlib import Path

path = Path('js/economy/construction.js')
text = path.read_text()
if "water_treatment_plant:" in text:
    raise SystemExit(0)
marker = "  watchtowers: {\n"
if marker not in text:
    raise SystemExit('construction insertion marker not found')
block = """  water_treatment_plant: {
    id: 'water_treatment_plant', name: 'Drinking-water treatment plant', requiredTechId: 'germ_theory', unique: true,
    requiresInfrastructure: 'aqueduct', minPopulation: 18000,
    description: 'Filtration, settling, disinfection and pumping works that turn raw water into dependable potable supply. Service falls when the plant is damaged or loses electricity.',
    workRequired: 24000, defaultWorkers: 260, minWorkers: 80, maxWorkers: 1000,
    materials: { stone: 1600, steel: 220, iron: 180, copper: 45 }, wagePerWorkerWeek: 0.004, maintenanceRate: 0.075,
  },
  wastewater_treatment_plant: {
    id: 'wastewater_treatment_plant', name: 'Wastewater treatment plant', requiredTechId: 'germ_theory', unique: true,
    requiresInfrastructure: 'urban_drainage', minPopulation: 20000,
    description: 'Settling, biological treatment and sludge-handling works that remove pathogens and nutrients before discharge and create a source for later water reuse.',
    workRequired: 28000, defaultWorkers: 300, minWorkers: 90, maxWorkers: 1150,
    materials: { stone: 1700, steel: 260, iron: 200, copper: 55 }, wagePerWorkerWeek: 0.0042, maintenanceRate: 0.085,
  },
  water_pumping_station: {
    id: 'water_pumping_station', name: 'Municipal water pumping station', requiredTechId: 'industrial_electrification', unique: true,
    requiresInfrastructure: 'aqueduct', minPopulation: 18000,
    description: 'Electric pumps, valves and service reservoirs that maintain pressure and move bulk water through a modern urban network.',
    workRequired: 15000, defaultWorkers: 170, minWorkers: 50, maxWorkers: 650,
    materials: { stone: 650, steel: 260, iron: 160, copper: 85 }, wagePerWorkerWeek: 0.0045, maintenanceRate: 0.08,
  },
  bulk_water_pipeline: {
    id: 'bulk_water_pipeline', name: 'Bulk water pipeline', requiredTechId: 'industrial_electrification', unique: true,
    requiresInfrastructure: 'water_pumping_station', minPopulation: 22000,
    description: 'Large pressurised mains and trunk pipelines connecting sources, treatment works, reservoirs and urban distribution networks.',
    workRequired: 32000, defaultWorkers: 340, minWorkers: 100, maxWorkers: 1300,
    materials: { steel: 700, iron: 300, copper: 40, stone: 800 }, wagePerWorkerWeek: 0.0045, maintenanceRate: 0.065,
  },
  desalination_plant: {
    id: 'desalination_plant', name: 'Seawater desalination plant', requiredTechId: 'industrial_electrification', coastal: true, unique: true,
    requiresInfrastructure: 'water_pumping_station', minPopulation: 30000,
    description: 'Energy-intensive seawater intake, membrane or thermal treatment, and pumping works producing a drought-resistant water source. Output collapses with plant damage or power loss.',
    workRequired: 46000, defaultWorkers: 440, minWorkers: 130, maxWorkers: 1700,
    materials: { steel: 950, iron: 360, copper: 150, stone: 1100 }, wagePerWorkerWeek: 0.0052, maintenanceRate: 0.11,
  },
"""
path.write_text(text.replace(marker, block + marker, 1))
