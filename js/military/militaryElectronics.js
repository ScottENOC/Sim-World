const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const MILITARY_PLATFORM=Object.freeze({
  TANK:'tank',SELF_PROPELLED_GUN:'self_propelled_gun',ARTILLERY:'artillery',AIRCRAFT:'aircraft',WARSHIP:'warship',
});

export const DEPLOYED_BASE_SERVICES=Object.freeze({
  HEADQUARTERS:'headquarters',RADIO:'radio',TELEPHONE:'telephone',RADAR:'radar',WORKSHOP:'workshop',REFRIGERATION:'refrigeration',MEDICAL:'medical',COMPUTING:'computing',
});

const BASE_SERVICE_LOAD=Object.freeze({
  headquarters:0,radio:.10,telephone:.04,radar:.34,workshop:.24,refrigeration:.13,medical:.08,computing:.22,
});

function has(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function components(region){return region?.industrialPlants?.componentCapability||{};}

export function computationalCapability(region){
  const c=region?.computingIndustry;if(!c)return 0;
  const node=Math.max(5,Math.min(10000,Number(c.design?.bestNodeNm)||10000));
  const nodeProgress=clamp(Math.log(10000/node)/Math.log(2000));
  const design=clamp(c.design?.complexity||0),designExp=clamp(c.experience?.chip_design||0),packaging=clamp(c.experience?.packaging_test||0),assembly=clamp(c.experience?.computer_assembly||0);
  return clamp(nodeProgress*.46+design*.22+designExp*.16+packaging*.09+assembly*.07);
}

export function onboardElectricalCapability(region,platform=MILITARY_PLATFORM.TANK){
  const c=components(region),precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),electronics=clamp(c.electronics||0);
  const primeMover=platform===MILITARY_PLATFORM.AIRCRAFT?clamp(c.aircraft_engine||c.engine||0):clamp(c.engine||0);
  const industrialElectricity=has(region,'electrical_generation')||has(region,'industrial_electrification');
  const raw=clamp(electronics*.42+precision*.20+primeMover*.18+clamp(region?.electricity?.industrialService||0)*.08+clamp(c.radio_navigation||0)*.05+clamp(c.radar_set||0)*.07);
  return industrialElectricity?raw:Math.min(.18,raw*.45);
}

export function portableDieselGeneratorFrontier(region){
  const c=components(region),precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),engine=clamp(c.engine||0),electronics=clamp(c.electronics||0);
  const refining=has(region,'petroleum_refining');
  const electrical=has(region,'electrical_generation')||has(region,'industrial_electrification');
  const capability=refining&&electrical?clamp(engine*.38+precision*.30+electronics*.24+clamp(region?.electricity?.industrialService||0)*.08):0;
  return {available:capability>=.22,capability,outputPerGenerator:capability>=.22?.18+capability*.82:0,dieselPerGeneratorWeek:capability>=.22?.06+.05*(1-capability):0,reliability:clamp(.38+capability*.58)};
}

export function ensureFieldPower(base){
  base.fieldPower||={generatorCount:0,requestedLoad:0,availablePower:0,reliability:0,dieselUsedLastWeek:0,gridTrusted:false,status:'unpowered'};
  return base.fieldPower;
}

export function ensureDeployedBase(base){
  base.services||={headquarters:true};
  if(base.services.headquarters===undefined)base.services.headquarters=true;
  base.servicePower||={};
  return base;
}

export function deployedBaseElectricalDemand(base){
  ensureDeployedBase(base);let total=0;
  for(const [service,enabled] of Object.entries(base.services||{}))if(enabled)total+=BASE_SERVICE_LOAD[service]||0;
  return total;
}

