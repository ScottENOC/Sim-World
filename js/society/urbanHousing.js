import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';
import { ensureHousing, availableResidentHousing } from '../economy/housing.js?v=20260916-housing1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const MONEY_PER_PUBLIC_CAPACITY=0.12;
const WOOD_PER_PUBLIC_CAPACITY=0.04;
const MINERAL_PER_PUBLIC_CAPACITY=0.04;

function stateCapacity(region){return clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.35);}
function literacy(region){return clamp(region.publicEducation?.literacy ?? region.educationLevel ?? 0);}
function urbanPopulation(region){return Math.max(0,Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation)||0);}

export function ensureUrbanHousing(region){
  region.urbanHousing ||= {};
  const s=region.urbanHousing;
  if(!Number.isFinite(s.sanitationLevel))s.sanitationLevel=0;
  if(!Number.isFinite(s.buildingStandards))s.buildingStandards=0;
  if(!Number.isFinite(s.socialHousingBudgetShare))s.socialHousingBudgetShare=0;
  if(!Number.isFinite(s.overcrowding))s.overcrowding=0;
  if(!Number.isFinite(s.slumPressure))s.slumPressure=0;
  if(!Number.isFinite(s.healthRisk))s.healthRisk=0;
  if(!Number.isFinite(s.rentPressure))s.rentPressure=0;
  if(!Number.isFinite(s.lastUrbanPopulation))s.lastUrbanPopulation=urbanPopulation(region);
  if(!Number.isFinite(s.publicHousingBuilt))s.publicHousingBuilt=0;
  if(!Number.isFinite(s.sanitationSpend))s.sanitationSpend=0;
  if(!Number.isFinite(s.publicHousingSpend))s.publicHousingSpend=0;
  if(!Number.isFinite(s.publicHousingCapacity))s.publicHousingCapacity=0;
  if(typeof s.playerLocked!=='boolean')s.playerLocked=false;
  return s;
}

export function urbanHousingEligibility(region){
  const population=Math.max(1,Number(region.population)||1);
  const urbanShare=clamp(urbanPopulation(region)/population);
  const capacity=stateCapacity(region);
  const literate=literacy(region);
  return {
    sanitation:urbanShare>=0.05&&capacity>=0.28,
    buildingStandards:urbanShare>=0.08&&capacity>=0.38&&literate>=0.05,
    socialHousing:urbanShare>=0.12&&capacity>=0.52&&literate>=0.10,
    urbanShare,stateCapacity:capacity,literacy:literate,
  };
}

export function setUrbanHousingPolicy(region,patch={}, {playerChoice=false}={}){
  const s=ensureUrbanHousing(region),e=urbanHousingEligibility(region);
  if(patch.sanitationLevel!==undefined&&e.sanitation)s.sanitationLevel=clamp(patch.sanitationLevel,0,1);
  if(patch.buildingStandards!==undefined&&e.buildingStandards)s.buildingStandards=clamp(patch.buildingStandards,0,1);
  if(patch.socialHousingBudgetShare!==undefined&&e.socialHousing)s.socialHousingBudgetShare=clamp(patch.socialHousingBudgetShare,0,0.12);
  if(playerChoice)s.playerLocked=true;
  return {state:s,eligibility:e};
}

function consumePublicHousingMaterials(region,desiredCapacity){
  if(desiredCapacity<=0)return 0;
  const stock=region.stockpile ||= {};
  const byWood=Math.max(0,Number(stock.wood)||0)/WOOD_PER_PUBLIC_CAPACITY;
  const mineralStock=Math.max(0,Number(stock.stone)||0)+Math.max(0,Number(stock.clay)||0);
  const byMineral=mineralStock/MINERAL_PER_PUBLIC_CAPACITY;
  const capacity=Math.max(0,Math.min(desiredCapacity,byWood,byMineral));
  if(capacity<=0)return 0;
  stock.wood=Math.max(0,(Number(stock.wood)||0)-capacity*WOOD_PER_PUBLIC_CAPACITY);
  let mineral=capacity*MINERAL_PER_PUBLIC_CAPACITY;
  const stone=Math.min(Math.max(0,Number(stock.stone)||0),mineral);stock.stone=Math.max(0,(Number(stock.stone)||0)-stone);mineral-=stone;
  const clay=Math.min(Math.max(0,Number(stock.clay)||0),mineral);stock.clay=Math.max(0,(Number(stock.clay)||0)-clay);
  return capacity;
}

function fundSanitation(region,s,weeks,urbanPop){
  const desired=urbanPop*0.000035*s.sanitationLevel*weeks;
  const treasury=Math.max(0,Number(region.treasury)||0);
  const paid=Math.min(treasury,desired);
  region.treasury=treasury-paid;s.sanitationSpend=paid;
  return desired>0?clamp(paid/desired):0;
}

