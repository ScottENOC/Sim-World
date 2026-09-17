#!/usr/bin/env python3
from pathlib import Path


def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1))

# Technology progression for refining capability.
p=Path('js/technology/petroleum.js'); s=p.read_text()
if "PETROLEUM_REFINING_TECH_ID" not in s:
    s=s.replace("export const OFFSHORE_OIL_DRILLING_TECH_ID = 'offshore_drilling';\n",
                "export const OFFSHORE_OIL_DRILLING_TECH_ID = 'offshore_drilling';\nexport const PETROLEUM_REFINING_TECH_ID = 'petroleum_refining';\nexport const PETROLEUM_CRACKING_TECH_ID = 'petroleum_cracking';\nexport const PETROLEUM_DESULFURISATION_TECH_ID = 'petroleum_desulfurisation';\nexport const AVIATION_FRACTIONATION_TECH_ID = 'aviation_fractionation';\n")
    old="  const offshore = tech.has(OFFSHORE_OIL_DRILLING_TECH_ID) || !advancedBase || !region.isCoastal ? 0 :\n    mining * (0.18 + industry * 0.27 + finance * 0.25 + records * 0.15 + accounting * 0.15) * 0.000004 + diffusionChance(region, regionsById, OFFSHORE_OIL_DRILLING_TECH_ID, 0.00016);\n  return { shallow: clamp01(shallow), deep: clamp01(deep), fracking: clamp01(fracking), offshore: clamp01(offshore) };"
    new="  const offshore = tech.has(OFFSHORE_OIL_DRILLING_TECH_ID) || !advancedBase || !region.isCoastal ? 0 :\n    mining * (0.18 + industry * 0.27 + finance * 0.25 + records * 0.15 + accounting * 0.15) * 0.000004 + diffusionChance(region, regionsById, OFFSHORE_OIL_DRILLING_TECH_ID, 0.00016);\n  const refiningReady = tech.has(SHALLOW_OIL_DRILLING_TECH_ID);\n  const refining = tech.has(PETROLEUM_REFINING_TECH_ID) || !refiningReady ? 0 :\n    (0.18 + smithing * 0.28 + industry * 0.34 + accounting * 0.20) * 0.000012 + diffusionChance(region, regionsById, PETROLEUM_REFINING_TECH_ID, 0.00038);\n  const refineryAdvanced = tech.has(PETROLEUM_REFINING_TECH_ID);\n  const cracking = tech.has(PETROLEUM_CRACKING_TECH_ID) || !refineryAdvanced ? 0 :\n    (0.12 + industry * 0.38 + finance * 0.20 + accounting * 0.30) * 0.000005 + diffusionChance(region, regionsById, PETROLEUM_CRACKING_TECH_ID, 0.00018);\n  const desulfurisation = tech.has(PETROLEUM_DESULFURISATION_TECH_ID) || !refineryAdvanced ? 0 :\n    (0.1 + industry * 0.35 + records * 0.20 + accounting * 0.35) * 0.0000045 + diffusionChance(region, regionsById, PETROLEUM_DESULFURISATION_TECH_ID, 0.00016);\n  const aviation = tech.has(AVIATION_FRACTIONATION_TECH_ID) || !tech.has(PETROLEUM_CRACKING_TECH_ID) ? 0 :\n    (0.08 + industry * 0.42 + finance * 0.18 + accounting * 0.32) * 0.000003 + diffusionChance(region, regionsById, AVIATION_FRACTIONATION_TECH_ID, 0.00012);\n  return { shallow: clamp01(shallow), deep: clamp01(deep), fracking: clamp01(fracking), offshore: clamp01(offshore), refining: clamp01(refining), cracking: clamp01(cracking), desulfurisation: clamp01(desulfurisation), aviation: clamp01(aviation) };"
    if old not in s: raise RuntimeError('petroleum chances anchor missing')
    s=s.replace(old,new,1)
    old2="    ['offshore', OFFSHORE_OIL_DRILLING_TECH_ID, 'offshore_drilling_breakthrough', 'Offshore petroleum drilling'],\n  ];"
    new2="    ['offshore', OFFSHORE_OIL_DRILLING_TECH_ID, 'offshore_drilling_breakthrough', 'Offshore petroleum drilling'],\n    ['refining', PETROLEUM_REFINING_TECH_ID, 'petroleum_refining_breakthrough', 'Petroleum refining'],\n    ['cracking', PETROLEUM_CRACKING_TECH_ID, 'petroleum_cracking_breakthrough', 'Petroleum cracking'],\n    ['desulfurisation', PETROLEUM_DESULFURISATION_TECH_ID, 'petroleum_desulfurisation_breakthrough', 'Petroleum desulfurisation'],\n    ['aviation', AVIATION_FRACTIONATION_TECH_ID, 'aviation_fractionation_breakthrough', 'Aviation-fuel fractionation'],\n  ];"
    if old2 not in s: raise RuntimeError('petroleum attempts anchor missing')
    s=s.replace(old2,new2,1)
    p.write_text(s)

