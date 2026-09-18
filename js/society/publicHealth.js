import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const PUBLIC_BED_BUILD_COST=0.7;
const PUBLIC_BED_WOOD=0.06;
const PUBLIC_BED_MINERAL=0.10;
const BED_ANNUAL_OPERATING_COST=0.08;

function stateCapacity(region){return clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.35);}
function literacy(region){return clamp(region.publicEducation?.literacy ?? region.educationLevel ?? 0);}
function urbanPopulation(region){return Math.max(0,Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation)||0);}
function urbanShare(region){return clamp(urbanPopulation(region)/Math.max(1,Number(region.population)||1));}
function wealthSignal(region){return clamp(Math.log10(1+Math.max(0,Number(region.wallet)||0))/5);}

export function ensurePublicHealth(region){
  region.publicHealth ||= {};
  const s=region.publicHealth;
  if(!Number.isFinite(s.publicHospitalBudgetShare))s.publicHospitalBudgetShare=0;
  if(!Number.isFinite(s.publicHealthAdministration))s.publicHealthAdministration=0;
  if(!Number.isFinite(s.publicBeds))s.publicBeds=0;
  if(!Number.isFinite(s.charitableBeds))s.charitableBeds=0;
  if(!Number.isFinite(s.operationalBeds))s.operationalBeds=0;
  if(!Number.isFinite(s.staffingRatio))s.staffingRatio=0;
  if(!Number.isFinite(s.fundingRatio))s.fundingRatio=0;
  if(!Number.isFinite(s.occupancyPressure))s.occupancyPressure=0;
  if(!Number.isFinite(s.hospitalSpend))s.hospitalSpend=0;
  if(!Number.isFinite(s.hospitalBuildSpend))s.hospitalBuildSpend=0;
  if(!Number.isFinite(s.publicBedsBuilt))s.publicBedsBuilt=0;
  if(typeof s.playerLocked!=='boolean')s.playerLocked=false;
  return s;
}

export function publicHealthEligibility(region){
  const share=urbanShare(region),capacity=stateCapacity(region),literate=literacy(region);
  return {
    charitableCare:share>=0.025,
    publicHealthAdministration:share>=0.06&&capacity>=0.35&&literate>=0.04,
    publicHospitals:share>=0.10&&capacity>=0.50&&literate>=0.10,
    urbanShare:share,stateCapacity:capacity,literacy:literate,
  };
}

export function setPublicHealthPolicy(region,patch={}, {playerChoice=false}={}){
  const s=ensurePublicHealth(region),e=publicHealthEligibility(region);
  if(patch.publicHealthAdministration!==undefined&&e.publicHealthAdministration)s.publicHealthAdministration=clamp(patch.publicHealthAdministration);
  if(patch.publicHospitalBudgetShare!==undefined&&e.publicHospitals)s.publicHospitalBudgetShare=clamp(patch.publicHospitalBudgetShare,0,0.12);
  if(playerChoice)s.playerLocked=true;
  return {state:s,eligibility:e};
}

function updateCharitableBeds(region,s,weeks){
  const e=publicHealthEligibility(region);
  if(!e.charitableCare)return;
  const target=urbanPopulation(region)*(0.0004+0.0016*wealthSignal(region));
  const adjustment=Math.min(1,weeks/52*0.35);
  s.charitableBeds += (target-s.charitableBeds)*adjustment;
  s.charitableBeds=Math.max(0,s.charitableBeds);
}

function consumeMaterials(region,desiredBeds){
  if(desiredBeds<=0)return 0;
  const stock=region.stockpile ||= {};
  const byWood=Math.max(0,Number(stock.wood)||0)/PUBLIC_BED_WOOD;
  const mineral=Math.max(0,Number(stock.stone)||0)+Math.max(0,Number(stock.clay)||0);
  const byMineral=mineral/PUBLIC_BED_MINERAL;
  const beds=Math.max(0,Math.min(desiredBeds,byWood,byMineral));
  if(beds<=0)return 0;
  stock.wood=Math.max(0,(Number(stock.wood)||0)-beds*PUBLIC_BED_WOOD);
  let needed=beds*PUBLIC_BED_MINERAL;
  const stone=Math.min(Math.max(0,Number(stock.stone)||0),needed);stock.stone=Math.max(0,(Number(stock.stone)||0)-stone);needed-=stone;
  const clay=Math.min(Math.max(0,Number(stock.clay)||0),needed);stock.clay=Math.max(0,(Number(stock.clay)||0)-clay);
  return beds;
}

function buildPublicBeds(region,s,weeks){
  s.publicBedsBuilt=0;s.hospitalBuildSpend=0;
  if(s.publicHospitalBudgetShare<=0)return;
  const pop=Math.max(1,Number(region.population)||1);
  const targetBeds=pop*(0.0005+0.0045*s.publicHospitalBudgetShare/0.12);
  const need=Math.max(0,targetBeds-s.publicBeds);
  if(need<=0)return;
  const treasury=Math.max(0,Number(region.treasury)||0);
  const constructionBudget=Math.min(treasury,treasury*s.publicHospitalBudgetShare*weeks/52*0.45);
  const byMoney=constructionBudget/PUBLIC_BED_BUILD_COST;
  const beds=consumeMaterials(region,Math.min(need,byMoney));
  const spend=beds*PUBLIC_BED_BUILD_COST;
  region.treasury=Math.max(0,treasury-spend);
  s.publicBeds+=beds;s.publicBedsBuilt=beds;s.hospitalBuildSpend=spend;
}

