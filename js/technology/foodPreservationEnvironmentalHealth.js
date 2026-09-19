export const FOOD_CANNING_TECH_ID='food_canning';
export const MECHANICAL_REFRIGERATION_TECH_ID='mechanical_refrigeration';
export const CFC_REFRIGERATION_TECH_ID='cfc_refrigeration';
export const CFC_OZONE_HARM_TECH_ID='cfc_ozone_harm';
export const ALTERNATIVE_REFRIGERANTS_TECH_ID='alternative_refrigerants';
export const LEAD_WATER_RISK_TECH_ID='lead_water_risk';
export const LEAD_FREE_WATER_TECH_ID='lead_free_water_systems';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const literacy=r=>clamp(r?.publicEducation?.literacy??r?.educationLevel??0);
const industry=r=>clamp(r?.structuralTransformation?.capability?.manufacture??r?.industrialSupply?.capability?.precision_machining??0);
const electricity=r=>clamp(r?.electricity?.industrialService??0);
const medicine=r=>clamp((r?.publicHealth?.publicHealthAdministration||0)*.35+literacy(r)*.65);
function chance(p,weeks,rng){return rng()<1-Math.pow(1-clamp(p),Math.max(.01,weeks));}
function sourceCount(region,regionsById,id){const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[]),...(region.recentTradePartners instanceof Map?[...region.recentTradePartners.keys()]:[])]);let n=0;for(const otherId of ids)if(regionsById.get(otherId)?.unlockedTechIds?.has?.(id))n++;return n;}
function diffusion(region,regionsById,id,base=.0005){return 1-Math.exp(-sourceCount(region,regionsById,id)*base);}
function unlock(region,id,event,currentTick,title,message){region.unlockedTechIds.add(id);return {type:event,techId:id,regionId:region.id,regionName:region.name,tick:currentTick,title,message};}

export function ensureEnvironmentalHealthState(region){
  region.environmentalHealth||={};const s=region.environmentalHealth;
  s.cfcUse=Math.max(0,Number(s.cfcUse)||0);s.ozoneDamageContribution=Math.max(0,Number(s.ozoneDamageContribution)||0);s.refrigerantClimateEmissions=Math.max(0,Number(s.refrigerantClimateEmissions)||0);
  s.leadWaterShare=clamp(s.leadWaterShare??0);s.leadExposureBurden=Math.max(0,Number(s.leadExposureBurden)||0);s.leadReplacementProgress=clamp(s.leadReplacementProgress||0);
  return s;
}

export function refrigerantProfile(region){
  if(has(region,ALTERNATIVE_REFRIGERANTS_TECH_ID))return {kind:'alternative',efficiency:1.08,ozoneFactor:0,climateFactor:.000035,knownOzoneRisk:true};
  if(has(region,CFC_REFRIGERATION_TECH_ID))return {kind:'cfc',efficiency:1.14,ozoneFactor:.00022,climateFactor:.00009,knownOzoneRisk:has(region,CFC_OZONE_HARM_TECH_ID)};
  if(has(region,MECHANICAL_REFRIGERATION_TECH_ID))return {kind:'early_mechanical',efficiency:.72,ozoneFactor:0,climateFactor:.000025,knownOzoneRisk:false};
  return {kind:'none',efficiency:0,ozoneFactor:0,climateFactor:0,knownOzoneRisk:false};
}

export function recordRefrigerationUse(region,load=1,weeks=1){
  const s=ensureEnvironmentalHealthState(region),p=refrigerantProfile(region),activity=Math.max(0,Number(load)||0)*Math.max(0,Number(weeks)||0);
  if(!p.efficiency||!activity)return {profile:p,ozoneDamage:0,climateEmissions:0};
  const ozoneDamage=activity*p.ozoneFactor,climateEmissions=activity*p.climateFactor;
  if(p.kind==='cfc')s.cfcUse+=activity;s.ozoneDamageContribution+=ozoneDamage;s.refrigerantClimateEmissions+=climateEmissions;
  return {profile:p,ozoneDamage,climateEmissions};
}

export function knownRefrigerantRisk(region){
  const p=refrigerantProfile(region);if(p.kind!=='cfc'||!has(region,CFC_OZONE_HARM_TECH_ID))return null;
  return {known:true,kind:'ozone_depletion',severity:clamp(.35+ensureEnvironmentalHealthState(region).cfcUse/500),message:'CFC refrigerants are now known to damage stratospheric ozone. Alternative refrigerants and equipment retrofits can reduce the harm.'};
}

export function ensureLeadWaterSystem(region){
  const s=ensureEnvironmentalHealthState(region);
  const piped=Boolean(region?.construction?.assets?.some?.(a=>['aqueduct','urban_drainage'].includes(a.typeId)&&(a.condition??1)>.2));
  if(piped&&s.leadWaterShare===0&&!has(region,LEAD_FREE_WATER_TECH_ID))s.leadWaterShare=clamp(.08+industry(region)*.34);
  return s;
}

