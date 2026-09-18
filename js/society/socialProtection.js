import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const BASE_WEEKLY_SUPPORT=0.035;
const BASE_WEEKLY_PENSION=0.024;
const BASE_WEEKLY_CONTRIBUTION_WAGE=0.12;

function stateCapacity(region){return clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.35,0,1);}
function literacy(region){return clamp(region.publicEducation?.literacy ?? region.educationLevel ?? 0);}

export function ensureSocialProtection(region){
  region.socialProtection ||= {};
  const s=region.socialProtection;
  if(!s.poorRelief)s.poorRelief='charity';
  if(!Number.isFinite(s.unemploymentReplacementRate))s.unemploymentReplacementRate=0;
  if(!Number.isFinite(s.pensionReplacementRate))s.pensionReplacementRate=0;
  if(!Number.isFinite(s.contributionRate))s.contributionRate=0;
  if(!Number.isFinite(s.insuranceFund))s.insuranceFund=0;
  if(!Number.isFinite(s.lastChurchRelief))s.lastChurchRelief=0;
  if(!Number.isFinite(s.lastStateRelief))s.lastStateRelief=0;
  if(!Number.isFinite(s.lastInsuranceBenefits))s.lastInsuranceBenefits=0;
  if(!Number.isFinite(s.lastPensionBenefits))s.lastPensionBenefits=0;
  if(!Number.isFinite(s.lastContributions))s.lastContributions=0;
  if(!Number.isFinite(s.coverage))s.coverage=0;
  if(!Number.isFinite(s.unfundedBenefits))s.unfundedBenefits=0;
  if(!Number.isFinite(s.familyBuffer))s.familyBuffer=0;
  if(typeof s.playerLocked!=='boolean')s.playerLocked=false;
  return s;
}

export function socialProtectionEligibility(region){
  const employment=region.employment||{};
  const formal=clamp(employment.formalLabourShare||0);
  const capacity=stateCapacity(region);
  const literate=literacy(region);
  return {
    poorRelief:true,
    unemploymentInsurance:formal>=0.35&&capacity>=0.45&&literate>=0.12,
    pensions:formal>=0.3&&capacity>=0.5&&literate>=0.16,
    formalLabourShare:formal,
    stateCapacity:capacity,
    literacy:literate,
  };
}

export function setSocialProtectionPolicy(region,patch={}, {playerChoice=false}={}){
  const s=ensureSocialProtection(region);const eligibility=socialProtectionEligibility(region);
  const allowedRelief=new Set(['none','charity','mixed','state']);
  if(patch.poorRelief!==undefined&&allowedRelief.has(patch.poorRelief))s.poorRelief=patch.poorRelief;
  if(patch.unemploymentReplacementRate!==undefined&&eligibility.unemploymentInsurance)s.unemploymentReplacementRate=clamp(patch.unemploymentReplacementRate,0,0.7);
  if(patch.pensionReplacementRate!==undefined&&eligibility.pensions)s.pensionReplacementRate=clamp(patch.pensionReplacementRate,0,0.55);
  if(patch.contributionRate!==undefined)s.contributionRate=clamp(patch.contributionRate,0,0.18);
  if(playerChoice)s.playerLocked=true;
  return {changed:true,state:s,eligibility};
}

function matchingAuthorities(region,religiousWorld){
  if(!religiousWorld?.authorities?.length)return [];
  const shares=region.religion?.shares||{};
  return religiousWorld.authorities
    .filter(a=>a?.active!==false&&a.religionId&&Number(a.treasury)>0&&(shares[a.religionId]||0)>0.02)
    .map(a=>({authority:a,share:clamp(shares[a.religionId]||0)}))
    .sort((a,b)=>b.share-a.share);
}

function churchRelief(region,s,religiousWorld,weeks,need){
  if(!['charity','mixed'].includes(s.poorRelief)||need<=0)return 0;
  let remaining=need,spent=0;
  for(const {authority,share} of matchingAuthorities(region,religiousWorld)){
    if(remaining<=0)break;
    const liquidityLimit=Math.max(0,authority.treasury||0)*Math.min(0.08,0.012*weeks);
    const desired=need*share*(0.35+clamp(authority.prestige||0)*0.45);
    const contribution=Math.min(remaining,liquidityLimit,desired);
    authority.treasury=Math.max(0,(authority.treasury||0)-contribution);
    remaining-=contribution;spent+=contribution;
  }
  return spent;
}

function statePoorRelief(region,s,weeks,needAfterChurch){
  if(!['mixed','state'].includes(s.poorRelief)||needAfterChurch<=0)return 0;
  const capacity=stateCapacity(region);
  const targetShare=s.poorRelief==='state'?(0.45+capacity*0.4):(0.18+capacity*0.26);
  const desired=needAfterChurch*targetShare;
  const available=Math.max(0,region.treasury||0);
  const spend=Math.min(available,desired);
  region.treasury=Math.max(0,available-spend);
  return spend;
}

function familyBuffer(region,s,need){
  const wealth=Math.max(0,region.wallet||0);
  const informal=1-clamp(region.employment?.formalLabourShare||0);
  const capacity=clamp(Math.log1p(wealth/Math.max(1,region.population||1))/1.8)*0.35+informal*0.18;
  const buffered=need*clamp(capacity,0,0.45);
  s.familyBuffer=buffered;
  return buffered;
}

