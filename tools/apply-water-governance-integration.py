from pathlib import Path


def replace_once(path, old, new):
    p=Path(path); text=p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1))

# Physical allocation and groundwater/environmental-flow rules.
p='js/world/waterResources.js'
replace_once(p,
"import { livestockWaterDemand } from '../economy/livestockAgriculture.js?v=20260922-livestock-ext1';",
"import { livestockWaterDemand } from '../economy/livestockAgriculture.js?v=20260922-livestock-ext1';\nimport { allocateWaterByPolicy, finaliseWaterGovernance, governedResidualDemand, groundwaterPolicyMultiplier, prepareWaterGovernance, surfaceWithdrawalPolicyMultiplier } from './waterGovernance.js?v=20260922-water-governance1';")
replace_once(p,
"export function prepareRegionalWaterDemand(region){const s=ensureWaterResources(region);prepareUrbanWater(region);const d=regionalWaterDemand(region);",
"export function prepareRegionalWaterDemand(region){const s=ensureWaterResources(region);prepareUrbanWater(region);prepareWaterGovernance(region);const d=regionalWaterDemand(region);")
replace_once(p,
"return positive(s.surfaceRequest)/rivers;}",
"return positive(s.surfaceRequest)/rivers*surfaceWithdrawalPolicyMultiplier(region);}")
replace_once(p,
"s.surfaceUse=surfaceAvailable;addAllocation(s.allocation,allocateProportionally(s.demand,surfaceAvailable));\n  let residual=residualDemand(s.demand,s.allocation);addAllocation(s.allocation,supplementalUrbanWater(region,residual,elapsedDays));residual=residualDemand(s.demand,s.allocation);",
"s.surfaceUse=surfaceAvailable;addAllocation(s.allocation,allocateWaterByPolicy(region,s.demand,surfaceAvailable,s.allocation));\n  let residual=governedResidualDemand(region,s.demand,s.allocation);addAllocation(s.allocation,supplementalUrbanWater(region,residual,elapsedDays));residual=governedResidualDemand(region,s.demand,s.allocation);")
replace_once(p,
"groundwaterRate=Math.min(residualTotal,pumpRate,storageRateLimit);addAllocation(s.allocation,allocateProportionally(residual,groundwaterRate));",
"groundwaterRate=Math.min(residualTotal,pumpRate*groundwaterPolicyMultiplier(region),storageRateLimit);addAllocation(s.allocation,allocateWaterByPolicy(region,residual,groundwaterRate,s.allocation));")
replace_once(p,
"const urbanWater=finaliseUrbanWater(region,s.allocation,elapsedDays);",
"const urbanWater=finaliseUrbanWater(region,s.allocation,elapsedDays);finaliseWaterGovernance(region,elapsedDays);")

# Water service quality changes how attractive a destination is to migrants.
p='js/society/migration.js'
replace_once(p,
"import { nationalReputationEffects } from '../technology/spaceRace.js?v=20260920-space-race1';",
"import { nationalReputationEffects } from '../technology/spaceRace.js?v=20260920-space-race1';\nimport { waterMigrationPull } from '../world/waterGovernance.js?v=20260922-water-governance1';")
replace_once(p,
"return Math.max(0.01, dest.stability) * landScore * breadScore * reputation.migrationPull;",
"return Math.max(0.01, dest.stability) * landScore * breadScore * reputation.migrationPull * waterMigrationPull(dest);")