# Buildable refinery infrastructure. It deliberately does NOT require a local oil
# deposit: imported crude can support a refining centre.
p=Path('js/economy/construction.js'); s=p.read_text()
if "id: 'petroleum_refinery'" not in s:
    anchor="  naval_base: {\n"
    block="""  petroleum_refinery: {
    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,
    minPopulation: 8000,
    description: 'Distillation towers, tanks, furnaces and pipework processing crude oil into specialised fuels. It can operate on imported crude and does not require local petroleum deposits.',
    workRequired: 18000, defaultWorkers: 220, minWorkers: 70, maxWorkers: 900,
    materials: { stone: 900, iron: 180, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
"""
    if anchor not in s: raise RuntimeError('construction refinery anchor missing')
    s=s.replace(anchor,block+anchor,1)
    p.write_text(s)

# Refineries derive capacity and process sophistication from physical assets + tech.
p=Path('js/economy/petroleumRefining.js'); s=p.read_text()
if "effectiveInfrastructureCount" not in s:
    s="import { effectiveInfrastructureCount } from './construction.js?v=20260917-oil3';\n"+s
if "PETROLEUM_REFINING_TECH_ID" not in s:
    s="import { PETROLEUM_REFINING_TECH_ID, PETROLEUM_CRACKING_TECH_ID, PETROLEUM_DESULFURISATION_TECH_ID, AVIATION_FRACTIONATION_TECH_ID } from '../technology/petroleum.js?v=20260917-oil3';\n"+s
old="""export function refineryAvailable(region) {
  const r = ensureRefinery(region);
  return Boolean(r.simpleDistillation && r.capacityPerYear > 0);
}
"""
new="""function syncRefineryCapability(region) {
  const r = ensureRefinery(region);
  const count = effectiveInfrastructureCount(region, 'petroleum_refinery');
  const tech = region.unlockedTechIds || new Set();
  r.simpleDistillation = count > 0 && tech.has(PETROLEUM_REFINING_TECH_ID);
  r.capacityPerYear = count * 2400;
  r.cracking = r.simpleDistillation && tech.has(PETROLEUM_CRACKING_TECH_ID);
  r.desulfurisation = r.simpleDistillation && tech.has(PETROLEUM_DESULFURISATION_TECH_ID);
  r.aviationFractionation = r.cracking && tech.has(AVIATION_FRACTIONATION_TECH_ID);
  return r;
}

export function refineryAvailable(region) {
  const r = syncRefineryCapability(region);
  return Boolean(r.simpleDistillation && r.capacityPerYear > 0);
}
"""
if old in s: s=s.replace(old,new,1)
s=s.replace("  const r = ensureRefinery(region);\n  const light =", "  const r = syncRefineryCapability(region);\n  const light =",1)
s=s.replace("  const refinery = ensureRefinery(region);", "  const refinery = syncRefineryCapability(region);",1)
p.write_text(s)

print('refinery infrastructure and upgrade tech integration applied')
