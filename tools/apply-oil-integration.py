#!/usr/bin/env python3
from pathlib import Path
import json, re

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1))

def insert_once(path, marker, anchor, insertion):
    p=Path(path); s=p.read_text()
    if marker in s: return
    if anchor not in s: raise RuntimeError(f'missing anchor in {path}: {anchor[:100]!r}')
    p.write_text(s.replace(anchor,insertion,1))

# Resource catalogue.
p=Path('data/world/resourceTypes.json'); data=json.loads(p.read_text())
data.setdefault('oil', {'category':'extractive','label':'Crude oil'})
p.write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n')

# Ordinary merchant commodity.
insert_once('js/economy/tradeGoods.js', "oil:        { label: 'Crude oil'",
"  coal:       { label: 'Coal', basePrice: 0.9, referenceStock: 12000, category: 'bulk_fuel', cargoKgPerUnit: 2.5 },\n",
"  coal:       { label: 'Coal', basePrice: 0.9, referenceStock: 12000, category: 'bulk_fuel', cargoKgPerUnit: 2.5 },\n  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n")

# Labour allocation recognises oil as an extractive commodity.
p=Path('js/economy/laborCore.js'); s=p.read_text()
if 'oil: 2.6' not in s:
    s=s.replace('ironOre: 2, coal: 2.4,', 'ironOre: 2, coal: 2.4, oil: 2.6,', 1)
if 'oil: 2800' not in s:
    s=s.replace('coal: 3500, clay: 1000', 'coal: 3500, oil: 2800, clay: 1000', 1)
p.write_text(s)

# Deterministic petroleum geology. A tiny seep tier permits ancient niche use;
# industrial-scale reserves require distinct drilling breakthroughs.
p=Path('js/world/region.js'); s=p.read_text()
if "region.deposits.oil = { tiers:" not in s:
    anchor="    if (!region.deposits.clay) {\n"
    if anchor not in s: raise RuntimeError('clay deposit anchor missing')
    block="""    if (!region.deposits.oil) {
      let oh = 2166136261;
      for (const c of `${region.id}:oil`) oh = Math.imul(oh ^ c.charCodeAt(0), 16777619);
      const oilSignal = (oh >>> 0) / 4294967295;
      const basinChance = 0.16 + (region.isCoastal ? 0.08 : 0) + Math.min(0.08, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 90) * 0.05);
      if (oilSignal < basinChance) {
        const scale = Math.max(1, region.areaSqKm);
        const seep = Math.max(8, Math.round(scale * (0.12 + oilSignal * 0.2)));
        const shallow = Math.round(scale * (18 + oilSignal * 34));
        const deep = Math.round(scale * (70 + oilSignal * 125));
        const tight = Math.round(scale * (90 + oilSignal * 185));
        const offshore = region.isCoastal ? Math.round(scale * (110 + oilSignal * 240)) : 0;
        const tiers = [
          { id: 'seep', label: 'Natural petroleum seeps', initialStock: seep, remainingStock: seep, difficulty: 0.16, requiredTechId: null, maxWorkers: Math.max(2, Math.round(scale * 0.001)) },
          { id: 'shallow_onshore', label: 'Shallow onshore petroleum', initialStock: shallow, remainingStock: shallow, difficulty: 0.34, requiredTechId: 'petroleum_well_drilling', maxWorkers: Math.max(18, Math.round(scale * 0.025)) },
          { id: 'deep_onshore', label: 'Deep onshore petroleum', initialStock: deep, remainingStock: deep, difficulty: 0.5, requiredTechId: 'deep_rotary_drilling', maxWorkers: Math.max(35, Math.round(scale * 0.055)) },
          { id: 'tight', label: 'Tight oil formations', initialStock: tight, remainingStock: tight, difficulty: 0.68, requiredTechId: 'hydraulic_fracturing', maxWorkers: Math.max(45, Math.round(scale * 0.07)) },
        ];
        if (offshore > 0) tiers.push({ id: 'offshore', label: 'Offshore petroleum', initialStock: offshore, remainingStock: offshore, difficulty: 0.72, requiredTechId: 'offshore_drilling', maxWorkers: Math.max(55, Math.round(scale * 0.08)) });
        region.deposits.oil = { tiers };
      }
    }
"""
    s=s.replace(anchor,block+anchor,1)
