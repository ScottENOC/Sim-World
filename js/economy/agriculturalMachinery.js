const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const TRACTOR_TECH_ID='internal_combustion_tractors';
export const COMBINE_TECH_ID='mechanised_combine_harvesters';
export const TRACTOR_PRODUCT_ID='tractor';
export const COMBINE_PRODUCT_ID='combine_harvester';

const TRACTOR_HECTARES=95;
const COMBINE_HECTARES=240;
const TRACTOR_ANNUAL_WEAR=.055;
const COMBINE_ANNUAL_WEAR=.045;
const FUEL_PER_TRACTOR_YEAR=3.0;
const FUEL_PER_COMBINE_YEAR=4.2;
const MAINTENANCE_COMPONENTS_PER_MACHINE_YEAR=.055;
const MAINTENANCE_STEEL_PER_MACHINE_YEAR=.035;

export function ensureAgriculturalMachinery(region){
  region.agriculturalMachinery||={};
  const s=region.agriculturalMachinery;
  for(const [k,v] of Object.entries({tractors:0,combines:0,serviceableTractors:0,serviceableCombines:0,tractorCoverage:0,combineCoverage:0,landWorkMultiplier:1,harvestRetention:1,fuelSatisfaction:1,maintenanceReadiness:1,lastFuelUse:0,lastMaintenanceComponents:0,lastMaintenanceSteel:0}))if(!Number.isFinite(s[k]))s[k]=v;
  return s;
}

function arableHa(region){return Math.max(0,Number(region.agriculturalLand?.availableArableHa)||0);}

export function agriculturalMachineryTargets(region){
  const land=arableHa(region);
  const tech=region.unlockedTechIds||new Set();
  return {
    tractors:tech.has(TRACTOR_TECH_ID)?land/TRACTOR_HECTARES:0,
    combines:tech.has(COMBINE_TECH_ID)?land/COMBINE_HECTARES:0,
  };
}

export function agriculturalMachineryDemand(region,productId){
  const s=ensureAgriculturalMachinery(region),t=agriculturalMachineryTargets(region);
  if(productId===TRACTOR_PRODUCT_ID)return Math.max(0,t.tractors-s.tractors)*.08;
  if(productId===COMBINE_PRODUCT_ID)return Math.max(0,t.combines-s.combines)*.07;
  return 0;
}

function takeFinished(region,productId,amount){
  const inv=region.industrialSupply?.inventory;if(!inv)return 0;
  const actual=Math.min(Math.max(0,Number(inv[productId])||0),Math.max(0,amount));
  inv[productId]=Math.max(0,(inv[productId]||0)-actual);return actual;
}

function consumeFuel(region,need){
  region.stockpile||={};let left=Math.max(0,need),used=0;
  for(const fuel of ['diesel','petrol']){const take=Math.min(left,Math.max(0,Number(region.stockpile[fuel])||0));region.stockpile[fuel]=Math.max(0,(region.stockpile[fuel]||0)-take);left-=take;used+=take;if(left<=0)break;}
  return {used,satisfaction:need>0?clamp(used/need):1};
}

export function agriculturalMechanisationProfile(region){
  const s=ensureAgriculturalMachinery(region),land=arableHa(region);
  const tractorArea=s.serviceableTractors*TRACTOR_HECTARES;
  const combineArea=s.serviceableCombines*COMBINE_HECTARES;
  const tractorCoverage=land>0?clamp(tractorArea/land):0;
  const combineCoverage=land>0?clamp(combineArea/land):0;
  // Tractors replace human/animal traction rather than raising soil fertility.
  // At full coverage they make one farm worker roughly 5.5x as effective at
  // land work; combines add a further harvest-labour saving and reduce crop
  // left in the field or lost to a slow harvest.
  const landWorkMultiplier=1+tractorCoverage*4.5+combineCoverage*1.25;
  const harvestRetention=1+combineCoverage*.075;
  return {tractorCoverage,combineCoverage,landWorkMultiplier,harvestRetention,tractorAreaHa:Math.min(land,tractorArea),harvestMechanisedAreaHa:Math.min(land,combineArea),fuelSatisfaction:s.fuelSatisfaction,maintenanceReadiness:s.maintenanceReadiness};
}

export function tickAgriculturalMachinery(region,elapsedDays=7){
  const s=ensureAgriculturalMachinery(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const targets=agriculturalMachineryTargets(region);
  s.tractors+=takeFinished(region,TRACTOR_PRODUCT_ID,Math.max(0,targets.tractors-s.tractors));
  s.combines+=takeFinished(region,COMBINE_PRODUCT_ID,Math.max(0,targets.combines-s.combines));

  const fleet=Math.max(0,s.tractors+s.combines);
  const componentNeed=fleet*MAINTENANCE_COMPONENTS_PER_MACHINE_YEAR*years;
  const steelNeed=fleet*MAINTENANCE_STEEL_PER_MACHINE_YEAR*years;
  const inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  const maintenance=Math.min(1,(inv.machine_components||0)/Math.max(.0001,componentNeed),(region.stockpile.steel||0)/Math.max(.0001,steelNeed));
  const usedComponents=componentNeed*maintenance,usedSteel=steelNeed*maintenance;
  inv.machine_components=Math.max(0,(inv.machine_components||0)-usedComponents);region.stockpile.steel=Math.max(0,(region.stockpile.steel||0)-usedSteel);
  s.maintenanceReadiness=clamp(.45+maintenance*.55);

  const tractorFuel=s.tractors*FUEL_PER_TRACTOR_YEAR*years,combineFuel=s.combines*FUEL_PER_COMBINE_YEAR*years;
  const fuel=consumeFuel(region,tractorFuel+combineFuel);s.fuelSatisfaction=fuel.satisfaction;s.lastFuelUse=fuel.used;
  const service=clamp(s.maintenanceReadiness*.62+s.fuelSatisfaction*.38);
  s.serviceableTractors=s.tractors*service;s.serviceableCombines=s.combines*service;

  const tractorLoss=1-Math.pow(1-TRACTOR_ANNUAL_WEAR*(1.35-.35*s.maintenanceReadiness),years);
  const combineLoss=1-Math.pow(1-COMBINE_ANNUAL_WEAR*(1.35-.35*s.maintenanceReadiness),years);
  s.tractors=Math.max(0,s.tractors*(1-tractorLoss));s.combines=Math.max(0,s.combines*(1-combineLoss));
  s.lastMaintenanceComponents=usedComponents;s.lastMaintenanceSteel=usedSteel;

  Object.assign(s,agriculturalMechanisationProfile(region));
  region.report||={};region.report.agriculturalMachinery={workers:0,tractors:s.tractors,combines:s.combines,serviceableTractors:s.serviceableTractors,serviceableCombines:s.serviceableCombines,tractorCoverage:s.tractorCoverage,combineCoverage:s.combineCoverage,landWorkMultiplier:s.landWorkMultiplier,harvestRetention:s.harvestRetention,fuelSatisfaction:s.fuelSatisfaction,maintenanceReadiness:s.maintenanceReadiness,lastFuelUse:s.lastFuelUse};
  return s;
}
