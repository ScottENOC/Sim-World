const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);
const KEYS=['households','agriculture','industry','controlledEnvironment'];

function activeAssets(region,typeId){return (region?.construction?.assets||[]).filter(a=>a?.typeId===typeId&&(a.condition??1)>.2).length;}
function hasTech(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function electricityService(region){return clamp(region?.electricity?.industrialService??region?.electricity?.householdService??0);}
function urbanShare(region){return clamp(region?.medievalSociety?.urban?.urbanisation||region?.settlements?.urbanShare||region?.urbanisation?.urbanShare||0);}
function coastal(region){return Boolean(region?.isCoastal||(region?.seaRegionIds||[]).length||(region?.adjacentSeaRegionIds||[]).length);}

export function ensureUrbanWater(region){
  region.urbanWater||={};const s=region.urbanWater;
  for(const [k,v] of Object.entries({distributionCoverage:0,potableTreatment:0,wastewaterCollection:0,wastewaterTreatment:0,reuseCapability:0,desalinationCapability:0,recycledStorage:0,recycledSupply:0,desalinatedSupply:0,wastewaterGenerated:0,wastewaterTreated:0,untreatedWastewater:0,potableQuality:1,waterborneRiskMultiplier:1,electricityLoad:0,nonRevenueWater:0.18,demandEfficiency:0}))if(!Number.isFinite(s[k]))s[k]=v;
  s.lastSupplementalAllocation||={households:0,agriculture:0,industry:0,controlledEnvironment:0};
  return s;
}

export function urbanWaterCapabilities(region){
  const s=ensureUrbanWater(region),power=electricityService(region),aqueduct=activeAssets(region,'aqueduct'),drainage=activeAssets(region,'urban_drainage'),wells=activeAssets(region,'wells_cisterns'),hydraulic=hasTech(region,'hydraulic_engineering'),germTheory=hasTech(region,'germ_theory'),electrified=hasTech(region,'electrical_generation')||hasTech(region,'industrial_electrification');
  const networkBase=clamp((aqueduct?.48:0)+(drainage?.20:0)+(wells?.12:0)+urbanShare(region)*.12);
  s.distributionCoverage=clamp(networkBase+(electrified?power*.18:0));
  s.potableTreatment=clamp((germTheory?.34:0)+(hydraulic?.12:0)+(drainage?.12:0)+(electrified?power*.38:0));
  s.wastewaterCollection=clamp((drainage?.58:0)+(aqueduct?.10:0)+urbanShare(region)*.18);
  s.wastewaterTreatment=clamp((germTheory&&drainage?.24:0)+(hydraulic&&drainage?.12:0)+(electrified&&drainage?power*.58:0));
  s.reuseCapability=clamp((germTheory&&drainage?.18:0)+(hydraulic?.12:0)+(electrified?power*.46:0));
  s.desalinationCapability=clamp(coastal(region)&&electrified&&hasTech(region,'industrial_electrification')?0.18+power*.72:0);
  return {distributionCoverage:s.distributionCoverage,potableTreatment:s.potableTreatment,wastewaterCollection:s.wastewaterCollection,wastewaterTreatment:s.wastewaterTreatment,reuseCapability:s.reuseCapability,desalinationCapability:s.desalinationCapability};
}

export function prepareUrbanWater(region){
  const s=ensureUrbanWater(region),c=urbanWaterCapabilities(region),p=region.waterPolicy||{};
  const efficiencyPolicy=clamp(p.demandEfficiency??.08),networkEfficiency=1-clamp(s.nonRevenueWater,0,.45);
  s.demandEfficiency=clamp(efficiencyPolicy*(.25+c.distributionCoverage*.75)*(.65+networkEfficiency*.35),0,.42);
  s.lastSupplementalAllocation={households:0,agriculture:0,industry:0,controlledEnvironment:0};
  s.recycledSupply=0;s.desalinatedSupply=0;s.electricityLoad=0;
  return s;
}

export function urbanDemandMultiplier(region,sector){
  const s=ensureUrbanWater(region);if(sector==='agriculture')return 1;
  const sectorFactor=sector==='households'?1:sector==='industry'?.82:.55;
  return 1-s.demandEfficiency*sectorFactor;
}

function allocatePreferred(residual,available,order){
  const out={households:0,agriculture:0,industry:0,controlledEnvironment:0};let remaining=positive(available);
  for(const key of order){const take=Math.min(positive(residual[key]),remaining);out[key]=take;remaining-=take;if(remaining<=0)break;}
  return out;
}
function mergeResidual(residual,allocation){const next={};for(const k of KEYS)next[k]=Math.max(0,positive(residual[k])-positive(allocation[k]));return next;}

export function supplementalUrbanWater(region,residual,elapsedDays=7){
  const s=ensureUrbanWater(region),p=region.waterPolicy||{},power=electricityService(region),days=Math.max(.01,positive(elapsedDays)),out={households:0,agriculture:0,industry:0,controlledEnvironment:0};
  const reusePolicy=clamp(p.waterReuse??.25),reusable=Math.min(s.recycledStorage, s.reuseCapability*reusePolicy*(.035+.095*power)*days/7);
  const reuseAllocation=allocatePreferred(residual,reusable,['agriculture','industry','controlledEnvironment']);
  const reused=Object.values(reuseAllocation).reduce((a,b)=>a+b,0);for(const k of KEYS)out[k]+=reuseAllocation[k];s.recycledStorage=Math.max(0,s.recycledStorage-reused);s.recycledSupply=reused;s.electricityLoad+=reused*(.10+.18*(1-power));
  const afterReuse=mergeResidual(residual,reuseAllocation),desalPolicy=clamp(p.desalination??.12),desalPotential=s.desalinationCapability*desalPolicy*(.025+.11*power)*days/7;
  const desalAllocation=allocatePreferred(afterReuse,desalPotential,['households','industry','controlledEnvironment','agriculture']);const desalinated=Object.values(desalAllocation).reduce((a,b)=>a+b,0);for(const k of KEYS)out[k]+=desalAllocation[k];s.desalinatedSupply=desalinated;s.electricityLoad+=desalinated*(.42+.48*(1-power));
  s.lastSupplementalAllocation={...out};return out;
}

export function finaliseUrbanWater(region,allocation,elapsedDays=7){
  const s=ensureUrbanWater(region),p=region.waterPolicy||{},power=electricityService(region),days=Math.max(.01,positive(elapsedDays)),collection=s.wastewaterCollection;
  const wastewater=positive(allocation?.households)*.78+positive(allocation?.industry)*.56+positive(allocation?.controlledEnvironment)*.18;
  const collected=wastewater*collection,treatmentPolicy=clamp(p.wastewaterTreatment??.55),treatmentFraction=clamp(s.wastewaterTreatment*treatmentPolicy),treated=collected*treatmentFraction,untreated=Math.max(0,wastewater-treated);
  s.wastewaterGenerated=wastewater;s.wastewaterTreated=treated;s.untreatedWastewater=untreated;
  const reusePolicy=clamp(p.waterReuse??.25),recoverable=treated*clamp(s.reuseCapability*reusePolicy)*.78,storageCap=.45+urbanShare(region)*1.8+s.reuseCapability*1.4;s.recycledStorage=clamp(s.recycledStorage+recoverable,0,storageCap);
  const sourceRisk=clamp(region?.hydrology?.report?.waterHealthRisk??region?.hydrology?.waterHealthRisk??0),drinkingPolicy=clamp(p.drinkingWaterTreatment??.7),treatment=clamp(s.potableTreatment*drinkingPolicy),networkProtection=clamp(s.distributionCoverage*.72+treatment*.28),rawRisk=sourceRisk*(1-treatment*.93)*(1-networkProtection*.35);
  s.potableQuality=clamp(1-rawRisk);s.waterborneRiskMultiplier=clamp(.18+rawRisk*.82,.18,1);
  s.nonRevenueWater=clamp(.34-s.distributionCoverage*.22-power*.05,.06,.36);
  s.electricityLoad+=treated*(.08+.16*(1-power))+positive(allocation?.households)*treatment*.035;
  region.report||={};region.report.urbanWater={workers:0,distributionCoverage:s.distributionCoverage,potableTreatment:s.potableTreatment,wastewaterCollection:s.wastewaterCollection,wastewaterTreatment:s.wastewaterTreatment,reuseCapability:s.reuseCapability,desalinationCapability:s.desalinationCapability,recycledStorage:s.recycledStorage,recycledSupply:s.recycledSupply,desalinatedSupply:s.desalinatedSupply,wastewaterGenerated:s.wastewaterGenerated,wastewaterTreated:s.wastewaterTreated,untreatedWastewater:s.untreatedWastewater,potableQuality:s.potableQuality,waterborneRiskMultiplier:s.waterborneRiskMultiplier,electricityLoad:s.electricityLoad,nonRevenueWater:s.nonRevenueWater,demandEfficiency:s.demandEfficiency};
  return s;
}

export function wastewaterPollutionMultiplier(region){const s=ensureUrbanWater(region);const generated=Math.max(.0001,s.wastewaterGenerated);return clamp(s.untreatedWastewater/generated,0,1);}
export function urbanWaterProfile(region){const s=ensureUrbanWater(region);return {...s,lastSupplementalAllocation:{...s.lastSupplementalAllocation}};}
