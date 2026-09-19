const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const BAYER_ALUMINA_TECH_ID = 'bayer_alumina_refining';
export const ALUMINIUM_SMELTING_TECH_ID = 'hall_heroult_aluminium';
export const TITANIUM_DIOXIDE_TECH_ID = 'titanium_dioxide_pigment';
export const TITANIUM_METAL_TECH_ID = 'kroll_titanium';
export const LIGHT_ALLOY_TECH_ID = 'aerospace_light_alloys';

const FACILITY_SPECS = Object.freeze({
  aluminaRefinery: { tech: BAYER_ALUMINA_TECH_ID, fixedCost: 4.5, marginalCost: .24, minEfficientScale: 20, buildRate: 7 },
  aluminiumSmelter: { tech: ALUMINIUM_SMELTING_TECH_ID, fixedCost: 12, marginalCost: .42, minEfficientScale: 45, buildRate: 5 },
  titaniumDioxidePlant: { tech: TITANIUM_DIOXIDE_TECH_ID, fixedCost: 3.5, marginalCost: .30, minEfficientScale: 14, buildRate: 5 },
  titaniumMetalPlant: { tech: TITANIUM_METAL_TECH_ID, fixedCost: 10, marginalCost: .95, minEfficientScale: 8, buildRate: 2.2 },
});

