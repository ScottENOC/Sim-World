import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const pct=(v)=>clamp(v,0,1);

export const STRIKE_LAWS=Object.freeze({
  legal:{label:'Legal',suppression:0,repression:0},
  restricted:{label:'Restricted',suppression:.28,repression:.08},
  banned:{label:'Banned',suppression:.48,repression:.18},
});
export const POLICE_RESPONSES=Object.freeze({
  negotiate:{label:'Negotiate / keep police back',suppression:0,repression:-.025},
  keep_order:{label:'Police keep order',suppression:.22,repression:.045},
  disperse:{label:'Disperse pickets',suppression:.48,repression:.14},
  force:{label:'Break strike by force',suppression:.72,repression:.28},
});
export const BARGAINING_POLICIES=Object.freeze({
  banned:{label:'Unions prohibited',organisation:.42,trust:-.18},
  tolerated:{label:'Unions tolerated',organisation:.72,trust:0},
  recognised:{label:'Collective bargaining recognised',organisation:1,trust:.2},
});

export function ensureLabourRelations(region){
  region.labourRelations ||= {};
  const s=region.labourRelations;
  s.policy ||= {};
  if(!Number.isFinite(s.policy.minimumWageRatio))s.policy.minimumWageRatio=0;
  if(!BARGAINING_POLICIES[s.policy.collectiveBargaining])s.policy.collectiveBargaining='tolerated';
  if(!STRIKE_LAWS[s.policy.strikeLaw])s.policy.strikeLaw='legal';
  if(!POLICE_RESPONSES[s.policy.policeResponse])s.policy.policeResponse='negotiate';
  // Protectionism belongs to tradePolicy.js, where restrictions operate on
  // actual goods and counterparties. Remove the short-lived duplicate slider.
  delete s.policy.importProtection;
  for(const [k,v] of Object.entries({unionDensity:0,grievance:0,bargainingTrust:.5,strikePressure:0,strikeIntensity:0,lockoutIntensity:0,repressionMemory:0,hiringPenalty:0,outputMultiplier:1,munitionsMultiplier:1,lastStrikeTick:-Infinity,lastWarningTick:-Infinity,strikeWeeks:0,patrioticRestraint:0})) if(!Number.isFinite(s[k]))s[k]=v;
  delete s.protectionJobs;
  delete s.protectionCost;
  if(typeof s.activeStrike!=='boolean')s.activeStrike=false;
  if(!s.causes||typeof s.causes!=='object')s.causes={};
  return s;
}

export function setLabourPolicy(region,patch={}, {playerChoice=false}={}){
  const s=ensureLabourRelations(region),p=s.policy;
  if(patch.minimumWageRatio!==undefined)p.minimumWageRatio=clamp(patch.minimumWageRatio,0,1.25);
  if(patch.collectiveBargaining!==undefined&&BARGAINING_POLICIES[patch.collectiveBargaining])p.collectiveBargaining=patch.collectiveBargaining;
  if(patch.strikeLaw!==undefined&&STRIKE_LAWS[patch.strikeLaw])p.strikeLaw=patch.strikeLaw;
  if(patch.policeResponse!==undefined&&POLICE_RESPONSES[patch.policeResponse])p.policeResponse=patch.policeResponse;
  if(playerChoice)s.playerLocked=true;
  return s;
}

export function setPolityLabourPolicy(regions,polityId,patch={},options={}){
  const changed=[];
  for(const region of regions||[]){
    const id=region.governance?.sovereignPolityId||region.polityId;
    if(id!==polityId)continue;
    setLabourPolicy(region,patch,options);changed.push(region.id);
  }
  return changed;
}

function emitPlayerNotice(detail){
  if(typeof globalThis.dispatchEvent!=='function'||typeof globalThis.CustomEvent!=='function')return;
  globalThis.__worldsim?.clock?.requestAutoPause?.();
  globalThis.dispatchEvent(new CustomEvent('labourrelations:notice',{detail}));
}
function urbanShare(region){return pct((region.urbanisation?.urbanPopulation??region.urbanization?.urbanPopulation??0)/Math.max(1,region.population||1));}
function industrialShare(region){return pct((region.structuralTransformation?.industrialShare||0)+(region.structuralTransformation?.serviceShare||0)*.35);}
function productiveWageCapacity(region){const industry=industrialShare(region),finance=pct(region.corporateCapital?.financialDepth||0),human=pct(region.publicEducation?.technicalHumanCapital||region.publicEducation?.literacy||0);return clamp(.32+industry*.28+finance*.18+human*.16,0.28,.92);}
function defenceEmergency(region){const defending=Math.max(0,region.warEconomy?.defendingCampaigns||0),localThreat=pct(region.conflictPressure||0);return pct((defending?0.75:0)+localThreat*.55);}

