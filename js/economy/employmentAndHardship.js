import { localPrice } from './prices.js?v=20260904-weather1';
import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';
import { availableResidentHousing } from './housing.js?v=20260916-housing1';
import { tickUrbanHousing } from '../society/urbanHousing.js?v=20260918-urban-housing1';
import { tickSocialProtection } from '../society/socialProtection.js?v=20260918-social1';
import { tickLabourRelations } from '../society/labourRelations.js?v=20260918-labour-relations1';
import '../ui/socialProtectionUi.js?v=20260918-social1';
import '../ui/labourRelationsUi.js?v=20260918-labour-relations1';
import '../ui/urbanHousingUi.js?v=20260918-urban-housing1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const WARNING_RATE=0.10;
const SEVERE_RATE=0.18;
const OCCUPATION_EXCLUSIONS=new Set(['general','artStudent']);

function occupationEmployment(region){
  let total=0;
  for(const [key,value] of Object.entries(region.occupations||{})){
    if(OCCUPATION_EXCLUSIONS.has(key))continue;
    total+=Math.max(0,Number(value)||0);
  }
  return total;
}

function teenStudents(region){
  const education=region.publicEducation||{};
  const mandatory=Math.max(0,Number(education.mandatoryYears)||0);
  if(mandatory<=8)return 0;
  const workingAge=Math.max(0,Number(region.demographics?.workingAge)||0);
  const teenYears=Math.min(5,mandatory-8);
  const potential=workingAge/45*teenYears;
  const attendance=clamp(education.attendanceRatio||0);
  return Math.min(workingAge,potential*attendance);
}

function formalLabourShare(region){
  const urbanPop=Math.max(0,Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation)||0);
  const urbanShare=clamp(urbanPop/Math.max(1,region.population||1));
  const finance=clamp(region.corporateCapital?.financialDepth||0);
  const industry=clamp((region.structuralTransformation?.industrialShare||0)+(region.structuralTransformation?.serviceShare||0),0,1);
  const cashEconomy=clamp(Math.log1p(Math.max(0,region.tradeEconomy?.weeklyExports||0)+Math.max(0,region.tradeEconomy?.weeklyImports||0))/10);
  return clamp(0.08+urbanShare*0.34+finance*0.22+industry*0.24+cashEconomy*0.12,0.08,0.96);
}

export function ensureEmploymentState(region){
  region.employment ||= {};
  const e=region.employment;
  for(const [key,value] of Object.entries({employed:0,unemployed:0,labourForce:0,unemploymentRate:0,underemployed:0,formalLabourShare:0,hardship:0,povertyPressure:0,consumptionPressure:0,migrationPressure:0,lastWarningTick:-Infinity})){
    if(!Number.isFinite(e[key]))e[key]=value;
  }
  if(!e.causes||typeof e.causes!=='object')e.causes={};
  return e;
}

function employmentAssessment(region){
  const workingAge=Math.max(0,Number(region.demographics?.workingAge)||0);
  const students=teenStudents(region);
  const availableAdults=Math.max(0,workingAge-students);
  const employed=Math.min(availableAdults,occupationEmployment(region));
  const general=Math.max(0,Number(region.occupations?.general)||0);
  const formalShare=formalLabourShare(region);
  const housingBlocked=Math.max(0,Number(region.report?.housing?.blockedWorkers)||0);
  const bankContraction=clamp(region.bankingSystem?.creditContraction||0);
  const firmFailure=clamp(region.corporateCapital?.failedFirmPressure||0);
  const tradeDisruption=clamp(region.tradeEconomy?.tradeDisruption||0);
  const hiringPenalty=clamp(region.labourRelations?.hiringPenalty||0);
  const joblessPool=Math.max(0,availableAdults-employed);
  const involuntaryFromGeneral=Math.min(joblessPool,general*formalShare);
  const cyclicalRate=clamp(bankContraction*0.12+firmFailure*0.10+tradeDisruption*0.08+hiringPenalty);
  const cyclical=Math.min(joblessPool,availableAdults*cyclicalRate);
  const unemployed=Math.min(joblessPool,Math.max(involuntaryFromGeneral,cyclical)+housingBlocked*0.7);
  const underemployed=Math.max(0,joblessPool-unemployed)*formalShare*0.35;
  const labourForce=Math.max(1,employed+unemployed);
  return {workingAge,students,availableAdults,employed,unemployed,underemployed,labourForce,unemploymentRate:clamp(unemployed/labourForce),formalShare,housingBlocked,bankContraction,firmFailure,tradeDisruption,hiringPenalty};
}

function hardshipAssessment(region,employment){
  const foodPrice=Math.max(0.01,localPrice(region,'food'));
  const wealthPerPerson=Math.max(0,Number(region.wallet)||0)/Math.max(1,region.population||1);
  const foodStress=clamp((foodPrice-1)/4);
  const lowWealth=clamp(1-Math.log1p(wealthPerPerson)/3.2);
  const housingShortage=clamp(Math.max(0,-availableResidentHousing(region))/Math.max(1,region.population||1)*8);
  const creditStress=clamp((region.medievalCommerce?.finance?.creditCrisis||0)*0.7+(region.bankingSystem?.creditContraction||0)*0.5);
  const unemployment=employment.unemploymentRate;
  const hardship=clamp(unemployment*0.44+foodStress*0.20+lowWealth*0.18+housingShortage*0.08+creditStress*0.10);
  const povertyPressure=clamp(hardship*0.8+unemployment*0.2);
  return {hardship,povertyPressure,foodStress,lowWealth,housingShortage,creditStress};
}