# Household water hardship enters the existing wellbeing -> grievance -> revolution chain.
p='js/politics/popularWellbeing.js'
replace_once(p,
"import { institutionalPoliticalVoice } from './institutionalPowers.js?v=20260916-institutions1';",
"import { institutionalPoliticalVoice } from './institutionalPowers.js?v=20260916-institutions1';\nimport { waterGovernanceWellbeing } from '../world/waterGovernance.js?v=20260922-water-governance1';")
replace_once(p,
"  const electricity = electricityWellbeing(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity + electricity.prosperity - enterprise.prosperityPenalty);",
"  const electricity = electricityWellbeing(region);\n  const water = waterGovernanceWellbeing(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity + electricity.prosperity - enterprise.prosperityPenalty - water.prosperityPenalty);")
replace_once(p,
"  const electricity = electricityWellbeing(region);\n  return clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety + electricity.safety);",
"  const electricity = electricityWellbeing(region);\n  const water = waterGovernanceWellbeing(region);\n  return clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety + electricity.safety - water.safetyPenalty);")
replace_once(p,
"  const stability = clamp(region?.stability ?? 0.55);\n  const satisfaction = clamp(prosperity * 0.34 + safety * 0.3 + culture * 0.14 + legitimacy * 0.13 + stability * 0.09);\n  const grievance = clamp((1 - prosperity) * 0.31 + (1 - safety) * 0.31 + (1 - culture) * 0.1 + (1 - legitimacy) * 0.16 + (1 - stability) * 0.12);",
"  const stability = clamp(region?.stability ?? 0.55);\n  const water = waterGovernanceWellbeing(region);\n  const satisfaction = clamp(prosperity * 0.34 + safety * 0.3 + culture * 0.14 + legitimacy * 0.13 + stability * 0.09 - water.grievance * 0.08);\n  const grievance = clamp((1 - prosperity) * 0.31 + (1 - safety) * 0.31 + (1 - culture) * 0.1 + (1 - legitimacy) * 0.16 + (1 - stability) * 0.12 + water.grievance * 0.22);")
replace_once(p,
"  const revolutionaryPressure = clamp(Math.max(0, grievance - 0.38) * 1.35 * (1 - peacefulOutlet * 0.72));",
"  const revolutionaryPressure = clamp(Math.max(0, grievance - 0.38) * 1.35 * (1 - peacefulOutlet * 0.72) + water.revolutionaryPressure * (1 - peacefulOutlet * 0.55));")

# Severe chronic water hardship becomes actual emigration, not just a score.
p='js/society/demographics.js'
replace_once(p,
"import { tickMilitaryFormations } from '../military/formations.js?v=20260907-formations1';",
"import { tickMilitaryFormations } from '../military/formations.js?v=20260907-formations1';\nimport { waterEmigrationAnnualRate } from '../world/waterGovernance.js?v=20260922-water-governance1';")
replace_once(p,
"  measureDetail('Demographics: climate displacement', () => { for (const region of regions) applyClimateDisplacement(region, regionsById, religiousWorld, elapsedDays); });",
"  measureDetail('Demographics: climate displacement', () => { for (const region of regions) applyClimateDisplacement(region, regionsById, religiousWorld, elapsedDays); });\n  measureDetail('Demographics: water hardship migration', () => { for (const region of regions) applyWaterHardshipMigration(region, regionsById, religiousWorld, elapsedDays); });")
anchor="\nexport function removeFromBands(region, count) {"
insert="""
function applyWaterHardshipMigration(region, regionsById, religiousWorld, elapsedDays) {
  const annualRate = waterEmigrationAnnualRate(region);
  if (annualRate <= 0.0005 || region.population <= 0) return;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const desiredEmigrants = Math.min(region.population * 0.055 * years, region.population * annualRate * years);
  if (desiredEmigrants < 5) return;
  const destinations = chooseEmigrationDestinations(region, regionsById, desiredEmigrants);
  const moved = destinations.reduce((sum, route) => sum + route.count, 0);
  if (moved <= 0) return;
  removeFromBands(region, moved);
  for (const { dest, count } of destinations) {
    migrateReligion(region, dest, count, religiousWorld);
    addToBands(dest, count);
    migrateCulture(region, dest, count);
  }
  region.waterGovernance.waterHardshipMigrants = (region.waterGovernance.waterHardshipMigrants || 0) + moved;
  syncPopulation(region);
}
"""
text=Path(p).read_text()
if 'function applyWaterHardshipMigration' not in text:
    if anchor not in text: raise SystemExit('demographics insertion anchor missing')
    Path(p).write_text(text.replace(anchor,'\n'+insert+anchor,1))