export function deployedBaseCapabilityProfile(base,fieldPower=null){
  ensureDeployedBase(base);const power=fieldPower||ensureFieldPower(base),demand=Math.max(0,deployedBaseElectricalDemand(base));
  const coverage=demand>0?clamp((power.availablePower||0)/demand):1;
  const reliability=demand>0?clamp(power.reliability||0):1;
  const powered=clamp(coverage*reliability);
  const s=base.services||{};
  // Headquarters are timeless. Electricity improves only the optional powered services attached to them.
  const commandMultiplier=1+(s.radio?.055:0)*powered+(s.telephone?.035:0)*powered+(s.computing?.10:0)*powered;
  const detectionMultiplier=1+(s.radar?.24:0)*powered+(s.radio?.025:0)*powered+(s.computing?.045:0)*powered;
  const maintenanceMultiplier=1+(s.workshop?.14:0)*powered+(s.computing?.035:0)*powered;
  const medicalMultiplier=1+(s.medical?.055:0)*powered+(s.refrigeration?.035:0)*powered;
  const logisticsMultiplier=1+(s.refrigeration?.045:0)*powered+(s.computing?.055:0)*powered+(s.radio?.025:0)*powered;
  return {demand,coverage,reliability,poweredFraction:powered,commandMultiplier,detectionMultiplier,maintenanceMultiplier,medicalMultiplier,logisticsMultiplier};
}

export function inferDeployedBaseServices(region,{headquarters=true}={}){
  const c=components(region),compute=computationalCapability(region);
  return {
    headquarters,
    radio:clamp(c.radio_navigation||c.electronics||0)>.18,
    telephone:clamp(region?.telephone?.service||region?.telephone?.militaryCoordination||0)>.10,
    radar:has(region,'radar')&&clamp(c.radar_set||0)>.12,
    workshop:clamp(region?.industrialSupply?.capability?.precision_machining||0)>.18,
    refrigeration:has(region,'petroleum_refining')&&clamp(c.engine||0)>.22&&clamp(c.electronics||0)>.10,
    medical:clamp(region?.medicalProgress?.militaryMedicine||region?.medicalProgress?.careCapacity||0)>.12,
    computing:compute>.12,
  };
}

export function installFieldDieselGenerators(base,region,count=1){
  const frontier=portableDieselGeneratorFrontier(region),state=ensureFieldPower(base),n=Math.max(0,Math.floor(Number(count)||0));
  if(!frontier.available||n<=0)return {installed:0,reason:'generator_industry_unavailable',state};
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.stockpile||={};
  const machinePer=.55,copperPer=.10,electronicsPer=.08;
  const possible=Math.min(n,Math.floor((region.industrialSupply.inventory.machine_components||0)/machinePer),Math.floor((region.stockpile.copper||0)/copperPer),Math.floor((region.stockpile.electronic_components||0)/electronicsPer));
  if(possible<=0)return {installed:0,reason:'generator_components_shortage',state};
  region.industrialSupply.inventory.machine_components-=possible*machinePer;region.stockpile.copper-=possible*copperPer;region.stockpile.electronic_components-=possible*electronicsPer;
  state.generatorCount+=possible;return {installed:possible,state};
}

export function tickFieldPower(base,sourceRegion,{requestedLoad=0,gridAvailable=false,gridTrusted=false,weeks=1}={}){
  const state=ensureFieldPower(base),frontier=portableDieselGeneratorFrontier(sourceRegion),duration=Math.max(0,Number(weeks)||0);
  state.requestedLoad=Math.max(0,Number(requestedLoad)||0);state.gridTrusted=Boolean(gridAvailable&&gridTrusted);state.dieselUsedLastWeek=0;
  if(state.requestedLoad<=0){state.availablePower=0;state.reliability=1;state.status='no_power_required';return state;}
  if(state.gridTrusted){state.availablePower=state.requestedLoad;state.reliability=clamp(sourceRegion?.electricity?.reliability??.85);state.status='trusted_grid';return state;}
  const gross=state.generatorCount*frontier.outputPerGenerator*frontier.reliability;
  const needed=Math.min(state.requestedLoad,gross),dieselNeed=frontier.outputPerGenerator>0?needed/frontier.outputPerGenerator*frontier.dieselPerGeneratorWeek*duration:0;
  sourceRegion.stockpile||={};const diesel=Math.max(0,Number(sourceRegion.stockpile.diesel)||0),fuelFraction=dieselNeed>0?clamp(diesel/dieselNeed):1;
  const supplied=needed*fuelFraction;state.dieselUsedLastWeek=Math.min(diesel,dieselNeed);sourceRegion.stockpile.diesel=diesel-state.dieselUsedLastWeek;
  state.availablePower=supplied;state.reliability=state.requestedLoad>0?clamp((supplied/state.requestedLoad)*frontier.reliability):frontier.reliability;
  state.status=state.generatorCount<=0?'unpowered':fuelFraction<.15?'fuel_exhausted':supplied+1e-6<state.requestedLoad?'generator_limited':'generator_powered';
  return state;
}

