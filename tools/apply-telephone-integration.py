#!/usr/bin/env python3
from pathlib import Path

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1))

# Buildable local exchange infrastructure.
p=Path('js/economy/construction.js'); s=p.read_text()
if "id: 'telephone_exchange'" not in s:
    anchor="  telegraph_network: {\n"
    block="""  telephone_exchange: {
    id: 'telephone_exchange', name: 'Telephone exchange and local lines', requiredTechId: 'telephone_networks', unique: false,
    requiresInfrastructure: 'telegraph_network', minPopulation: 10000,
    description: 'A staffed switchboard, local copper loops and business/government subscribers. Early networks improve dense local coordination rather than replacing long-distance telegraphy.',
    workRequired: 11500, defaultWorkers: 135, minWorkers: 40, maxWorkers: 550,
    materials: { wood: 420, iron: 110, copper: 55 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
"""
    if anchor not in s: raise RuntimeError('telegraph construction anchor missing')
    p.write_text(s.replace(anchor,block+anchor,1))

# Breakthrough integration.
p=Path('js/technology/breakthroughs.js'); s=p.read_text()
if "tickTelephoneBreakthroughs" not in s:
    anchor="import { tickTelegraphBreakthroughs } from './telegraphy.js?v=20260917-telegraph1';"
    if anchor not in s: raise RuntimeError('telegraph breakthrough import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { tickTelephoneBreakthroughs } from './telephone.js?v=20260918-telephone1';",1)
    anchor2="  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));"
    if anchor2 not in s: raise RuntimeError('telegraph breakthrough tick anchor missing')
    s=s.replace(anchor2,anchor2+"\n  events.push(...tickTelephoneBreakthroughs(regions, currentTick, rng, elapsedDays));",1)
    p.write_text(s)

# Live regional communications service tick.
p=Path('js/main.js'); s=p.read_text()
if "tickLocalCommunications" not in s:
    anchor="import { tickElectricity } from './economy/electricity.js?v=20260917-electric1';"
    if anchor not in s: raise RuntimeError('electricity import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { tickLocalCommunications } from './economy/localCommunications.js?v=20260918-telephone1';",1)
    anchor2="    for (const region of regions) tickElectricity(region, time.elapsedDays);"
    if anchor2 not in s: raise RuntimeError('electricity tick anchor missing')
    s=s.replace(anchor2,anchor2+"\n    for (const region of regions) tickLocalCommunications(region, time.elapsedDays);",1)
    p.write_text(s)

# Industrial output gets a modest coordination gain separate from electric motor power.
p=Path('js/economy/industrialSupply.js'); s=p.read_text()
if "telephoneIndustrialMultiplier" not in s:
    anchor="import { electricityIndustrialMultiplier } from './electricity.js?v=20260917-electric1';"
    if anchor not in s: raise RuntimeError('industrial electricity import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { telephoneIndustrialMultiplier } from './localCommunications.js?v=20260918-telephone1';",1)
    old="  const electric = electricityIndustrialMultiplier(region); s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric); return s;"
    new="  const electric = electricityIndustrialMultiplier(region); const communications = telephoneIndustrialMultiplier(region); s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric * communications); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric * communications); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric * communications); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric * communications); return s;"
    if old not in s: raise RuntimeError('industrial output anchor missing')
    s=s.replace(old,new,1)
    p.write_text(s)

print('telephone integration applied')
