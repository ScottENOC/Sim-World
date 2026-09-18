import { PETROLEUM_REFINING_TECH_ID } from './petroleum.js?v=20260917-oil1';
import { industrialFactoryCapacity } from '../economy/industrialPlant.js?v=20260919-components1';
import { tickIndustrialInvestment } from '../economy/industrialInvestment.js?v=20260919-investment1';

export const AUTOMOBILE_TECH_ID = 'automobile';
export const ASSEMBLY_LINE_TECH_ID = 'assembly_line_production';
export const ADVANCED_FACTORY_TECH_ID = 'advanced_factories';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const weekly=(p,days)=>1-Math.pow(1-clamp(p),Math.max(0,Number(days)||0)/7);

function partnerCount(region,byId,techId){
  const ids=region.recentTradePartners instanceof Map?[...region.recentTradePartners.keys()]:[...(region.tradePartnerIds||[])];
  const neighbours=region.neighbors||[];
  return [...new Set([...ids,...neighbours])].filter(id=>byId.get(id)?.unlockedTechIds?.has?.(techId)).length;
}
function diffusion(region,byId,techId,base){return 1-Math.pow(1-base,partnerCount(region,byId,techId));}
function industrialReadiness(region){
  const s=region.industrialSupply||{};
  const structural=region.structuralTransformation||{};
  const manufacture=clamp(structural.capability?.manufacture||0);
  const machining=clamp(s.capability?.precision_machining||0);
  const scale=clamp((structural.scaleMultipliers?.manufacture||1)/2);
  const electricity=clamp(region.electricity?.industrialCoverage||region.electricity?.coverage||0);
  return clamp(manufacture*.36+machining*.34+scale*.16+electricity*.14);
}

export function industrialProductionBreakthroughChances(region,byId){
  const tech=region.unlockedTechIds||new Set();
  const factoryCapacity=industrialFactoryCapacity(region);
  if(factoryCapacity<=0)return {automobile:0,assembly:0,advanced:0};
  const industry=industrialReadiness(region);
  const machining=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const locomotive=clamp(region.industrialSupply?.capability?.locomotive_engineering||0);
  const admin=clamp(region.governance?.administrativeControl||region.governance?.administration?.recordKeeping||0);
  const corporate=clamp(region.corporateCapital?.financialDepth||0);
  const standardisation=clamp(region.industrialProduction?.standardisationExperience||region.industrialSupply?.exposure?.precision_machining||0);
  const hasRefining=tech.has(PETROLEUM_REFINING_TECH_ID);

  const automobile=tech.has(AUTOMOBILE_TECH_ID)||!hasRefining?0:
    industry*machining*(.35+.35*locomotive+.30*corporate)*0.000010+
    diffusion(region,byId,AUTOMOBILE_TECH_ID,0.00030)*(.25+.75*machining);
  const assembly=tech.has(ASSEMBLY_LINE_TECH_ID)?0:
    industry*(.35+.35*standardisation+.20*admin+.10*corporate)*0.000008+
    diffusion(region,byId,ASSEMBLY_LINE_TECH_ID,0.00024)*(.25+.75*industry);
  const advancedReady=industry>.32||tech.has(ASSEMBLY_LINE_TECH_ID);
  const advanced=tech.has(ADVANCED_FACTORY_TECH_ID)||!advancedReady?0:
    industry*machining*(.30+.22*admin+.18*corporate+.30*clamp(region.electricity?.industrialCoverage||0))*0.000006+
    diffusion(region,byId,ADVANCED_FACTORY_TECH_ID,0.00018)*(.20+.80*industry);
  return {automobile:clamp(automobile),assembly:clamp(assembly),advanced:clamp(advanced)};
}

export function ensureIndustrialProduction(region){
  region.industrialProduction||={};
  const s=region.industrialProduction;
  if(!Number.isFinite(s.standardisationExperience))s.standardisationExperience=0;
  if(!Number.isFinite(s.factorySophistication))s.factorySophistication=0;
  if(!Number.isFinite(s.motorisationReadiness))s.motorisationReadiness=0;
  return s;
}

export function industrialProductionMultipliers(region){
  const tech=region.unlockedTechIds||new Set();
  const s=ensureIndustrialProduction(region);
  const assembly=tech.has(ASSEMBLY_LINE_TECH_ID)?1:0;
  const advanced=tech.has(ADVANCED_FACTORY_TECH_ID)?1:0;
  return {
    standardisedGoods:1+assembly*(.20+.25*s.factorySophistication)+advanced*(.12+.18*s.factorySophistication),
    machinery:1+assembly*.10+advanced*(.18+.22*s.factorySophistication),
    labourProductivity:1+assembly*.12+advanced*.16,
  };
}

export function tickIndustrialProduction(regions,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  for(const region of regions||[]){
    const s=ensureIndustrialProduction(region); const tech=region.unlockedTechIds||new Set();
    const industry=industrialReadiness(region);
    if(industry>.12)s.standardisationExperience=clamp(s.standardisationExperience+years*(.018+industry*.045)*(1-s.standardisationExperience));
    if(tech.has(ADVANCED_FACTORY_TECH_ID))s.factorySophistication=clamp(s.factorySophistication+years*(.025+industry*.075)*(1-s.factorySophistication));
    if(tech.has(AUTOMOBILE_TECH_ID))s.motorisationReadiness=clamp(s.motorisationReadiness+years*(.018+industry*.06)*(1-s.motorisationReadiness));
    tickIndustrialInvestment(region,elapsedDays);
  }
}

export function tickIndustrialProductionBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  tickIndustrialProduction(regions,elapsedDays);
  const events=[]; const byId=new Map((regions||[]).map(r=>[r.id,r]));
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set(); ensureIndustrialProduction(region);
    const c=industrialProductionBreakthroughChances(region,byId);
    const attempts=[
      ['automobile',AUTOMOBILE_TECH_ID,'automobile_breakthrough','Practical automobile','Engineers have developed a practical self-propelled road vehicle.'],
      ['assembly',ASSEMBLY_LINE_TECH_ID,'assembly_line_breakthrough','Assembly-line production','Manufacturers have learned to organise sequential, standardised high-volume production.'],
      ['advanced',ADVANCED_FACTORY_TECH_ID,'advanced_factory_breakthrough','Advanced factory organisation','Factories can now combine specialised machine tools, powered layouts, quality control and more sophisticated production management.'],
    ];
    for(const [key,id,type,title,message] of attempts){
      if(region.unlockedTechIds.has(id)||rng()>=weekly(c[key],elapsedDays))continue;
      region.unlockedTechIds.add(id); events.push({type,regionId:region.id,regionName:region.name,tick:currentTick,title,message:`${region.name}: ${message}`}); break;
    }
  }
  return events;
}