export function tickDeployedBasePower(base,sourceRegion,{gridAvailable=false,gridTrusted=false,weeks=1}={}){
  ensureDeployedBase(base);const requestedLoad=deployedBaseElectricalDemand(base);
  const fieldPower=tickFieldPower(base,sourceRegion,{requestedLoad,gridAvailable,gridTrusted,weeks});
  const capability=deployedBaseCapabilityProfile(base,fieldPower);base.lastCapability={...capability};return {fieldPower,capability};
}

export function platformElectronicsFrontier(region,platform,{radarCapability=0,fireControlBase=0}={}){
  const c=components(region),compute=computationalCapability(region),power=onboardElectricalCapability(region,platform),electronics=clamp(c.electronics||0),optics=clamp(c.optics||0),radar=clamp(radarCapability||0);
  const poweredControls=power>=.20&&electronics>=.16;
  const poweredFireControl=poweredControls&&power>=.27;
  const computerisedFireControl=compute>=.18&&power>=.30&&electronics>=.28;
  const digitalBallistics=compute>=.30&&power>=.36&&optics>=.26;
  const stabilisedGun=['tank','self_propelled_gun'].includes(platform)&&poweredControls&&power>=.34&&optics>=.24;
  const crossCountryStabilisation=stabilisedGun&&compute>=.42&&power>=.46&&electronics>=.46;
  const radarProcessing=['aircraft','warship'].includes(platform)&&radar>.05&&power>=.32;
  const digitalRadarProcessing=radarProcessing&&compute>=.34&&power>=.42;
  const sensorFusion=['aircraft','warship'].includes(platform)&&compute>=.62&&power>=.56&&radar>.28;
  const guidedWeaponControl=['aircraft','warship'].includes(platform)&&compute>=.52&&power>=.50&&electronics>=.52;
  const digitalFireDirection=platform==='artillery'&&compute>=.28&&power>=.26;
  const capabilities={poweredControls,poweredFireControl,computerisedFireControl,digitalBallistics,stabilisedGun,crossCountryStabilisation,radarProcessing,digitalRadarProcessing,sensorFusion,guidedWeaponControl,digitalFireDirection};
  const digitalCount=Object.values({computerisedFireControl,digitalBallistics,crossCountryStabilisation,digitalRadarProcessing,sensorFusion,guidedWeaponControl,digitalFireDirection}).filter(Boolean).length;
  const poweredCount=Object.values(capabilities).filter(Boolean).length-digitalCount;
  const systemInputs={};
  if(poweredCount||digitalCount){systemInputs.electronic_components=.018+poweredCount*.012+digitalCount*.010;systemInputs.copper=.010+poweredCount*.006+digitalCount*.004;systemInputs.industrial_polymers=.006+poweredCount*.004+digitalCount*.005;}
  if(digitalCount)systemInputs.packaged_chips=.010+digitalCount*.014+compute*.018;
  const fireControlGain=clamp((poweredFireControl?.05:0)+(computerisedFireControl?.08:0)+(digitalBallistics?.10:0)+(crossCountryStabilisation?.13:0)+(digitalFireDirection?.12:0));
  const mobileFireGain=clamp((stabilisedGun?.08:0)+(crossCountryStabilisation?.18:0));
  const sensorGain=clamp((radarProcessing?.06:0)+(digitalRadarProcessing?.10:0)+(sensorFusion?.16:0));
  return {platform,compute,power,electronics,capabilities,systemInputs,fireControlGain,mobileFireGain,sensorGain,fireControl:clamp(fireControlBase+fireControlGain)};
}

export function productionAmountForSystemInputs(stock,inputs,requested){
  let amount=Math.max(0,Number(requested)||0);for(const [key,per] of Object.entries(inputs||{}))amount=Math.min(amount,Math.max(0,Number(stock?.[key])||0)/Math.max(.000001,per));return Math.max(0,amount);
}

export function consumeSystemInputs(stock,inputs,amount){
  const actual=Math.max(0,Number(amount)||0);for(const [key,per] of Object.entries(inputs||{}))stock[key]=Math.max(0,(Number(stock[key])||0)-per*actual);return actual;
}
