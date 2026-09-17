#!/usr/bin/env python3
from pathlib import Path

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:120]!r}')
    p.write_text(s.replace(old,new,1))

def insert_once(path, marker, anchor, insertion):
    p=Path(path); s=p.read_text()
    if marker in s: return
    if anchor not in s: raise RuntimeError(f'missing anchor in {path}: {anchor[:120]!r}')
    p.write_text(s.replace(anchor,insertion,1))

# Physical regional telegraph network construction.
p=Path('js/economy/construction.js'); s=p.read_text()
if "id: 'telegraph_network'" not in s:
    anchor="  coal_power_station: {\n"
    block="""  telegraph_network: {
    id: 'telegraph_network', name: 'Electrical telegraph network', requiredTechId: 'electrical_telegraphy', unique: true,
    minPopulation: 5000,
    description: 'Telegraph offices, poles, wire and trained operators linking this region to adjacent wired regions. Damage or an unwired gap breaks the rapid route.',
    workRequired: 12500, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { wood: 900, iron: 180, copper: 35 }, wagePerWorkerWeek: 0.0032, maintenanceRate: 0.055,
  },
"""
    if anchor not in s: raise RuntimeError('electricity construction anchor missing')
    p.write_text(s.replace(anchor,block+anchor,1))

# Telegraphy enters the normal technology pass.
p=Path('js/technology/breakthroughs.js'); s=p.read_text()
if "tickTelegraphBreakthroughs" not in s:
    import_anchor="import { tickElectrificationBreakthroughs } from './electrification.js?v=20260917-electric1';"
    if import_anchor not in s: raise RuntimeError('electrification import anchor missing')
    s=s.replace(import_anchor,import_anchor+"\nimport { tickTelegraphBreakthroughs } from './telegraphy.js?v=20260917-telegraph1';",1)
    tick_anchor="  events.push(...tickElectrificationBreakthroughs(regions, currentTick, rng, elapsedDays));"
    if tick_anchor not in s: raise RuntimeError('electrification tick anchor missing')
    s=s.replace(tick_anchor,tick_anchor+"\n  events.push(...tickTelegraphBreakthroughs(regions, currentTick, rng, elapsedDays));",1)
    p.write_text(s)

# Live diplomatic courier routing prefers a continuous operational land telegraph.
p=Path('js/diplomacy/couriers.js'); s=p.read_text()
if "./telegraph.js" not in s:
    anchor="import { authoriseRuntimeGovernmentAction } from '../politics/institutionalRuntimeAuthority.js?v=20260916-institution-diplomacy1';"
    if anchor not in s: raise RuntimeError('courier import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { telegraphDeliveryTicks, telegraphInterceptRisk, telegraphRouteBetween } from './telegraph.js?v=20260917-telegraph1';",1)
if "export function routeFor(" not in s:
    old="function routeFor(origin, target, regionsById) {\n  const land = landRoute(origin, target, regionsById);"
    new="export function routeFor(origin, target, regionsById) {\n  const telegraph = telegraphRouteBetween(origin, target, regionsById);\n  if (telegraph) return telegraph;\n  const land = landRoute(origin, target, regionsById);"
    if old not in s: raise RuntimeError('routeFor anchor missing')
    s=s.replace(old,new,1)
if "route.mode === 'telegraph'" not in s:
    old="function routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {\n  if (!route) return { interceptChance: 1, hostileActors: [] };\n  let risk = 0; const hostileActors = new Set();"
    new="function routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {\n  if (!route) return { interceptChance: 1, hostileActors: [] };\n  if (route.mode === 'telegraph') return { interceptChance: telegraphInterceptRisk(route, regionsById, senderActorId, targetActorId), hostileActors: [] };\n  let risk = 0; const hostileActors = new Set();"
    if old not in s: raise RuntimeError('routeRisk anchor missing')
    s=s.replace(old,new,1)
# Every physical message using a route gets same-tick telegraph delivery; ordinary routes preserve >=1-week travel.
s=s.replace("currentTick + Math.max(1, Math.ceil(route.days / 7))", "currentTick + telegraphDeliveryTicks(route)")
p.write_text(s)

print('telegraph integration applied')
