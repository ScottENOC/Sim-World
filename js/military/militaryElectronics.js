const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const MILITARY_PLATFORM=Object.freeze({
  TANK:'tank',SELF_PROPELLED_GUN:'self_propelled_gun',ARTILLERY:'artillery',AIRCRAFT:'aircraft',WARSHIP:'warship',
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
  if(poweredCount||digitalCount){
    systemInputs.electronic_components=.018+poweredCount*.012+digitalCount*.010;
    systemInputs.copper=.010+poweredCount*.006+digitalCount*.004;
    systemInputs.industrial_polymers=.006+poweredCount*.004+digitalCount*.005;
  }
  if(digitalCount)systemInputs.packaged_chips=.010+digitalCount*.014+compute*.018;
  const fireControlGain=clamp((poweredFireControl?.05:0)+(computerisedFireControl?.08:0)+(digitalBallistics?.10:0)+(crossCountryStabilisation?.13:0)+(digitalFireDirection?.12:0));
  const mobileFireGain=clamp((stabilisedGun?.08:0)+(crossCountryStabilisation?.18:0));
  const sensorGain=clamp((radarProcessing?.06:0)+(digitalRadarProcessing?.10:0)+(sensorFusion?.16:0));
  return {platform,compute,power,electronics,capabilities,systemInputs,fireControlGain,mobileFireGain,sensorGain,fireControl:clamp(fireControlBase+fireControlGain)};
}

export function productionAmountForSystemInputs(stock,inputs,requested){
  let amount=Math.max(0,Number(requested)||0);
  for(const [key,per] of Object.entries(inputs||{}))amount=Math.min(amount,Math.max(0,Number(stock?.[key])||0)/Math.max(.000001,per));
  return Math.max(0,amount);
}

export function consumeSystemInputs(stock,inputs,amount){
  const actual=Math.max(0,Number(amount)||0);
  for(const [key,per] of Object.entries(inputs||{}))stock[key]=Math.max(0,(Number(stock[key])||0)-per*actual);
  return actual;
}
