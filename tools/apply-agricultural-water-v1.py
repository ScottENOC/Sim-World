from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def patch(path, old, new):
    p=ROOT/path
    text=p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:80]}')
    p.write_text(text.replace(old,new,1))
    return True

patch(Path('js/economy/laborCore.js'),
"import { applyFoodPreservation, tickFoodLuxuries } from './foodLuxuries.js?v=20260913-food-luxuries1';\n",
"import { applyFoodPreservation, tickFoodLuxuries } from './foodLuxuries.js?v=20260913-food-luxuries1';\nimport { agriculturalWaterProfile } from './agriculturalWater.js?v=20260914-water3';\n")

old="""  const irrigation = effectiveInfrastructureCount(region, 'irrigation');
  const canal = effectiveInfrastructureCount(region, 'canal');
  const waterYieldMultiplier = 1 + Math.min(0.32, irrigation * 0.2 + canal * 0.12);
  const droughtProtection = 1 + Math.max(0, 1 - weatherMultiplier) * Math.min(0.55,
    effectiveInfrastructureCount(region, 'wells_cisterns') * 0.18 + irrigation * 0.25 + canal * 0.12);
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise *
    (1 - horseReport.pastureFraction) * seasonalMultiplier * weatherMultiplier * droughtProtection *
    toolYieldMultiplier * resourceAccess * waterYieldMultiplier;
"""
new="""  const agriculturalWater = agriculturalWaterProfile(region, { weatherMultiplier });
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise *
    (1 - horseReport.pastureFraction) * seasonalMultiplier * weatherMultiplier * agriculturalWater.droughtProtection *
    toolYieldMultiplier * resourceAccess * agriculturalWater.yieldMultiplier;
"""
patch(Path('js/economy/laborCore.js'),old,new)
patch(Path('js/economy/laborCore.js'),
"""  report.farming = { workers: Math.round(farmers), food: foodFromFarming,
    seasonalMultiplier, weatherMultiplier };
""",
"""  report.farming = { workers: Math.round(farmers), food: foodFromFarming,
    seasonalMultiplier, weatherMultiplier, water: agriculturalWater };
""")

# Hydrology must be current before food production. Construction changes take
# effect next tick, which is consistent with all other completed infrastructure.
main=ROOT/'js/main.js'
text=main.read_text()
old_line="    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));\n"
hydro_line="    const waterEvents = profiler.measure('Hydrology', () => tickActiveHydrology(regions, time.endDay, time.elapsedDays));\n"
if hydro_line in text:
    text=text.replace(hydro_line,'',1)
if "    const waterEvents = profiler.measure('Hydrology'" not in text.split(old_line)[0] if old_line in text else True:
    if old_line not in text: raise RuntimeError('economy tick pattern not found')
    text=text.replace(old_line,hydro_line+old_line,1)
main.write_text(text)

# Expose managed releases so agriculture can distinguish stored/released water
# from raw natural inflow without coupling to reservoir internals.
h=ROOT/'js/world/hydrology.js'
text=h.read_text()
text=text.replace("h.report = { surfaceInflow: 0, surfaceOutflow: 0, surfaceWithdrawal: 0, waterHealthRisk: 0, riverCount: 0 };",
                  "h.report = { surfaceInflow: 0, surfaceOutflow: 0, surfaceWithdrawal: 0, managedRelease: 0, waterHealthRisk: 0, riverCount: 0 };")
text=text.replace("      h.report.surfaceWithdrawal += withdrawal;\n", "      h.report.surfaceWithdrawal += withdrawal;\n      h.report.managedRelease += Math.max(0, -regulated.storageChange);\n")
h.write_text(text)
print('agricultural water integration applied')
