import { addProductionLine, ensureIndustrialPlantState, industrialFactoryCapacity } from './industrialPlant.js?v=20260921-farm-machinery1';
import { consumeTransportFuel } from './energyTransition.js?v=20260923-energy-transition1';

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

// Farm machinery deliberately reuses the same engine, transmission and chassis
// components as road vehicles. Those components are produced and learned in
// industrialPlant.js, so automobile manufacturing transfers real know-how to
// tractors without making the products identical.
export const AGRICULTURAL_MACHINE_RECIPES=Object.freeze({
  [TRACTOR_PRODUCT_ID]:{engine:1.10,transmission:1.15,wheeled_chassis:1.05,hull_fabrication:.45,machine_components:.32,steel:.42},
  [COMBINE_PRODUCT_ID]:{engine:1.25,transmission:1.20,wheeled_chassis:1.35,hull_fabrication:.90,machine_components:.95,steel:1.10},
});
const SHARED_COMPONENTS=new Set(['engine','transmission','wheeled_chassis','hull_fabrication']);

export function ensureAgriculturalMachinery(region){
  region.agriculturalMachinery||={};
  const s=region.agriculturalMachinery;
  for(const [k,v] of Object.entries({tractors:0,combines:0,serviceableTractors:0,serviceableCombines:0,tractorCoverage:0,combineCoverage:0,landWorkMultiplier:1,harvestRetention:1,fuelSatisfaction:1,maintenanceReadiness:1,lastFuelUse:0,lastHydrogenUse:0,lastMaintenanceComponents:0,lastMaintenanceSteel:0,tractorExperience:0,combineExperience:0,lastTractorsBuilt:0,lastCombinesBuilt:0}))if(!Number.isFinite(s[k]))s[k]=v;
  return s;
}

function arableHa(region){return Math.max(0,Number(region.agriculturalLand?.availableArableHa)||0);}

export function agriculturalMachineryTargets(region){
  const land=arableHa(region),tech=region.unlockedTechIds||new Set();
  return {tractors:tech.has(TRACTOR_TECH_ID)?land/TRACTOR_HECTARES:0,combines:tech.has(COMBINE_TECH_ID)?land/COMBINE_HECTARES:0};
}

export function agriculturalMachineryDemand(region,productId){
  const s=ensureAgriculturalMachinery(region),t=agriculturalMachineryTargets(region);
  if(productId===TRACTOR_PRODUCT_ID)return Math.max(0,t.tractors-s.tractors);
  if(productId===COMBINE_PRODUCT_ID)return Math.max(0,t.combines-s.combines);
  return 0;
}

function lineFor(plant,productId){return plant.lines.find(l=>l.productId===productId&&l.status!=='closed_no_factory');}
function ensureComponentDemand(region,productId,demand){
  const plant=ensureIndustrialPlantState(region),recipe=AGRICULTURAL_MACHINE_RECIPES[productId]||{};
  region.industrialOrders||={};
  for(const [component,per] of Object.entries(recipe)){
    if(!SHARED_COMPONENTS.has(component))continue;
    const need=Math.max(0,demand*per-(plant.componentInventory[component]||0));
    if(need<=0)continue;
    const key=`component:${component}`;region.industrialOrders[key]=Math.max(region.industrialOrders[key]||0,need);
    if(!lineFor(plant,key)&&industrialFactoryCapacity(region)>0&&plant.lines.length<24)addProductionLine(region,{productId:key,capacityShare:.14});
  }
}

function componentAssemblyCapability(region,productId){
  const plant=ensureIndustrialPlantState(region),recipe=AGRICULTURAL_MACHINE_RECIPES[productId]||{};
  let weighted=0,total=0;
  for(const [component,weight] of Object.entries(recipe)){
    if(!SHARED_COMPONENTS.has(component))continue;
    weighted+=clamp(plant.componentCapability[component]||0)*weight;total+=weight;
  }
  const own=productId===TRACTOR_PRODUCT_ID?ensureAgriculturalMachinery(region).tractorExperience:ensureAgriculturalMachinery(region).combineExperience;
  return clamp((total?weighted/total:0)*.84+own*.16);
}

