const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const DAYS_PER_YEAR=365.2425;

function baselineLandQuality(region){
  const soil=region.soilDegradation||={};
  if(!Number.isFinite(soil.baselineLandQuality)){
    soil.baselineLandQuality=Math.max(.05,Number(region.landQuality)||1);
  }
  return soil.baselineLandQuality;
}

function terrainExposure(region){
  const t=region?.terrain||{};
  const hills=clamp(t.hills);
  const mountains=clamp(t.mountains);
  const plains=clamp(t.plains);
  return clamp(.18+plains*.16+hills*.50+mountains*.76,.12,.92);
}

function vegetationCover(region){
  const totalKm2=Math.max(.01,Number(region?.areaSqKm)||0);
  const forestKm2=Math.max(0,Number(region?.forest?.currentStock)||0);
  const forestShare=clamp(forestKm2/totalKm2);
  const uncultivated=1-clamp(region?.agriculturalLand?.cultivationShare||0);
  return clamp(forestShare*.72+uncultivated*.20,0,.92);
}

function climateStress(region){
  const weather=region?.weather||{};
  const rainfall=clamp(region?.climate?.rainfallMultiplier??1,.45,1.35);
  const evaporation=clamp(region?.climate?.evaporationMultiplier??1,.7,2.0);
  const index=Number(weather.index)||0;
  const drought=clamp(Math.max(0,-index)/1.8+Math.max(0,1-rainfall)*1.15+Math.max(0,evaporation-1)*.55);
  const runoff=clamp(Math.max(0,index)/1.6+Math.max(0,rainfall-1)*1.4);
  return {drought,runoff};
}

function managementProfile(region){
  region.soilManagement||={};
  const management=region.soilManagement;
  const conservation=clamp(management.conservationEffort??0);
  const restoration=clamp(management.restorationEffort??0);
  const fallow=1-clamp(region?.agriculturalLand?.cultivationShare||0);
  return {conservation,restoration,fallow};
}

export function ensureSoilDegradation(region){
  const baseline=baselineLandQuality(region);
  const soil=region.soilDegradation;
  if(!Number.isFinite(soil.condition))soil.condition=1;
  if(!Number.isFinite(soil.desertification))soil.desertification=0;
  if(!Number.isFinite(soil.cumulativeErosion))soil.cumulativeErosion=0;
  if(!Number.isFinite(soil.cumulativeRestoration))soil.cumulativeRestoration=0;
  soil.condition=clamp(soil.condition,.18,1.05);
  soil.desertification=clamp(soil.desertification,0,.95);
  soil.productivityMultiplier=clamp(soil.condition*(1-soil.desertification*.52),.12,1.05);
  region.landQuality=Math.max(.03,baseline*soil.productivityMultiplier);
  return soil;
}

export function soilDegradationSummary(region){
  const soil=ensureSoilDegradation(region);
  return {
    baselineLandQuality:soil.baselineLandQuality,
    effectiveLandQuality:Math.max(.03,Number(region.landQuality)||0),
    condition:soil.condition,
    desertification:soil.desertification,
    productivityMultiplier:soil.productivityMultiplier,
    erosionRateAnnual:soil.erosionRateAnnual||0,
    recoveryRateAnnual:soil.recoveryRateAnnual||0,
    cumulativeErosion:soil.cumulativeErosion||0,
    cumulativeRestoration:soil.cumulativeRestoration||0,
  };
}

export function setSoilManagement(region,{conservationEffort=null,restorationEffort=null}={}){
  region.soilManagement||={};
  if(conservationEffort!==null)region.soilManagement.conservationEffort=clamp(conservationEffort);
  if(restorationEffort!==null)region.soilManagement.restorationEffort=clamp(restorationEffort);
  return {...region.soilManagement};
}

export function tickSoilDegradation(region,elapsedDays=7){
  const soil=ensureSoilDegradation(region);
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  if(years<=0)return soil;

  const cultivation=clamp(region?.agriculturalLand?.cultivationShare||0);
  const exposure=terrainExposure(region);
  const vegetation=vegetationCover(region);
  const {drought,runoff}=climateStress(region);
  const {conservation,restoration,fallow}=managementProfile(region);

  // Intensive cultivation removes protective cover; slopes and either very dry
  // or very wet years then convert that exposure into wind/water erosion.
  const climateErosivity=clamp(.22+drought*.70+runoff*.82,.15,1.35);
  const cultivationPressure=clamp(Math.max(0,cultivation-.20)/.80);
  const protection=clamp(vegetation*.72+conservation*.65,0,.90);
  const erosionAnnual=.0105*exposure*climateErosivity*(.22+cultivationPressure*.78)*(1-protection);

  // Natural soil recovery is deliberately slow. Fallow and vegetation help;
  // deliberate restoration (terracing, contouring, mulching, revegetation,
  // soil rebuilding) is much stronger but still measured in years/decades.
  const naturalRecovery=.0014*fallow*(.35+vegetation*.65)*(1-drought*.55);
  const managedRecovery=.014*restoration*(.35+fallow*.65)*(1-drought*.45);
  const recoveryAnnual=Math.max(0,naturalRecovery+managedRecovery);

  const erosion=erosionAnnual*years;
  const recovery=recoveryAnnual*years*(1-soil.condition);
  soil.condition=clamp(soil.condition-erosion+recovery,.18,1.05);
  soil.cumulativeErosion+=erosion;
  soil.cumulativeRestoration+=recovery;

  // Desertification is a threshold process: badly degraded, persistently dry,
  // cultivated ground can cross into a harder-to-reverse state. Recovery needs
  // moisture and active restoration or long abandonment.
  const desertRisk=clamp((.62-soil.condition)/.32)*drought*clamp(.25+cultivation*.75);
  const desertGrowth=.018*desertRisk*years*(1-conservation*.55);
  const desertRecovery=(.004*restoration+.0007*fallow*vegetation)*years*(1-drought*.75);
  soil.desertification=clamp(soil.desertification+desertGrowth-Math.max(0,desertRecovery),0,.95);

  soil.erosionRateAnnual=erosionAnnual;
  soil.recoveryRateAnnual=recoveryAnnual;
  soil.productivityMultiplier=clamp(soil.condition*(1-soil.desertification*.52),.12,1.05);
  region.landQuality=Math.max(.03,soil.baselineLandQuality*soil.productivityMultiplier);
  return soil;
}

export function tickSoils(regions,elapsedDays=7){
  for(const region of regions||[])tickSoilDegradation(region,elapsedDays);
}
