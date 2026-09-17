#!/usr/bin/env python3
from pathlib import Path

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:120]!r}')
    p.write_text(s.replace(old,new,1))

# Buildable generation and distribution assets.
p=Path('js/economy/construction.js'); s=p.read_text()
if "id: 'coal_power_station'" not in s:
    anchor="  petroleum_refinery: {\n"
    block="""  coal_power_station: {
    id: 'coal_power_station', name: 'Coal-fired power station', requiredTechId: 'electrical_generation', unique: false,
    minPopulation: 10000,
    description: 'Steam-driven dynamos, boilers and switchgear generating local electrical power. Output depends on a continuing coal supply.',
    workRequired: 22000, defaultWorkers: 280, minWorkers: 90, maxWorkers: 1100,
    materials: { stone: 900, iron: 220, steel: 140 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.07,
  },
  local_electric_grid: {
    id: 'local_electric_grid', name: 'Local electric distribution grid', requiredTechId: 'local_electric_distribution', unique: false,
    minPopulation: 8000,
    description: 'Local wires, substations and distribution equipment carrying generated electricity to homes, workshops and factories.',
    workRequired: 15000, defaultWorkers: 190, minWorkers: 60, maxWorkers: 800,
    materials: { wood: 700, iron: 120, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
  hydroelectric_station: {
    id: 'hydroelectric_station', name: 'Hydroelectric station', requiredTechId: 'hydroelectric_generation', unique: false,
    requiresInfrastructure: 'reservoir_dam', minPopulation: 7000,
    description: 'Turbines and generators converting controlled river flow into local electrical power.',
    workRequired: 26000, defaultWorkers: 300, minWorkers: 100, maxWorkers: 1200,
    materials: { stone: 1200, iron: 180, steel: 180 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.06,
  },
"""
    if anchor not in s: raise RuntimeError('petroleum refinery anchor missing')
    s=s.replace(anchor,block+anchor,1); p.write_text(s)

# Electrification breakthroughs join normal breakthrough pass.
p=Path('js/technology/breakthroughs.js'); s=p.read_text()
if "tickElectrificationBreakthroughs" not in s:
    s=s.replace("import { tickPetroleumBreakthroughs } from './petroleum.js?v=20260917-oil1';",
                "import { tickPetroleumBreakthroughs } from './petroleum.js?v=20260917-oil1';\nimport { tickElectrificationBreakthroughs } from './electrification.js?v=20260917-electric1';",1)
    s=s.replace("  events.push(...tickPetroleumBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;",
                "  events.push(...tickPetroleumBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickElectrificationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;",1)
    p.write_text(s)

# Electricity ticks before households/trade so delivered service exists for the rest of the tick.
p=Path('js/main.js'); s=p.read_text()
if "./economy/electricity.js" not in s:
    s=s.replace("import { tickPetroleumRefining } from './economy/petroleumRefining.js?v=20260917-oil2';",
                "import { tickPetroleumRefining } from './economy/petroleumRefining.js?v=20260917-oil2';\nimport { tickElectricity } from './economy/electricity.js?v=20260917-electric1';",1)
if "tickElectricity(region, time.elapsedDays)" not in s:
    anchor="    for (const region of regions) tickPetroleumRefining(region, time.elapsedDays);"
    if anchor not in s: raise RuntimeError('petroleum tick anchor missing')
    s=s.replace(anchor,anchor+"\n    for (const region of regions) tickElectricity(region, time.elapsedDays);",1)
p.write_text(s)

# Electrification improves industrial output only when physical service is delivered.
p=Path('js/economy/industrialSupply.js'); s=p.read_text()
if "electricityIndustrialMultiplier" not in s:
    s="import { electricityIndustrialMultiplier } from './electricity.js?v=20260917-electric1';\n"+s
old="  s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22); return s;"
new="  const electric = electricityIndustrialMultiplier(region); s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric); return s;"
if old not in s: raise RuntimeError('industrial output anchor missing')
s=s.replace(old,new,1); p.write_text(s)

# Household electrical service feeds the same wellbeing model as other delivered services.
p=Path('js/politics/popularWellbeing.js'); s=p.read_text()
if "electricityWellbeing" not in s:
    s=s.replace("import { householdEnergyWellbeing } from '../economy/householdEnergy.js?v=20260917-oil1';",
                "import { householdEnergyWellbeing } from '../economy/householdEnergy.js?v=20260917-oil1';\nimport { electricityWellbeing } from '../economy/electricity.js?v=20260917-electric1';",1)
    s=s.replace("  const energy = householdEnergyWellbeing(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity - enterprise.prosperityPenalty);",
                "  const energy = householdEnergyWellbeing(region);\n  const electricity = electricityWellbeing(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity + electricity.prosperity - enterprise.prosperityPenalty);",1)
    s=s.replace("  const energy = householdEnergyWellbeing(region);\n  return clamp(0.18 + artistic * 0.58 + gathering + energy.culturalAccess);",
                "  const energy = householdEnergyWellbeing(region);\n  const electricity = electricityWellbeing(region);\n  return clamp(0.18 + artistic * 0.58 + gathering + energy.culturalAccess + electricity.culturalAccess);",1)
    s=s.replace("  const energy = householdEnergyWellbeing(region);\n  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety);",
                "  const energy = householdEnergyWellbeing(region);\n  const electricity = electricityWellbeing(region);\n  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety + electricity.safety);",1)
    p.write_text(s)

print('electricity integration applied')
# trigger
