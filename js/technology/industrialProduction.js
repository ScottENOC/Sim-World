import { PETROLEUM_REFINING_TECH_ID } from './petroleum.js?v=20260917-oil1';
import { industrialFactoryCapacity } from '../economy/industrialPlant.js?v=20260919-components1';
import { tickIndustrialInvestment } from '../economy/industrialInvestment.js?v=20260919-investment1';
import { TRACTOR_TECH_ID, COMBINE_TECH_ID, tickAgriculturalMachinery } from '../economy/agriculturalMachinery.js?v=20260921-farm-machinery1';
import { INDUSTRIAL_AMMONIA_TECH_ID, SYNTHETIC_FERTILISER_TECH_ID, agriculturalChemistryBreakthroughChances, tickAgriculturalFertiliser } from '../economy/agriculturalFertiliser.js?v=20260921-fertiliser1';
import { CHEMICAL_PEST_CONTROL_TECH_ID, SYNTHETIC_PESTICIDES_TECH_ID, pesticideBreakthroughChances, tickAgriculturalPesticides } from '../economy/agriculturalPesticides.js?v=20260921-synth-pesticides1';
import '../ui/industrialInvestmentUi.js?v=20260919-investment1';
import '../ui/militaryDesignUi.js?v=20260919-light-metal-designs1';

export const AUTOMOBILE_TECH_ID = 'automobile';
export const ASSEMBLY_LINE_TECH_ID = 'assembly_line_production';
export const ADVANCED_FACTORY_TECH_ID = 'advanced_factories';
export { TRACTOR_TECH_ID, COMBINE_TECH_ID, INDUSTRIAL_AMMONIA_TECH_ID, SYNTHETIC_FERTILISER_TECH_ID, CHEMICAL_PEST_CONTROL_TECH_ID, SYNTHETIC_PESTICIDES_TECH_ID };

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
  if(factoryCapacity<=0)return {automobile:0,assembly:0,advanced:0,tractor:0,combine:0};
  const industry=industrialReadiness(region);
  const machining=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const locomotive=clamp(region.industrialSupply?.capability?.locomotive_engineering||0);
  const admin=clamp(region.governance?.administrativeControl||region.governance?.administration?.recordKeeping||0);
  const corporate=clamp(region.corporateCapital?.financialDepth||0);
  const standardisation=clamp(region.industrialProduction?.standardisationExperience||region.industrialSupply?.exposure?.precision_machining||0);
  const hasRefining=tech.has(PETROLEUM_REFINING_TECH_ID);
  const components=region.industrialPlants?.componentCapability||{};
  const engine=clamp(components.engine||0),transmission=clamp(components.transmission||0),chassis=clamp(components.wheeled_chassis||0);
  const motorVehicleExperience=clamp(region.industrialPlants?.productExperience?.motor_vehicle||0);
  const tractorExperience=clamp(region.agriculturalMachinery?.tractorExperience||0);
  const farmerShare=clamp((region.occupations?.farmer||0)/Math.max(1,region.demographics?.workingAge||region.population||1));
  const arableScale=clamp(Math.log1p(Math.max(0,region.agriculturalLand?.availableArableHa||0))/14);

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

  const tractorReady=hasRefining&&tech.has(AUTOMOBILE_TECH_ID)&&engine>.08&&transmission>.06;
  const tractor=tech.has(TRACTOR_TECH_ID)||!tractorReady?0:
    industry*(.26+.24*engine+.18*transmission+.12*chassis+.10*motorVehicleExperience+.10*Math.max(farmerShare,arableScale*.4))*0.000010+
    diffusion(region,byId,TRACTOR_TECH_ID,0.00026)*(.30+.70*Math.max(engine,machining));

  const combineReady=tech.has(TRACTOR_TECH_ID)&&engine>.14&&machining>.18;
  const combine=tech.has(COMBINE_TECH_ID)||!combineReady?0:
    industry*(.24+.18*engine+.16*transmission+.18*standardisation+.14*tractorExperience+.10*arableScale)*0.000007+
    diffusion(region,byId,COMBINE_TECH_ID,0.00019)*(.25+.75*Math.max(machining,tractorExperience));
  return {automobile:clamp(automobile),assembly:clamp(assembly),advanced:clamp(advanced),tractor:clamp(tractor),combine:clamp(combine)};
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
    tickAgriculturalMachinery(region,elapsedDays);
    tickAgriculturalFertiliser(region,elapsedDays);
    tickAgriculturalPesticides(region,elapsedDays);
  }
}

export function tickIndustrialProductionBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  tickIndustrialProduction(regions,elapsedDays);
  const events=[]; const byId=new Map((regions||[]).map(r=>[r.id,r]));
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set(); ensureIndustrialProduction(region);
    const c=industrialProductionBreakthroughChances(region,byId);
    const chemistry=agriculturalChemistryBreakthroughChances(region,byId);
    const pesticide=pesticideBreakthroughChances(region,byId);
    const attempts=[
      ['automobile',AUTOMOBILE_TECH_ID,'automobile_breakthrough','Practical automobile','Engineers have developed a practical self-propelled road vehicle.'],
      ['tractor',TRACTOR_TECH_ID,'tractor_breakthrough','Internal-combustion tractor','Vehicle engineers and farmers have adapted reliable engines, transmissions and heavy chassis to sustained field work.'],
      ['combine',COMBINE_TECH_ID,'combine_harvester_breakthrough','Mechanised combine harvester','Manufacturers have integrated powered harvesting, threshing and mobile field machinery into a practical combine harvester.'],
      ['pesticide',CHEMICAL_PEST_CONTROL_TECH_ID,'chemical_pest_control_breakthrough','Chemical crop protection','Farmers and chemical producers have developed practical sulfur- and copper-based treatments that suppress severe crop pests and diseases.'],
      ['syntheticPesticide',SYNTHETIC_PESTICIDES_TECH_ID,'synthetic_pesticide_breakthrough','Synthetic pesticides','Petrochemical producers can now manufacture potent synthetic crop-protection chemicals at industrial scale.'],
      ['ammonia',INDUSTRIAL_AMMONIA_TECH_ID,'industrial_ammonia_breakthrough','Industrial ammonia synthesis','Chemical engineers can now fix atmospheric nitrogen into ammonia using high pressure, catalysts and large industrial energy inputs.'],
      ['fertiliser',SYNTHETIC_FERTILISER_TECH_ID,'synthetic_fertiliser_breakthrough','Synthetic nitrogen fertiliser','Industry can now convert ammonia into standardised nitrogen fertiliser for large-scale agricultural application.'],
      ['assembly',ASSEMBLY_LINE_TECH_ID,'assembly_line_breakthrough','Assembly-line production','Manufacturers have learned to organise sequential, standardised high-volume production.'],
      ['advanced',ADVANCED_FACTORY_TECH_ID,'advanced_factory_breakthrough','Advanced factory organisation','Factories can now combine specialised machine tools, powered layouts, quality control and more sophisticated production management.'],
    ];
    for(const [key,id,type,title,message] of attempts){
      const chance=key==='ammonia'||key==='fertiliser'?chemistry[key]:key==='pesticide'?pesticide.first:key==='syntheticPesticide'?pesticide.synthetic:c[key];
      if(region.unlockedTechIds.has(id)||rng()>=weekly(chance||0,elapsedDays))continue;
      region.unlockedTechIds.add(id); events.push({type,regionId:region.id,regionName:region.name,tick:currentTick,title,message:`${region.name}: ${message}`}); break;
    }
  }
  return events;
}