p.write_text(s)

# Petroleum breakthroughs join the normal technology event pass.
insert_once('js/technology/breakthroughs.js', "from './petroleum.js", 
"import { tickMedievalBreakthroughs } from './medievalTransition.js?v=20260912-medieval1';\n",
"import { tickMedievalBreakthroughs } from './medievalTransition.js?v=20260912-medieval1';\nimport { tickPetroleumBreakthroughs } from './petroleum.js?v=20260917-oil1';\n")
p=Path('js/technology/breakthroughs.js'); s=p.read_text()
if 'tickPetroleumBreakthroughs(regions' not in s:
    s=s.replace('  events.push(...tickMedievalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;',
                '  events.push(...tickMedievalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickPetroleumBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;',1)
p.write_text(s)

# Wellbeing gets benefits only from actually delivered household energy services.
insert_once('js/politics/popularWellbeing.js', 'householdEnergyWellbeing',
"import { enterpriseRegionalConsequences } from '../economy/enterpriseBehaviour.js';\n",
"import { enterpriseRegionalConsequences } from '../economy/enterpriseBehaviour.js';\nimport { householdEnergyWellbeing } from '../economy/householdEnergy.js?v=20260917-oil1';\n")
p=Path('js/politics/popularWellbeing.js'); s=p.read_text()
if 'const energy = householdEnergyWellbeing(region);' not in s:
    s=s.replace('  const enterprise = enterpriseRegionalConsequences(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 - enterprise.prosperityPenalty);',
                '  const enterprise = enterpriseRegionalConsequences(region);\n  const energy = householdEnergyWellbeing(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity - enterprise.prosperityPenalty);',1)
    s=s.replace('  return clamp(0.18 + artistic * 0.58 + gathering);',
                '  const energy = householdEnergyWellbeing(region);\n  return clamp(0.18 + artistic * 0.58 + gathering + energy.culturalAccess);',1)
    s=s.replace('  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty);',
                '  const energy = householdEnergyWellbeing(region);\n  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety);',1)
p.write_text(s)

# Tick household energy after production and before ordinary trade so unmet demand
# participates in the same market that transports every other commodity.
p=Path('js/main.js'); s=p.read_text()
if "./economy/householdEnergy.js" not in s:
    s=s.replace("import { tickTrade } from './economy/trade.js?v=20260912-medieval1';",
                "import { tickTrade } from './economy/trade.js?v=20260912-medieval1';\nimport { tickHouseholdEnergy } from './economy/householdEnergy.js?v=20260917-oil1';",1)
if "tickHouseholdEnergy(region, time.elapsedDays)" not in s:
    matches=list(re.finditer(r"(\n\s*const economyEvents\s*=.*?tickEconomy\([^\n]+\);)",s))
    if matches:
        m=matches[0]; s=s[:m.end()]+"\n    for (const region of regions) tickHouseholdEnergy(region, time.elapsedDays);"+s[m.end():]
    else:
        m=re.search(r"\n(\s*)(?:const\s+\w+\s*=\s*)?(?:profiler\.measure\([^\n]*=>\s*)?tickTrade\(",s)
        if not m: raise RuntimeError('could not locate economy/trade tick integration point')
        s=s[:m.start()]+f"\n{m.group(1)}for (const region of regions) tickHouseholdEnergy(region, time.elapsedDays);"+s[m.start():]
p.write_text(s)

print('oil resource and civilian-use integration applied')
# trigger 2026-09-17T13:50+10