function stable01(text, salt = '') {
  let h = 2166136261;
  const value = `${salt}:${text || 'region'}`;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function tech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function industrialReadiness(region) {
  const manufacture = clamp(region.structuralTransformation?.capability?.manufacture || 0);
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const advanced = tech(region, 'advanced_factories') ? 1 : 0;
  const chemistry = clamp(region.massEducation?.literacy || region.education?.literacy || 0);
  return clamp(manufacture * .42 + machining * .30 + advanced * .16 + chemistry * .12);
}
function electricityReadiness(region) {
  const industrial = clamp(region.electricity?.industrialService || 0);
  const delivered = nonNegative(region.electricity?.delivered);
  return clamp(industrial * .78 + Math.log1p(delivered) / 18 * .22);
}
function miningReadiness(region) {
  const miners = nonNegative(region.occupations?.miner), pop = Math.max(1, nonNegative(region.population));
  return clamp(.22 + clamp(miners / pop * 16) * .42 + clamp(region.industrialSupply?.capability?.precision_machining || 0) * .36);
}
function ensureGeology(region) {
  region.resourceDeposits ||= {};
  if (!region.resourceDeposits.bauxite) {
    const draw = stable01(region.id || region.name, 'bauxite');
    region.resourceDeposits.bauxite = { depth: draw > .72 ? clamp(.28 + stable01(region.id || region.name, 'bauxite-grade') * .72) : 0, remainingFraction: draw > .72 ? 1 : 0, inferred: true };
  }
  if (!region.resourceDeposits.titanium_minerals) {
    const draw = stable01(region.id || region.name, 'titanium');
    region.resourceDeposits.titanium_minerals = { depth: draw > .58 ? clamp(.18 + stable01(region.id || region.name, 'titanium-grade') * .72) : 0, remainingFraction: draw > .58 ? 1 : 0, inferred: true };
  }
}
export function ensureLightMetals(region) {
  region.stockpile ||= {};
  for (const key of ['bauxite','alumina','aluminium','titanium_minerals','titanium_dioxide','titanium']) if (!Number.isFinite(region.stockpile[key])) region.stockpile[key] = 0;
  region.lightMetals ||= {}; const s = region.lightMetals;
  s.progress ||= {}; s.experience ||= {}; s.lastOutput ||= {}; s.demand ||= {}; s.military ||= {}; s.facilities ||= {};
  for (const id of [BAYER_ALUMINA_TECH_ID,ALUMINIUM_SMELTING_TECH_ID,TITANIUM_DIOXIDE_TECH_ID,TITANIUM_METAL_TECH_ID,LIGHT_ALLOY_TECH_ID]) if (!Number.isFinite(s.progress[id])) s.progress[id] = 0;
  for (const [key,spec] of Object.entries(FACILITY_SPECS)) {
    s.facilities[key] ||= { capacity: 0, capitalInvested: 0, utilisation: 0, averageCapitalCost: 0, minimumEfficientScale: spec.minEfficientScale };
  }
  ensureGeology(region); return s;
}
function advanceTechnology(region,s,id,annualRate,years,ready=true){
  region.unlockedTechIds ||= new Set(); if(region.unlockedTechIds.has(id)||!ready)return false;
  s.progress[id]=clamp(s.progress[id]+Math.max(0,annualRate)*years); if(s.progress[id]<1)return false;
  region.unlockedTechIds.add(id);s.progress[id]=1;(s.newBreakthroughs ||= []).push(id);return true;
}
function bootstrapModernKnowledge(region,s,industry,electric){
  region.unlockedTechIds ||= new Set(); const advanced=tech(region,'advanced_factories');
  if(advanced&&industry>.42)region.unlockedTechIds.add(BAYER_ALUMINA_TECH_ID);
  if(advanced&&tech(region,'industrial_electrification')&&industry>.48&&electric>.35)region.unlockedTechIds.add(ALUMINIUM_SMELTING_TECH_ID);
  if(advanced&&industry>.40)region.unlockedTechIds.add(TITANIUM_DIOXIDE_TECH_ID);
  if(advanced&&tech(region,'jet_propulsion')&&industry>.60)region.unlockedTechIds.add(TITANIUM_METAL_TECH_ID);
  if(tech(region,ALUMINIUM_SMELTING_TECH_ID)&&(tech(region,'automobile')||tech(region,'jet_propulsion'))&&industry>.52)region.unlockedTechIds.add(LIGHT_ALLOY_TECH_ID);
  for(const id of region.unlockedTechIds)if(Object.prototype.hasOwnProperty.call(s.progress,id))s.progress[id]=1;
}
function extractOre(region,depositKey,stockKey,scale,years){
  const dep=region.resourceDeposits?.[depositKey],depth=clamp(dep?.depth||0),remaining=clamp(dep?.remainingFraction??(depth>0?1:0)); if(depth<=0||remaining<=0)return 0;
  const output=scale*depth*remaining*miningReadiness(region)*years; region.stockpile[stockKey]=nonNegative(region.stockpile[stockKey])+output;
  dep.remainingFraction=clamp(remaining-output/Math.max(20000,scale*180)); return output;
}
function consume(stockpile,key,requested){const available=nonNegative(stockpile[key]),amount=Math.min(available,Math.max(0,requested));stockpile[key]=available-amount;return amount;}

function availableCapital(region){
  const firms=region.corporateCapital?.firms?.filter(f=>f.status==='active'&&['manufacture','infrastructure'].includes(f.sector))||[];
  return firms.reduce((sum,f)=>sum+nonNegative(f.capitalIndex),0)+nonNegative(region.corporateCapital?.investibleWealth)*.08;
}
function spendCapital(region,cost){
  if(cost<=0)return 0; let remaining=Math.min(cost,availableCapital(region)); const spent=remaining;
  const firms=region.corporateCapital?.firms?.filter(f=>f.status==='active'&&['manufacture','infrastructure'].includes(f.sector))||[];
  for(const f of firms){const take=Math.min(remaining,nonNegative(f.capitalIndex)*.10);f.capitalIndex=nonNegative(f.capitalIndex)-take;remaining-=take;if(remaining<=0)break;}
  if(remaining>0&&region.corporateCapital){const wealthDraw=remaining/.08;region.corporateCapital.investibleWealth=Math.max(0,nonNegative(region.corporateCapital.investibleWealth)-wealthDraw);remaining=0;}
  return spent;
}
export function facilityScaleEconomics(facilityKey,capacity){
  const spec=FACILITY_SPECS[facilityKey]; if(!spec)return {unitCapitalCost:Infinity,scaleEfficiency:0};
  const cap=Math.max(.01,Number(capacity)||0),scaleRatio=cap/spec.minEfficientScale;
  const scaleEfficiency=clamp(Math.pow(scaleRatio,.32),.22,1);
  const unitCapitalCost=spec.marginalCost+spec.fixedCost/cap;
  return {unitCapitalCost,scaleEfficiency,minEfficientScale:spec.minEfficientScale};
}
function desiredFacilityScale(region,key){
  const pop=Math.max(0,region.population||0),industry=industrialReadiness(region),electric=electricityReadiness(region);
  const strategic=(key==='aluminiumSmelter'||key==='titaniumMetalPlant')?1:.55;
  const demand=Math.pow(pop/1000,.48)*(0.25+industry*1.25)*(0.65+strategic*.35);
  if(key==='aluminiumSmelter')return demand*(.55+electric*1.25);
  if(key==='titaniumMetalPlant')return demand*.16*(tech(region,'jet_propulsion')?1.8:1);
  return demand*(key==='aluminaRefinery'?1.05:.42);
}
function investFacility(region,s,key,years){
  const spec=FACILITY_SPECS[key],f=s.facilities[key]; if(!tech(region,spec.tech))return;
  const desired=desiredFacilityScale(region,key); if(desired<=f.capacity*1.08)return;
  const minimumFirstBuild=f.capacity<=0?spec.minEfficientScale*.35:0;
  const capacityWanted=Math.max(minimumFirstBuild,Math.min(desired-f.capacity,spec.buildRate*Math.max(.2,years)));
  const prospective=f.capacity+capacityWanted;
  const {unitCapitalCost}=facilityScaleEconomics(key,prospective);
  const cost=capacityWanted*unitCapitalCost;
  const spent=spendCapital(region,cost); if(spent<=0)return;
  const added=capacityWanted*(spent/cost); f.capacity+=added; f.capitalInvested+=spent;
  f.averageCapitalCost=f.capitalInvested/Math.max(.01,f.capacity);
}
function tickFacilityInvestment(region,s,years){for(const key of Object.keys(FACILITY_SPECS))investFacility(region,s,key,years);}
function facilityThroughput(s,key){const f=s.facilities[key],econ=facilityScaleEconomics(key,f.capacity);return Math.max(0,f.capacity)*econ.scaleEfficiency;}

function useCivilianMaterials(region,s,years){
  const pop=nonNegative(region.population),industry=industrialReadiness(region),motor=tech(region,'automobile')?1:0,grids=nonNegative(region.electricity?.delivered)>0?1:0,computing=nonNegative(region.stockpile.packaged_chips)>0?1:0;
  const aluminiumWanted=Math.pow(pop/1000,.58)*(.4+industry*1.6+motor*.65+grids*.45+computing*.18)*years;
  const aluminiumUsed=consume(region.stockpile,'aluminium',aluminiumWanted);
  const pigmentWanted=Math.pow(pop/1000,.54)*(.25+industry*1.25)*years,pigmentUsed=consume(region.stockpile,'titanium_dioxide',pigmentWanted);
  const titaniumWanted=tech(region,TITANIUM_METAL_TECH_ID)?Math.pow(pop/1000,.34)*(.04+industry*.24+(tech(region,'jet_propulsion')?.18:0))*years:0;
  const titaniumUsed=consume(region.stockpile,'titanium',titaniumWanted);
  s.demand={aluminiumWanted,aluminiumUsed,titaniumDioxideWanted:pigmentWanted,titaniumDioxideUsed:pigmentUsed,titaniumWanted,titaniumUsed};
  s.civilianBenefits={transportWeightReduction:clamp(aluminiumUsed/Math.max(.01,aluminiumWanted))*(tech(region,LIGHT_ALLOY_TECH_ID)?.12:.05),electricalConstructionEfficiency:clamp(aluminiumUsed/Math.max(.01,aluminiumWanted))*.08,durableGoodsAndPackaging:clamp(aluminiumUsed/Math.max(.01,aluminiumWanted))*.10,paintPlasticsPaperSupply:clamp(pigmentUsed/Math.max(.01,pigmentWanted)),highPerformanceIndustrialMaterials:clamp(titaniumUsed/Math.max(.01,titaniumWanted||1))};
}
function updateMilitaryMaterialProfile(region,s){
  const designs=region.militaryEquipment?.designs||[],jets=designs.filter(d=>['fighter','bomber'].includes(d.family)&&d.stats?.propulsion==='jet').length,aircraft=designs.filter(d=>['fighter','bomber'].includes(d.family)).length;
  const aluminiumAvailability=clamp(nonNegative(region.stockpile.aluminium)/(40+aircraft*18));
  const titaniumAvailability=tech(region,TITANIUM_METAL_TECH_ID)?clamp(nonNegative(region.stockpile.titanium)/(12+jets*8)):0,alloyKnowledge=tech(region,LIGHT_ALLOY_TECH_ID)?1:0;
  s.military={aluminiumAvailability,titaniumAvailability,aircraftWeightMultiplier:clamp(1-aluminiumAvailability*(.07+alloyKnowledge*.08)-titaniumAvailability*jets*.006,.72,1),aircraftRangeMultiplier:1+aluminiumAvailability*(.04+alloyKnowledge*.07)+titaniumAvailability*(jets>0?.08:.02),aircraftPayloadMultiplier:1+aluminiumAvailability*(.035+alloyKnowledge*.065)+titaniumAvailability*(jets>0?.07:.015),jetEngineHotSectionCapability:jets>0?clamp(.45+titaniumAvailability*.55):0,navalCorrosionMaterialCapability:clamp(aluminiumAvailability*.45+titaniumAvailability*.55),armourMaterialCapability:clamp(titaniumAvailability*.38)};
}
export function lightMetalMilitaryModifiers(region){return ensureLightMetals(region).military||{};}

export function tickLightMetals(region,elapsedDays=7){
  const s=ensureLightMetals(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,industry=industrialReadiness(region),electric=electricityReadiness(region);
  bootstrapModernKnowledge(region,s,industry,electric);
  advanceTechnology(region,s,BAYER_ALUMINA_TECH_ID,.04+industry*.11,years,industry>.24);
  advanceTechnology(region,s,ALUMINIUM_SMELTING_TECH_ID,.025+industry*.06+electric*.10,years,tech(region,BAYER_ALUMINA_TECH_ID)&&tech(region,'industrial_electrification')&&electric>.18);
  advanceTechnology(region,s,TITANIUM_DIOXIDE_TECH_ID,.035+industry*.09,years,industry>.30);
  advanceTechnology(region,s,TITANIUM_METAL_TECH_ID,.012+industry*.045+electric*.025,years,tech(region,TITANIUM_DIOXIDE_TECH_ID)&&tech(region,'advanced_factories')&&industry>.48);
  advanceTechnology(region,s,LIGHT_ALLOY_TECH_ID,.025+industry*.06,years,tech(region,ALUMINIUM_SMELTING_TECH_ID)&&(tech(region,'automobile')||tech(region,'jet_propulsion')));
  tickFacilityInvestment(region,s,years);

  const bauxite=extractOre(region,'bauxite','bauxite',180,years),titaniumMinerals=extractOre(region,'titanium_minerals','titanium_minerals',85,years);
  let alumina=0,aluminium=0,titaniumDioxide=0,titanium=0;
  if(tech(region,BAYER_ALUMINA_TECH_ID)){
    const cap=facilityThroughput(s,'aluminaRefinery')*years,feed=consume(region.stockpile,'bauxite',cap*1.35);alumina=feed*.52*(.72+industry*.38);region.stockpile.alumina+=alumina;s.facilities.aluminaRefinery.utilisation=cap>0?clamp(feed/(cap*1.35)):0;
  }
  if(tech(region,ALUMINIUM_SMELTING_TECH_ID)){
    const cap=facilityThroughput(s,'aluminiumSmelter')*years,electricityConstraint=clamp(electric*1.15),feed=consume(region.stockpile,'alumina',cap*.55*electricityConstraint);aluminium=feed*.48*(.82+industry*.22);region.stockpile.aluminium+=aluminium;s.electricityLoad=aluminium*8.5;s.facilities.aluminiumSmelter.utilisation=cap>0?clamp(feed/(cap*.55)):0;
  } else s.electricityLoad=0;
  if(tech(region,TITANIUM_DIOXIDE_TECH_ID)){
    const cap=facilityThroughput(s,'titaniumDioxidePlant')*years,feed=consume(region.stockpile,'titanium_minerals',cap*.48);titaniumDioxide=feed*.60*(.78+industry*.26);region.stockpile.titanium_dioxide+=titaniumDioxide;s.facilities.titaniumDioxidePlant.utilisation=cap>0?clamp(feed/(cap*.48)):0;
  }
  if(tech(region,TITANIUM_METAL_TECH_ID)){
    const cap=facilityThroughput(s,'titaniumMetalPlant')*years,feed=consume(region.stockpile,'titanium_minerals',cap*.085),power=clamp(.45+electric*.55);titanium=feed*.20*power*(.72+industry*.34);region.stockpile.titanium+=titanium;s.electricityLoad+=titanium*3.2;s.facilities.titaniumMetalPlant.utilisation=cap>0?clamp(feed/(cap*.085)):0;
  }
  s.lastOutput={bauxite,alumina,aluminium,titaniumMinerals,titaniumDioxide,titanium};useCivilianMaterials(region,s,years);updateMilitaryMaterialProfile(region,s);
  region.report ||= {};region.report.lightMetals={workers:0,output:{...s.lastOutput},demand:{...s.demand},civilianBenefits:{...s.civilianBenefits},military:{...s.military},facilities:structuredClone(s.facilities),electricityLoad:s.electricityLoad||0,breakthroughs:[...(s.newBreakthroughs||[])]};s.newBreakthroughs=[];return s;
}