function collectContributions(region,s,weeks){
  const employed=Math.max(0,region.employment?.employed||0);
  if(s.contributionRate<=0||employed<=0){s.lastContributions=0;return 0;}
  const gross=employed*BASE_WEEKLY_CONTRIBUTION_WAGE*s.contributionRate*weeks;
  const householdTarget=gross*0.65;
  const employerTarget=gross-householdTarget;
  const fromHouseholds=Math.min(Math.max(0,region.wallet||0),householdTarget);
  region.wallet=Math.max(0,(region.wallet||0)-fromHouseholds);
  const employerAvailable=Math.max(0,region.corporateCapital?.retainedEarnings||0);
  const fromEmployers=Math.min(employerAvailable,employerTarget);
  if(region.corporateCapital)region.corporateCapital.retainedEarnings=employerAvailable-fromEmployers;
  const collected=fromHouseholds+fromEmployers;
  s.insuranceFund+=collected;s.lastContributions=collected;
  return collected;
}

function payInsurance(region,s,weeks){
  const unemployed=Math.max(0,region.employment?.unemployed||0);
  const elderly=Math.max(0,region.demographics?.elderly||0);
  const unemploymentDue=unemployed*BASE_WEEKLY_SUPPORT*s.unemploymentReplacementRate*weeks;
  const pensionDue=elderly*BASE_WEEKLY_PENSION*s.pensionReplacementRate*weeks;
  const totalDue=unemploymentDue+pensionDue;
  if(totalDue<=0){s.lastInsuranceBenefits=0;s.lastPensionBenefits=0;s.unfundedBenefits=0;return 0;}
  let available=s.insuranceFund;
  const fundPaid=Math.min(available,totalDue);s.insuranceFund=Math.max(0,available-fundPaid);
  let remaining=totalDue-fundPaid;
  const stateTopup=Math.min(Math.max(0,region.treasury||0),remaining*stateCapacity(region));
  region.treasury=Math.max(0,(region.treasury||0)-stateTopup);remaining-=stateTopup;
  const paid=totalDue-remaining;
  const ratio=totalDue>0?paid/totalDue:0;
  s.lastInsuranceBenefits=unemploymentDue*ratio;
  s.lastPensionBenefits=pensionDue*ratio;
  s.unfundedBenefits=remaining;
  region.wallet=(region.wallet||0)+paid;
  return paid;
}

function maybeNpcAdopt(region,s){
  if(s.playerLocked)return;
  const e=socialProtectionEligibility(region);const hardship=clamp(region.employment?.hardship||0);const unemployment=clamp(region.employment?.unemploymentRate||0);
  if(hardship>0.09&&s.poorRelief==='charity'&&e.stateCapacity>0.35)s.poorRelief='mixed';
  if(hardship>0.16&&e.stateCapacity>0.58)s.poorRelief='state';
  if(e.unemploymentInsurance&&unemployment>0.07){
    s.unemploymentReplacementRate=Math.max(s.unemploymentReplacementRate,unemployment>0.16?0.4:0.22);
    s.contributionRate=Math.max(s.contributionRate,unemployment>0.16?0.07:0.045);
  }
  if(e.pensions&&e.stateCapacity>0.65&&region.publicEducation?.mandatoryYears>=6){
    s.pensionReplacementRate=Math.max(s.pensionReplacementRate,0.16);
    s.contributionRate=Math.max(s.contributionRate,0.05);
  }
}

export function tickSocialProtection(region,currentTick=0,elapsedDays=7,{religiousWorld=null,isPlayer=false}={}){
  const s=ensureSocialProtection(region);if(!isPlayer)maybeNpcAdopt(region,s);
  const weeks=Math.max(0.01,elapsedWeeks(elapsedDays));
  collectContributions(region,s,weeks);
  const insurancePaid=payInsurance(region,s,weeks);
  const hardship=clamp(region.employment?.hardship||0);
  const need=Math.max(0,region.population||0)*BASE_WEEKLY_SUPPORT*hardship*weeks;
  const family=familyBuffer(region,s,need);
  const church=churchRelief(region,s,religiousWorld,weeks,Math.max(0,need-family));
  const state=statePoorRelief(region,s,weeks,Math.max(0,need-family-church));
  const relief=family+church+state+insurancePaid;
  const coverage=need>0?clamp(relief/need):0;
  s.lastChurchRelief=church;s.lastStateRelief=state;s.coverage=coverage;s.lastTick=currentTick;
  // Relief cannot erase the underlying labour-market problem, but it cushions
  // consumption, household balance sheets and the stability shock while active.
  if(region.employment){
    region.employment.hardship=clamp(region.employment.hardship*(1-coverage*0.48));
    region.employment.povertyPressure=clamp(region.employment.povertyPressure*(1-coverage*0.55));
    region.employment.consumptionPressure=clamp(region.employment.consumptionPressure*(1-coverage*0.5));
  }
  region.socialProtectionReport={
    poorRelief:s.poorRelief,coverage:s.coverage,familyRelief:family,churchRelief:church,stateRelief:state,
    unemploymentBenefits:s.lastInsuranceBenefits,pensions:s.lastPensionBenefits,contributions:s.lastContributions,
    insuranceFund:s.insuranceFund,unfundedBenefits:s.unfundedBenefits,
  };
  return region.socialProtectionReport;
}

export function socialProtectionSummary(region){
  const s=ensureSocialProtection(region);return {...(region.socialProtectionReport||{}),poorRelief:s.poorRelief,coverage:s.coverage,insuranceFund:s.insuranceFund,
    unemploymentReplacementRate:s.unemploymentReplacementRate,pensionReplacementRate:s.pensionReplacementRate,contributionRate:s.contributionRate};
}