export function employmentSummary(region){
  const e=ensureEmploymentState(region);
  return {employed:e.employed,unemployed:e.unemployed,underemployed:e.underemployed,labourForce:e.labourForce,unemploymentRate:e.unemploymentRate,hardship:e.hardship,povertyPressure:e.povertyPressure,migrationPressure:e.migrationPressure,causes:{...e.causes}};
}

export function tickEmploymentAndHardship(regions,currentTick=0,elapsedDays=7,{playerPolityId=null,religiousWorld=null}={}){
  const events=[];
  const weeks=Math.max(0.01,elapsedWeeks(elapsedDays));
  const world=religiousWorld||globalThis.__worldsim?.religiousWorld||null;
  for(const region of regions){
    const previous=ensureEmploymentState(region);
    const beforeRate=previous.unemploymentRate;
    const a=employmentAssessment(region);
    const h=hardshipAssessment(region,a);
    const polityId=region.governance?.sovereignPolityId||region.polityId||null;
    const isPlayer=polityId===playerPolityId;
    const urban=tickUrbanHousing(region,currentTick,elapsedDays,{isPlayer});
    h.hardship=clamp(h.hardship+(urban.hardshipPenalty||0));
    h.povertyPressure=clamp(h.povertyPressure+(urban.hardshipPenalty||0)*0.8);
    previous.employed=a.employed;
    previous.unemployed=a.unemployed;
    previous.underemployed=a.underemployed;
    previous.labourForce=a.labourForce;
    previous.unemploymentRate=a.unemploymentRate;
    previous.formalLabourShare=a.formalShare;
    previous.hardship+=(h.hardship-previous.hardship)*clamp(weeks/6);
    previous.povertyPressure+=(h.povertyPressure-previous.povertyPressure)*clamp(weeks/8);
    previous.consumptionPressure=clamp(previous.hardship*0.72+previous.unemploymentRate*0.28);
    previous.migrationPressure=clamp(Math.max(previous.unemploymentRate*0.48+previous.hardship*0.52,urban.migrationPenalty||0));
    previous.causes={housing:a.housingBlocked,urbanHousing:urban.slumPressure||0,rentPressure:urban.rentPressure||0,credit:a.bankContraction,firmFailures:a.firmFailure,tradeDisruption:a.tradeDisruption,foodPrices:h.foodStress,lowWealth:h.lowWealth,minimumWageHiring:a.hiringPenalty};

    const protection=tickSocialProtection(region,currentTick,elapsedDays,{religiousWorld:world,isPlayer});
    const labourEvents=tickLabourRelations(region,currentTick,elapsedDays,{isPlayer});
    if(labourEvents.length)events.push(...labourEvents.filter(e=>!isPlayer||e.polityId===playerPolityId));

    const wealthDrain=Math.min(Math.max(0,region.wallet||0),Math.max(0,region.population||0)*0.0015*previous.consumptionPressure*weeks);
    region.wallet=Math.max(0,(region.wallet||0)-wealthDrain);
    region.stability=clamp((region.stability??0.6)-previous.hardship*0.0035*weeks+(previous.hardship<0.08?0.0015*weeks:0));
    region.householdDemandMultiplier=clamp(1-previous.consumptionPressure*0.38,0.55,1.05);
    region.migrationPressure=clamp(Math.max(region.migrationPressure||0,previous.migrationPressure));
    region.report ||= {};
    region.report.employment=employmentSummary(region);
    region.report.socialProtection=protection;
    region.report.urbanHousing=urban;

    const rising=a.unemploymentRate-beforeRate>=0.035;
    const severe=a.unemploymentRate>=SEVERE_RATE;
    const warning=a.unemploymentRate>=WARNING_RATE&&rising;
    if((severe||warning)&&isPlayer&&currentTick-previous.lastWarningTick>=13){
      previous.lastWarningTick=currentTick;
      const causes=[];
      if(a.bankContraction>.15)causes.push('credit is contracting');
      if(a.firmFailure>.15)causes.push('business failures are destroying jobs');
      if(a.tradeDisruption>.12)causes.push('trade disruption is cutting demand');
      if(a.housingBlocked>5)causes.push('housing shortages are blocking workers from taking jobs');
      if(a.hiringPenalty>.03)causes.push('the wage floor is outrunning current productivity');
      if(!causes.length)causes.push('the modern wage economy is not creating enough paid work');
      events.push({type:'unemployment_warning',regionId:region.id,polityId,regionName:region.name,unemploymentRate:a.unemploymentRate,hardship:previous.hardship,employed:a.employed,unemployed:a.unemployed,causes,severe,reliefCoverage:protection.coverage});
    }
  }
  return events;
}