function assess(region,s){
  const e=region.employment||{},formal=pct(e.formalLabourShare||0),literacy=pct(region.publicEducation?.literacy||region.educationLevel||0),urban=urbanShare(region),industry=industrialShare(region);
  const hardship=pct(e.hardship||0),unemployment=pct(e.unemploymentRate||0),food=pct(e.causes?.foodPrices||0),failures=pct(e.causes?.firmFailures||0),trade=pct(e.causes?.tradeDisruption||0);
  const tariffCost=pct(region.tradeEconomy?.importTariffBurdenEma||0);
  const standards=pct(region.economicRegulation?.labourStandards||0),safety=pct(region.economicRegulation?.workerSafety||standards),relief=pct(region.socialProtection?.coverage||region.socialProtectionReport?.coverage||0);
  const bargaining=BARGAINING_POLICIES[s.policy.collectiveBargaining],capacity=productiveWageCapacity(region),floor=s.policy.minimumWageRatio;
  const affordable=Math.max(0,capacity+.08-unemployment*.18),excessFloor=Math.max(0,floor-affordable),hiringPenalty=clamp(excessFloor*(.16+industry*.14),0,.18);
  const wageRelief=clamp(Math.min(floor,affordable)*.48+standards*.18);
  const workplace=pct((region.enterpriseExternalities?.labourHarm||0)*.55+(1-safety)*industry*.18),wageCostPressure=pct(hardship*.38+food*.3+tariffCost*.22-wageRelief),insecurity=pct(unemployment*.5+failures*.28+trade*.2-relief*.12);
  const rawGrievance=pct(wageCostPressure*.42+workplace*.24+insecurity*.24+s.repressionMemory*.28-relief*.18+bargaining.trust*.12),organisationTarget=pct(formal*(.18+literacy*.34+urban*.28+industry*.22)*bargaining.organisation);
  const emergency=defenceEmergency(region),exhaustion=pct(region.warEconomy?.warExhaustion||0),munitionsCritical=(region.warEconomy?.munitionsOutputValue||0)>0?1:0;
  const patrioticRestraint=pct(emergency*(.52+munitionsCritical*.26)*(1-exhaustion*.72)*(1-rawGrievance*.58));
  const strikeBase=pct(rawGrievance*.68+s.unionDensity*.34+s.repressionMemory*.16-unemployment*.16-bargaining.trust*.14-patrioticRestraint*.62);
  return {formal,literacy,urban,industry,hardship,unemployment,food,failures,trade,tariffCost,standards,safety,relief,capacity,affordable,excessFloor,hiringPenalty,workplace,wageCostPressure,insecurity,rawGrievance,organisationTarget,patrioticRestraint,strikeBase,emergency,munitionsCritical};
}
function maybeNpcPolicy(region,s,a){
  if(s.playerLocked||a.formal<.28)return;
  if(a.rawGrievance>.28&&a.capacity>.4)s.policy.minimumWageRatio=Math.max(s.policy.minimumWageRatio,Math.min(a.capacity*.72,.5));
  if(a.rawGrievance>.2&&a.literacy>.18&&s.policy.collectiveBargaining==='banned')s.policy.collectiveBargaining='tolerated';
  if(a.rawGrievance>.3&&a.literacy>.3&&s.policy.collectiveBargaining==='tolerated')s.policy.collectiveBargaining='recognised';
  if(s.repressionMemory>.25&&s.policy.policeResponse==='force')s.policy.policeResponse='keep_order';
}
function noticeCauses(a){
  const causes=[];
  if(a.tariffCost>.08)causes.push('tariffs are materially raising the cost of imported goods and inputs');
  if(a.wageCostPressure>.18)causes.push('living costs are outrunning take-home pay');
  if(a.workplace>.18)causes.push('workplace conditions are generating grievances');
  if(a.insecurity>.16)causes.push('workers fear unemployment or firm closures');
  if(a.trade>.2)causes.push('trade disruption is threatening industrial jobs');
  if(!causes.length)causes.push('collective bargaining has failed to settle accumulating grievances');
  return causes;
}