export function agriculturalMachineCapability(region,productId){return componentAssemblyCapability(region,productId);}

function assembleMachines(region,productId,requested,elapsedDays){
  const plant=ensureIndustrialPlantState(region),recipe=AGRICULTURAL_MACHINE_RECIPES[productId],s=ensureAgriculturalMachinery(region);
  if(!recipe||requested<=0||industrialFactoryCapacity(region)<=0)return 0;
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const experience=productId===TRACTOR_PRODUCT_ID?s.tractorExperience:s.combineExperience;
  const capability=componentAssemblyCapability(region,productId);
  const assemblyCap=industrialFactoryCapacity(region)*Math.max(.06,.12+.18*capability+.10*experience)*years;
  let actual=Math.min(requested,assemblyCap);
  for(const [component,per] of Object.entries(recipe)){
    const store=SHARED_COMPONENTS.has(component)?plant.componentInventory:component==='machine_components'?region.industrialSupply?.inventory:region.stockpile;
    actual=Math.min(actual,Math.max(0,Number(store?.[component])||0)/Math.max(.0001,per));
  }
  actual=Math.max(0,actual);
  for(const [component,per] of Object.entries(recipe)){
    const store=SHARED_COMPONENTS.has(component)?plant.componentInventory:component==='machine_components'?region.industrialSupply.inventory:region.stockpile;
    store[component]=Math.max(0,(store[component]||0)-per*actual);
  }
  if(actual>0){
    const intensity=clamp(actual/Math.max(.001,assemblyCap));
    for(const component of SHARED_COMPONENTS){if(!(component in recipe))continue;plant.componentCapability[component]=clamp((plant.componentCapability[component]||0)+.0014*intensity*(1-(plant.componentCapability[component]||0)));}
    if(productId===TRACTOR_PRODUCT_ID){s.tractors+=actual;s.tractorExperience=clamp(s.tractorExperience+.004*intensity*(1-s.tractorExperience));}
    else{s.combines+=actual;s.combineExperience=clamp(s.combineExperience+.004*intensity*(1-s.combineExperience));}
    plant.productExperience[productId]=clamp((plant.productExperience[productId]||0)+.0035*intensity*(1-(plant.productExperience[productId]||0)));
  }
  return actual;
}

function consumeFuel(region,need){
  region.stockpile||={};
  const diesel=consumeTransportFuel(region,'diesel',Math.max(0,need));
  let fulfilled=diesel.fulfilled, fossilUsed=diesel.fossilUsed, hydrogenUsed=diesel.hydrogenUsed;
  if(diesel.shortfall>0){
    const petrol=consumeTransportFuel(region,'petrol',diesel.shortfall,{targetHydrogenShare:0});
    fulfilled+=petrol.fulfilled;fossilUsed+=petrol.fossilUsed;hydrogenUsed+=petrol.hydrogenUsed;
  }
  return {used:fulfilled,fossilUsed,hydrogenUsed,satisfaction:need>0?clamp(fulfilled/need):1};
}

export function agriculturalMechanisationProfile(region){
  const s=ensureAgriculturalMachinery(region),land=arableHa(region);
  const tractorArea=s.serviceableTractors*TRACTOR_HECTARES,combineArea=s.serviceableCombines*COMBINE_HECTARES;
  const tractorCoverage=land>0?clamp(tractorArea/land):0,combineCoverage=land>0?clamp(combineArea/land):0;
  const landWorkMultiplier=1+tractorCoverage*4.5+combineCoverage*1.25;
  const harvestRetention=1+combineCoverage*.075;
  return {tractorCoverage,combineCoverage,landWorkMultiplier,harvestRetention,tractorAreaHa:Math.min(land,tractorArea),harvestMechanisedAreaHa:Math.min(land,combineArea),fuelSatisfaction:s.fuelSatisfaction,maintenanceReadiness:s.maintenanceReadiness};
}