function operateHospitals(region,s,weeks){
  const totalBeds=Math.max(0,s.charitableBeds+s.publicBeds);
  const literacySignal=literacy(region);
  const admin=stateCapacity(region);
  s.staffingRatio=clamp(0.18+literacySignal*0.78+admin*0.18);
  const desiredCost=totalBeds*BED_ANNUAL_OPERATING_COST*weeks/52*(0.45+0.55*s.staffingRatio);
  const treasury=Math.max(0,Number(region.treasury)||0);
  const publicShare=totalBeds>0?s.publicBeds/totalBeds:0;
  const stateCost=desiredCost*publicShare;
  const paid=Math.min(treasury,stateCost);
  region.treasury=Math.max(0,treasury-paid);
  s.hospitalSpend=paid;
  const charitableFunding=1-publicShare*0.35;
  s.fundingRatio=desiredCost>0?clamp((paid+desiredCost*(1-publicShare)*charitableFunding)/desiredCost):0;
  s.operationalBeds=totalBeds*clamp(Math.min(s.staffingRatio,s.fundingRatio));
}

function maybeNpcAdopt(region,s){
  if(s.playerLocked)return;
  const e=publicHealthEligibility(region);
  const diseaseBurden=Object.values(region.disease?.pathogens||{}).reduce((sum,p)=>sum+(Number(p?.prevalence)||0),0);
  const healthRisk=clamp(region.urbanHealthRisk);
  if(e.publicHealthAdministration&&(healthRisk>0.08||diseaseBurden>0.01))s.publicHealthAdministration=Math.max(s.publicHealthAdministration,healthRisk>0.2?0.7:0.35);
  if(e.publicHospitals&&(diseaseBurden>0.008||healthRisk>0.12)&&Math.max(0,Number(region.treasury)||0)>4)s.publicHospitalBudgetShare=Math.max(s.publicHospitalBudgetShare,diseaseBurden>0.03?0.06:0.025);
  if(diseaseBurden<0.002&&healthRisk<0.05)s.publicHospitalBudgetShare=Math.max(0,s.publicHospitalBudgetShare-0.002);
}

export function tickPublicHealth(region,elapsedDays=7,{isPlayer=false}={}){
  const s=ensurePublicHealth(region);const weeks=Math.max(0.01,elapsedWeeks(elapsedDays));
  if(!isPlayer)maybeNpcAdopt(region,s);
  updateCharitableBeds(region,s,weeks);
  buildPublicBeds(region,s,weeks);
  operateHospitals(region,s,weeks);
  region.publicHealthReport={
    publicHealthAdministration:s.publicHealthAdministration,publicHospitalBudgetShare:s.publicHospitalBudgetShare,
    publicBeds:s.publicBeds,charitableBeds:s.charitableBeds,operationalBeds:s.operationalBeds,
    staffingRatio:s.staffingRatio,fundingRatio:s.fundingRatio,occupancyPressure:s.occupancyPressure,
    hospitalSpend:s.hospitalSpend,hospitalBuildSpend:s.hospitalBuildSpend,publicBedsBuilt:s.publicBedsBuilt,
  };
  return region.publicHealthReport;
}

const PATHOGEN_TREATABILITY={smallpox:0.28,plague:0.22,enteric:0.48,respiratory:0.42};

export function hospitalTreatmentEffect(region,pathogenId,prevalence){
  const s=ensurePublicHealth(region);
  const population=Math.max(1,Number(region.population)||1);
  const activeCases=Math.max(0,population*(Number(prevalence)||0));
  const beds=Math.max(0,s.operationalBeds);
  const weeklyBedNeed=activeCases*0.18;
  const bedCoverage=weeklyBedNeed>0?clamp(beds/weeklyBedNeed):0;
  s.occupancyPressure=bedCoverage>0?clamp(1/Math.max(0.01,bedCoverage),0,4):4;
  const medicalKnowledge=clamp(0.10+literacy(region)*0.55+stateCapacity(region)*0.10);
  const treatability=PATHOGEN_TREATABILITY[pathogenId]??0.25;
  return clamp(bedCoverage*s.staffingRatio*s.fundingRatio*medicalKnowledge*treatability,0,0.65);
}

export function publicHealthPreventionEffect(region){
  const s=ensurePublicHealth(region);
  const admin=clamp(s.publicHealthAdministration*stateCapacity(region));
  const sanitation=clamp(region.urbanHousing?.sanitationLevel||0);
  return clamp(admin*0.16+sanitation*admin*0.12,0,0.28);
}