function buildSocialHousing(region,s,weeks,need){
  s.publicHousingBuilt=0;s.publicHousingSpend=0;
  if(s.socialHousingBudgetShare<=0||need<=0)return 0;
  const treasury=Math.max(0,Number(region.treasury)||0);
  const budget=Math.min(treasury,treasury*s.socialHousingBudgetShare*weeks/52);
  const byMoney=budget/MONEY_PER_PUBLIC_CAPACITY;
  const materialCapacity=consumePublicHousingMaterials(region,Math.min(need,byMoney));
  const spend=materialCapacity*MONEY_PER_PUBLIC_CAPACITY;
  region.treasury=Math.max(0,treasury-spend);
  if(materialCapacity>0){
    const housing=ensureHousing(region);
    housing.residentCapacity+=materialCapacity;
    housing.jobCapacity.urban=Math.max(0,Number(housing.jobCapacity.urban)||0)+materialCapacity*0.42;
    s.publicHousingCapacity+=materialCapacity;s.publicHousingBuilt=materialCapacity;s.publicHousingSpend=spend;
    housing.ownerShares ||= {households:1,domesticCorporations:0,foreignCorporations:0,state:0};
    const total=Math.max(1,housing.residentCapacity);
    housing.ownerShares.state=clamp(s.publicHousingCapacity/total);
    const remaining=1-housing.ownerShares.state;
    const nonState=(housing.ownerShares.households||0)+(housing.ownerShares.domesticCorporations||0)+(housing.ownerShares.foreignCorporations||0);
    if(nonState>0){
      housing.ownerShares.households=remaining*(housing.ownerShares.households||0)/nonState;
      housing.ownerShares.domesticCorporations=remaining*(housing.ownerShares.domesticCorporations||0)/nonState;
      housing.ownerShares.foreignCorporations=remaining*(housing.ownerShares.foreignCorporations||0)/nonState;
    }
  }
  return materialCapacity;
}

function maybeNpcAdopt(region,s,assessment){
  if(s.playerLocked)return;
  const e=urbanHousingEligibility(region);
  if(e.sanitation&&assessment.healthRisk>0.08)s.sanitationLevel=Math.max(s.sanitationLevel,assessment.healthRisk>0.2?0.65:0.3);
  if(e.buildingStandards&&assessment.slumPressure>0.13)s.buildingStandards=Math.max(s.buildingStandards,assessment.slumPressure>0.28?0.6:0.25);
  if(e.socialHousing&&assessment.overcrowding>0.12&&Math.max(0,region.treasury||0)>5)s.socialHousingBudgetShare=Math.max(s.socialHousingBudgetShare,assessment.overcrowding>0.3?0.06:0.025);
  if(assessment.overcrowding<0.04&&assessment.slumPressure<0.06)s.socialHousingBudgetShare=Math.max(0,s.socialHousingBudgetShare-0.005);
}

function assess(region,s,weeks){
  const population=Math.max(1,Number(region.population)||1);
  const urbanPop=urbanPopulation(region),urbanShare=clamp(urbanPop/population);
  const housing=ensureHousing(region);
  const vacancy=availableResidentHousing(region);
  const shortage=clamp(Math.max(0,population-housing.residentCapacity)/population*7);
  const blocked=clamp((Number(region.report?.housing?.blockedWorkers)||0)/population*12);
  const growth=Math.max(0,urbanPop-s.lastUrbanPopulation)/Math.max(1,urbanPop);
  const rapidGrowth=clamp(growth*18/Math.max(0.25,weeks));
  const overcrowding=clamp(shortage*0.7+blocked*0.15+rapidGrowth*0.15);
  const standards=s.buildingStandards;
  const rentPressure=clamp(shortage*0.55+blocked*0.15+urbanShare*0.22+rapidGrowth*0.18+standards*urbanShare*0.10-Math.max(0,vacancy)/population*4);
  const slumPressure=clamp(overcrowding*0.52+rentPressure*0.24+urbanShare*0.18+rapidGrowth*0.16-standards*0.20);
  const theoreticalHealthRisk=clamp(slumPressure*0.7+urbanShare*0.16);
  return {population,urbanPop,urbanShare,vacancy,shortage,blocked,rapidGrowth,overcrowding,rentPressure,slumPressure,theoreticalHealthRisk};
}

export function tickUrbanHousing(region,currentTick=0,elapsedDays=7,{isPlayer=false}={}){
  const s=ensureUrbanHousing(region);const weeks=Math.max(0.01,elapsedWeeks(elapsedDays));
  let a=assess(region,s,weeks);
  if(!isPlayer)maybeNpcAdopt(region,s,{...a,healthRisk:a.theoreticalHealthRisk});
  const sanitationFunding=fundSanitation(region,s,weeks,a.urbanPop);
  const sanitationEffect=clamp(s.sanitationLevel*sanitationFunding);
  const need=Math.max(0,a.population*1.035-ensureHousing(region).residentCapacity)+a.urbanPop*a.overcrowding*0.08;
  buildSocialHousing(region,s,weeks,need);
  a=assess(region,s,weeks);
  s.overcrowding=a.overcrowding;s.rentPressure=a.rentPressure;s.slumPressure=a.slumPressure;
  s.healthRisk=clamp(a.theoreticalHealthRisk*(1-sanitationEffect*0.72));
  s.lastUrbanPopulation=a.urbanPop;s.lastTick=currentTick;
  const hardshipPenalty=clamp(s.overcrowding*0.10+s.rentPressure*0.08+s.slumPressure*0.07,0,0.2);
  const migrationPenalty=clamp(s.overcrowding*0.16+s.slumPressure*0.11,0,0.25);
  region.urbanHealthRisk=s.healthRisk;
  region.urbanHousingReport={overcrowding:s.overcrowding,rentPressure:s.rentPressure,slumPressure:s.slumPressure,healthRisk:s.healthRisk,
    sanitationLevel:s.sanitationLevel,buildingStandards:s.buildingStandards,socialHousingBudgetShare:s.socialHousingBudgetShare,
    sanitationSpend:s.sanitationSpend,publicHousingSpend:s.publicHousingSpend,publicHousingBuilt:s.publicHousingBuilt,
    publicHousingCapacity:s.publicHousingCapacity,hardshipPenalty,migrationPenalty};
  return region.urbanHousingReport;
}

export function urbanHousingSummary(region){return {...(region.urbanHousingReport||{}),...ensureUrbanHousing(region)};}