export function tickAgriculturalMachinery(region,elapsedDays=7){
  const s=ensureAgriculturalMachinery(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,targets=agriculturalMachineryTargets(region);
  const tractorGap=Math.max(0,targets.tractors-s.tractors),combineGap=Math.max(0,targets.combines-s.combines);
  ensureComponentDemand(region,TRACTOR_PRODUCT_ID,Math.min(tractorGap,Math.max(1,tractorGap*.10)));
  ensureComponentDemand(region,COMBINE_PRODUCT_ID,Math.min(combineGap,Math.max(1,combineGap*.10)));
  s.lastTractorsBuilt=assembleMachines(region,TRACTOR_PRODUCT_ID,tractorGap,elapsedDays);
  s.lastCombinesBuilt=assembleMachines(region,COMBINE_PRODUCT_ID,combineGap,elapsedDays);

  const fleet=Math.max(0,s.tractors+s.combines),componentNeed=fleet*MAINTENANCE_COMPONENTS_PER_MACHINE_YEAR*years,steelNeed=fleet*MAINTENANCE_STEEL_PER_MACHINE_YEAR*years;
  const inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  const maintenance=Math.min(1,(inv.machine_components||0)/Math.max(.0001,componentNeed),(region.stockpile.steel||0)/Math.max(.0001,steelNeed));
  const usedComponents=componentNeed*maintenance,usedSteel=steelNeed*maintenance;
  inv.machine_components=Math.max(0,(inv.machine_components||0)-usedComponents);region.stockpile.steel=Math.max(0,(region.stockpile.steel||0)-usedSteel);s.maintenanceReadiness=clamp(.45+maintenance*.55);

  const fuelNeed=(s.tractors*FUEL_PER_TRACTOR_YEAR+s.combines*FUEL_PER_COMBINE_YEAR)*years,fuel=consumeFuel(region,fuelNeed);s.fuelSatisfaction=fuel.satisfaction;s.lastFuelUse=fuel.used;s.lastHydrogenUse=fuel.hydrogenUsed;
  const service=clamp(s.maintenanceReadiness*.62+s.fuelSatisfaction*.38);s.serviceableTractors=s.tractors*service;s.serviceableCombines=s.combines*service;

  const tractorLoss=1-Math.pow(1-TRACTOR_ANNUAL_WEAR*(1.35-.35*s.maintenanceReadiness),years),combineLoss=1-Math.pow(1-COMBINE_ANNUAL_WEAR*(1.35-.35*s.maintenanceReadiness),years);
  s.tractors=Math.max(0,s.tractors*(1-tractorLoss));s.combines=Math.max(0,s.combines*(1-combineLoss));s.lastMaintenanceComponents=usedComponents;s.lastMaintenanceSteel=usedSteel;
  Object.assign(s,agriculturalMechanisationProfile(region));
  region.report||={};region.report.agriculturalMachinery={workers:0,tractors:s.tractors,combines:s.combines,serviceableTractors:s.serviceableTractors,serviceableCombines:s.serviceableCombines,tractorCoverage:s.tractorCoverage,combineCoverage:s.combineCoverage,landWorkMultiplier:s.landWorkMultiplier,harvestRetention:s.harvestRetention,fuelSatisfaction:s.fuelSatisfaction,maintenanceReadiness:s.maintenanceReadiness,lastFuelUse:s.lastFuelUse,lastHydrogenUse:s.lastHydrogenUse,lastTractorsBuilt:s.lastTractorsBuilt,lastCombinesBuilt:s.lastCombinesBuilt,tractorCapability:componentAssemblyCapability(region,TRACTOR_PRODUCT_ID),combineCapability:componentAssemblyCapability(region,COMBINE_PRODUCT_ID)};
  return s;
}
