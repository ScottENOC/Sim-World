from pathlib import Path

def apply(path,replacements):
    p=Path(path); text=p.read_text(); changed=False
    for old,new in replacements:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
        text=text.replace(old,new,1); changed=True
    if changed:p.write_text(text)

apply('js/technology/breakthroughs.js',[
("import { tickMedicalBreakthroughs } from './medicalProgress.js?v=20260918-medical1';",
 "import { tickMedicalBreakthroughs } from './medicalProgress.js?v=20260918-medical1';\nimport { tickIndustrialProductionBreakthroughs } from './industrialProduction.js?v=20260919-industrial-production1';"),
("  events.push(...tickMedicalBreakthroughs(regions, currentTick, rng, elapsedDays));",
 "  events.push(...tickMedicalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickIndustrialProductionBreakthroughs(regions, currentTick, rng, elapsedDays));")
])

apply('js/economy/industrialSupply.js',[
("import { foreignMarketAccess } from './infrastructureInvestment.js';",
 "import { foreignMarketAccess } from './infrastructureInvestment.js';\nimport { AUTOMOBILE_TECH_ID, industrialProductionMultipliers } from '../technology/industrialProduction.js?v=20260919-industrial-production1';"),
("  rail_stock: { inputs: { steel: 2.2, wood: 1.1 }, capability: 'rail_vehicle_manufacture' },",
 "  rail_stock: { inputs: { steel: 2.2, wood: 1.1 }, capability: 'rail_vehicle_manufacture' },\n  motor_vehicle: { inputs: { steel: 2.8, machine_components: 1.4 }, capability: 'automotive_engineering' },"),
("const CAPABILITY_KEYS = ['steelmaking', 'precision_machining', 'locomotive_engineering', 'rail_vehicle_manufacture', 'railway_engineering'];",
 "const CAPABILITY_KEYS = ['steelmaking', 'precision_machining', 'locomotive_engineering', 'rail_vehicle_manufacture', 'railway_engineering', 'automotive_engineering'];"),
("  const targets = { steelmaking: clamp(base * 0.72 + ironPractice * 0.12 + coalPractice * 0.16), precision_machining: clamp(base * 0.78 + s.capability.steelmaking * 0.22), locomotive_engineering: clamp(base * 0.5 + s.capability.precision_machining * 0.3 + s.exposure.locomotive_engineering * 0.2), rail_vehicle_manufacture: clamp(base * 0.6 + s.capability.steelmaking * 0.25 + s.exposure.rail_vehicle_manufacture * 0.15), railway_engineering: clamp(base * 0.45 + s.capability.precision_machining * 0.2 + s.exposure.railway_engineering * 0.35) };",
 "  const targets = { steelmaking: clamp(base * 0.72 + ironPractice * 0.12 + coalPractice * 0.16), precision_machining: clamp(base * 0.78 + s.capability.steelmaking * 0.22), locomotive_engineering: clamp(base * 0.5 + s.capability.precision_machining * 0.3 + s.exposure.locomotive_engineering * 0.2), rail_vehicle_manufacture: clamp(base * 0.6 + s.capability.steelmaking * 0.25 + s.exposure.rail_vehicle_manufacture * 0.15), railway_engineering: clamp(base * 0.45 + s.capability.precision_machining * 0.2 + s.exposure.railway_engineering * 0.35), automotive_engineering: region.unlockedTechIds?.has(AUTOMOBILE_TECH_ID) ? clamp(base * 0.50 + s.capability.precision_machining * 0.35 + s.exposure.automotive_engineering * 0.15) : 0 };"),
("  const electric = electricityIndustrialMultiplier(region); const communications = telephoneIndustrialMultiplier(region); const labour = clamp(region.labourRelations?.outputMultiplier ?? 1, .45, 1);",
 "  const electric = electricityIndustrialMultiplier(region); const communications = telephoneIndustrialMultiplier(region); const labour = clamp(region.labourRelations?.outputMultiplier ?? 1, .45, 1); const production = industrialProductionMultipliers(region);"),
("s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric * communications * labour); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric * communications * labour); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric * communications * labour); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric * communications * labour); return s;",
 "s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric * communications * labour * production.standardisedGoods); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric * communications * labour * production.machinery); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric * communications * labour * production.standardisedGoods); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric * communications * labour * production.standardisedGoods); s.outputCapacity.motor_vehicle = region.unlockedTechIds?.has(AUTOMOBILE_TECH_ID) ? Math.max(0, base * s.capability.automotive_engineering * 12 * electric * communications * labour * production.standardisedGoods) : 0; return s;")
])
print('industrial production integration applied')
