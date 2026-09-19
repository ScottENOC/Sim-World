from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def rep(path,old,new):
    p=ROOT/path;text=p.read_text()
    if new in text:return
    if old not in text:raise SystemExit(f'marker missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old,new,1))

rep('js/technology/breakthroughs.js',
"import { tickNuclearDeterrence } from '../diplomacy/nuclearDeterrence.js?v=20260920-nuclear-deterrence1';",
"import { tickNuclearDeterrence } from '../diplomacy/nuclearDeterrence.js?v=20260920-nuclear-deterrence1';\nimport { tickStrategicDeliveryBreakthroughs, tickStrategicDelivery } from '../military/strategicDelivery.js?v=20260920-strategic-delivery1';")
rep('js/technology/breakthroughs.js',
"  events.push(...tickNuclearWeaponisationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  for (const region of regions) events.push(...tickNuclearWeaponProgramme(region, currentTick, elapsedDays, rng));\n  events.push(...tickNuclearDeterrence(regions, currentTick, elapsedDays));",
"  events.push(...tickNuclearWeaponisationBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickStrategicDeliveryBreakthroughs(regions, currentTick, rng, elapsedDays));\n  for (const region of regions) events.push(...tickNuclearWeaponProgramme(region, currentTick, elapsedDays, rng));\n  events.push(...tickStrategicDelivery(regions, currentTick, elapsedDays));\n  events.push(...tickNuclearDeterrence(regions, currentTick, elapsedDays));")

print('strategic delivery and second-strike integration applied')