export function tickLabourRelations(region,currentTick=0,elapsedDays=7,{isPlayer=false}={}){
  const s=ensureLabourRelations(region),weeks=Math.max(.01,elapsedWeeks(elapsedDays));let a=assess(region,s);
  if(!isPlayer){maybeNpcPolicy(region,s,a);a=assess(region,s);}
  s.unionDensity+=(a.organisationTarget-s.unionDensity)*clamp(weeks/52*.32);
  const trustTarget=clamp(.46+BARGAINING_POLICIES[s.policy.collectiveBargaining].trust-s.repressionMemory*.48+(1-a.rawGrievance)*.08);
  s.bargainingTrust+=(trustTarget-s.bargainingTrust)*clamp(weeks/30);s.grievance+=(a.rawGrievance-s.grievance)*clamp(weeks/10);s.patrioticRestraint=a.patrioticRestraint;
  const pressureTarget=pct(a.strikeBase+s.grievance*.28);s.strikePressure+=(pressureTarget-s.strikePressure)*clamp(weeks/8);s.hiringPenalty=a.hiringPenalty;
  const events=[];
  if(isPlayer&&!s.activeStrike&&s.strikePressure>.25&&s.unionDensity>.07&&currentTick-s.lastWarningTick>=26){
    s.lastWarningTick=currentTick;const warning={type:'labour_tension_warning',regionId:region.id,polityId:region.governance?.sovereignPolityId||region.polityId,regionName:region.name,strikePressure:s.strikePressure,grievance:s.grievance,causes:noticeCauses(a)};events.push(warning);emitPlayerNotice(warning);
  }
  if(!s.activeStrike&&s.unionDensity>.08&&s.strikePressure>.34&&currentTick-s.lastStrikeTick>=13){
    s.activeStrike=true;s.strikeWeeks=0;s.lastStrikeTick=currentTick;const started={type:'strike_started',regionId:region.id,polityId:region.governance?.sovereignPolityId||region.polityId,regionName:region.name,grievance:s.grievance,unionDensity:s.unionDensity,strikePressure:s.strikePressure,causes:noticeCauses(a)};events.push(started);if(isPlayer)emitPlayerNotice(started);
  }
  if(s.activeStrike){
    s.strikeWeeks+=weeks;const law=STRIKE_LAWS[s.policy.strikeLaw],police=POLICE_RESPONSES[s.policy.policeResponse];
    const natural=clamp((s.strikePressure-.18)*1.55+s.grievance*.24,0,.82)*(1-s.patrioticRestraint*.82),suppression=clamp(law.suppression+police.suppression,0,.9);s.strikeIntensity=natural*(1-suppression);
    const repressionDelta=Math.max(0,law.repression+police.repression)*s.strikeIntensity*weeks*.055,conciliation=Math.max(0,-police.repression)*weeks*.025;s.repressionMemory=clamp(s.repressionMemory+repressionDelta-conciliation-weeks*.0015);
    if(s.strikeIntensity<.055||s.strikePressure<.16||(s.strikeWeeks>26&&s.bargainingTrust>.58)){
      const ended={type:'strike_ended',regionId:region.id,polityId:region.governance?.sovereignPolityId||region.polityId,regionName:region.name,durationWeeks:s.strikeWeeks};events.push(ended);if(isPlayer)emitPlayerNotice(ended);s.activeStrike=false;s.strikeIntensity=0;s.strikeWeeks=0;s.strikePressure*=.55;
    }
  }else{s.strikeIntensity=0;s.strikeWeeks=0;s.repressionMemory=Math.max(0,s.repressionMemory-weeks*.0025);}
  const sectorWeight=clamp(.25+a.industry*.65);s.outputMultiplier=clamp(1-s.strikeIntensity*sectorWeight,.45,1);s.munitionsMultiplier=clamp(1-s.strikeIntensity*(a.munitionsCritical?.9:.45),.35,1);
  if(s.activeStrike&&s.policy.policeResponse!=='negotiate')region.stability=clamp((region.stability??.6)+s.strikeIntensity*.0005*weeks-s.repressionMemory*.0009*weeks);
  region.report ||= {};region.report.labourRelations={unionDensity:s.unionDensity,grievance:s.grievance,bargainingTrust:s.bargainingTrust,strikePressure:s.strikePressure,activeStrike:s.activeStrike,strikeIntensity:s.strikeIntensity,strikeWeeks:s.strikeWeeks,repressionMemory:s.repressionMemory,patrioticRestraint:s.patrioticRestraint,hiringPenalty:s.hiringPenalty,outputMultiplier:s.outputMultiplier,munitionsMultiplier:s.munitionsMultiplier,policy:{...s.policy},causes:{wageCost:a.wageCostPressure,tariffCost:a.tariffCost,workplace:a.workplace,jobInsecurity:a.insecurity,hardship:a.hardship,unemployment:a.unemployment,warEmergency:a.emergency}};
  return events;
}
export function labourRelationsSummary(region){const s=ensureLabourRelations(region);return {...(region.report?.labourRelations||{}),policy:{...s.policy}};}