export function tickLeadWaterHealth(region,weeks=1){
  const s=ensureLeadWaterSystem(region),exposure=s.leadWaterShare*Math.max(0,Number(weeks)||0);
  s.leadExposureBurden=Math.max(0,s.leadExposureBurden+exposure*.0012-s.leadExposureBurden*.00035*Math.max(0,weeks));
  if(has(region,LEAD_FREE_WATER_TECH_ID)&&s.leadWaterShare>0){const admin=clamp(region?.governance?.administrativeControl??region?.militaryFinance?.stateCapacity??.3);const replacement=Math.min(s.leadWaterShare,(.0015+.006*admin+.006*industry(region))*Math.max(0,weeks));s.leadWaterShare-=replacement;s.leadReplacementProgress=clamp(s.leadReplacementProgress+replacement);}
  return {leadWaterShare:s.leadWaterShare,leadExposureBurden:s.leadExposureBurden,riskKnown:has(region,LEAD_WATER_RISK_TECH_ID),replacementAvailable:has(region,LEAD_FREE_WATER_TECH_ID)};
}

export function knownLeadWaterRisk(region){
  const s=ensureLeadWaterSystem(region);if(!has(region,LEAD_WATER_RISK_TECH_ID)||s.leadWaterShare<=.001)return null;
  return {known:true,kind:'lead_drinking_water',severity:clamp(s.leadWaterShare*.75+s.leadExposureBurden*.25),message:'Chronic lead exposure from drinking-water plumbing is now recognised as a public-health risk. Replacing lead-bearing pipes and service connections can reduce exposure.'};
}

export function tickPreservationAndEnvironmentalHealthBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const weeks=Math.max(.01,elapsedDays/7),byId=new Map(regions.map(r=>[r.id,r])),events=[];
  for(const r of regions){
    ensureEnvironmentalHealthState(r);tickLeadWaterHealth(r,weeks);
    const tests=[
      [FOOD_CANNING_TECH_ID,()=>industry(r)>.12?(industry(r)*.000006+diffusion(r,byId,FOOD_CANNING_TECH_ID,.001)):0,'food_canning_breakthrough','Sealed food preservation','Food can now be heat-treated and sealed in durable containers, greatly extending the life of ship and army provisions.'],
      [MECHANICAL_REFRIGERATION_TECH_ID,()=>has(r,'electrical_generation')||has(r,'industrial_electrification')?(industry(r)*Math.max(.08,electricity(r))*.000004+diffusion(r,byId,MECHANICAL_REFRIGERATION_TECH_ID,.0008)):0,'mechanical_refrigeration_breakthrough','Mechanical refrigeration','Mechanical refrigeration can keep perishable food cold in stores and, where sufficient power is available, aboard ships.'],
      [CFC_REFRIGERATION_TECH_ID,()=>has(r,MECHANICAL_REFRIGERATION_TECH_ID)&&industry(r)>.28?(industry(r)*.000003+diffusion(r,byId,CFC_REFRIGERATION_TECH_ID,.0008)):0,'cfc_refrigeration_breakthrough','Improved refrigerants','A new class of stable, convenient refrigerants makes refrigeration safer and more practical.'],
      [CFC_OZONE_HARM_TECH_ID,()=>has(r,CFC_REFRIGERATION_TECH_ID)&&ensureEnvironmentalHealthState(r).cfcUse>5?(literacy(r)*medicine(r)*.0000015+Math.min(.000003,ensureEnvironmentalHealthState(r).cfcUse*2e-8)+diffusion(r,byId,CFC_OZONE_HARM_TECH_ID,.0012)):0,'cfc_ozone_harm_breakthrough','Ozone depletion identified','Atmospheric research has linked CFC refrigerants to depletion of stratospheric ozone. The previously hidden environmental cost is now visible.'],
      [ALTERNATIVE_REFRIGERANTS_TECH_ID,()=>has(r,CFC_OZONE_HARM_TECH_ID)?(industry(r)*literacy(r)*.000006+diffusion(r,byId,ALTERNATIVE_REFRIGERANTS_TECH_ID,.001)):0,'alternative_refrigerants_breakthrough','Alternative refrigerants','Engineers can now use refrigerants and system designs that avoid ozone depletion while retaining refrigeration.'],
      [LEAD_WATER_RISK_TECH_ID,()=>ensureEnvironmentalHealthState(r).leadWaterShare>.02?(literacy(r)*medicine(r)*.000002+diffusion(r,byId,LEAD_WATER_RISK_TECH_ID,.001)):0,'lead_water_risk_breakthrough','Chronic lead exposure recognised','Public-health research has linked chronic lead exposure from drinking-water plumbing to serious health harms.'],
      [LEAD_FREE_WATER_TECH_ID,()=>has(r,LEAD_WATER_RISK_TECH_ID)?(industry(r)*medicine(r)*.000007+diffusion(r,byId,LEAD_FREE_WATER_TECH_ID,.001)):0,'lead_free_water_breakthrough','Lead-free water systems','Engineers and public-health authorities can systematically replace lead-bearing drinking-water infrastructure and control corrosion.'],
    ];
    for(const [id,p,event,title,message] of tests)if(!has(r,id)&&chance(p(),weeks,rng))events.push(unlock(r,id,event,currentTick,title,message));
  }
  return events;
}
