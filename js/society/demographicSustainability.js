const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const DAYS_PER_YEAR=365.2425;
const BASE_ANNUAL_BIRTH_RATE=.030;

function urbanShare(region){
  const explicit=region?.urbanisation?.share ?? region?.urbanization?.share ?? region?.settlements?.urbanShare;
  if(Number.isFinite(explicit))return clamp(explicit);
  const urban=nonNegative(region?.urbanisation?.urbanPopulation ?? region?.urbanization?.urbanPopulation);
  return clamp(urban/Math.max(1,nonNegative(region?.population)));
}

function housingSpareRatio(region){
  const capacity=nonNegative(region?.housing?.residentCapacity);
  const pop=Math.max(1,nonNegative(region?.population));
  if(capacity<=0)return .04;
  return clamp((capacity-pop)/pop,-.25,.25);
}

function foodSecurity(region){
  const need=Math.max(1,nonNegative(region?._foodNeeded)||nonNegative(region?.population));
  const food=nonNegative(region?.stockpile?.food);
  const shortage=clamp(Math.max(0,need-food)/need);
  return clamp(1-shortage*.9);
}

function reproductiveHealth(region){
  const publicHealth=clamp(region?.publicHealth?.coverage ?? region?.healthcare?.coverage ?? 0);
  const medicine=clamp(region?.medicalProgress?.careEffectiveness ?? region?.medicine?.careEffectiveness ?? region?.report?.medicine?.effectiveness ?? 0);
  const sanitation=clamp(region?.externalities?.sanitation ?? region?.publicHealth?.sanitation ?? 0);
  return clamp(.82+publicHealth*.07+medicine*.07+sanitation*.04,.72,1.04);
}

function workTimeFactor(region){
  const hours=Number(region?.aiLabour?.effectiveWeeklyHours ?? region?.labourRelations?.effectiveWeeklyHours ?? region?.labourRelations?.standardWeeklyHours);
  if(!Number.isFinite(hours)||hours<=0)return 1;
  if(hours<=36)return 1.08;
  if(hours<=42)return 1.03;
  if(hours<=48)return clamp(1-(hours-42)*.015,.90,1.03);
  return clamp(.94-(hours-48)*.025,.62,.94);
}

function conflictAndDisplacementFactor(region){
  const war=clamp(region?.warPressure ?? region?.militaryPressure ?? region?.strategicCrisis?.pressure ?? 0);
  const displacement=clamp(Math.max(region?.migrationPressure||0,region?.climate?.coastalDisplacementPressure||0,region?.employment?.migrationPressure||0));
  return clamp(1-war*.32-displacement*.24,.45,1);
}

export function ensureDemographicSustainability(region){
  region.demographicSustainability||={};
  const d=region.demographicSustainability;
  d.policy||={};
  const p=d.policy;
  if(!Number.isFinite(p.childcareSupport))p.childcareSupport=0;
  if(!Number.isFinite(p.familyIncomeSupport))p.familyIncomeSupport=0;
  if(!Number.isFinite(p.parentalLeave))p.parentalLeave=0;
  if(!Number.isFinite(p.familyHousingPriority))p.familyHousingPriority=0;
  if(!Number.isFinite(p.reproductiveHealthcare))p.reproductiveHealthcare=0;
  for(const key of Object.keys(p))p[key]=clamp(p[key]);
  if(!Number.isFinite(d.culturalFamilyPreference))d.culturalFamilyPreference=1;
  if(!Number.isFinite(d.smoothedAnnualGrowth))d.smoothedAnnualGrowth=0;
  if(!Number.isFinite(d.durableYears))d.durableYears=0;
  if(!Number.isFinite(d.durableControlMargin))d.durableControlMargin=0;
  if(typeof d.demonstratedDurable!=='boolean')d.demonstratedDurable=false;
  return d;
}

export function setDemographicPolicy(region,patch={}){
  const d=ensureDemographicSustainability(region);
  for(const key of ['childcareSupport','familyIncomeSupport','parentalLeave','familyHousingPriority','reproductiveHealthcare']){
    if(patch[key]!==undefined)d.policy[key]=clamp(patch[key]);
  }
  if(patch.culturalFamilyPreference!==undefined)d.culturalFamilyPreference=clamp(patch.culturalFamilyPreference,.55,1.45);
  return demographicSustainabilitySummary(region);
}

export function demographicFertilityAssessment(region){
  const state=ensureDemographicSustainability(region),p=state.policy;
  const demo=region.demographics||{children:0,workingAge:0,elderly:0};
  const total=Math.max(1,nonNegative(demo.children)+nonNegative(demo.workingAge)+nonNegative(demo.elderly));
  const u=urbanShare(region),spare=housingSpareRatio(region);
  const hardship=clamp(region?.employment?.hardship||0),unemployment=clamp(region?.employment?.unemploymentRate||0);
  const pension=clamp(region?.socialProtection?.pensionReplacementRate||0);
  const childMortalityExtra=nonNegative(region?.externalities?.demographicEffects?.childMortalityExtraAnnual);
  const survivalConfidence=clamp(.64+(1-clamp(childMortalityExtra/.08))*.30+clamp(region?.publicHealth?.coverage||0)*.06);

  // Desired family size responds to social and material conditions. Education is intentionally
  // absent here: players should not be rewarded for cutting schooling to raise births.
  const housingPreference=clamp(1+spare*1.7,.70,1.18);
  const oldAgeNeed=clamp(1.10-pension*.18,.92,1.10);
  const confidence=clamp(1-hardship*.28-unemployment*.12,.68,1.05);
  const urbanPreference=clamp(1-u*.13,.82,1);
  const survivalAdjustment=clamp(1.14-survivalConfidence*.13,.98,1.08);
  const desiredIndex=clamp(state.culturalFamilyPreference*housingPreference*oldAgeNeed*confidence*urbanPreference*survivalAdjustment,.58,1.35);
  const desiredAnnualBirthRate=BASE_ANNUAL_BIRTH_RATE*desiredIndex;

  const familySupport=clamp(.86+p.childcareSupport*.07+p.familyIncomeSupport*.06+p.parentalLeave*.06+
    clamp(region?.socialProtection?.coverage||0)*.05,.72,1.10);
  const health=clamp(reproductiveHealth(region)+p.reproductiveHealthcare*.06,.72,1.08);
  const employmentSecurity=clamp(1-hardship*.34-unemployment*.18,.55,1);
  const room=clamp(.76+Math.max(0,spare)*3.2+p.familyHousingPriority*.12,.62,1.10);
  const food=clamp(.72+foodSecurity(region)*.28,.55,1);
  const time=workTimeFactor(region);
  const conflict=conflictAndDisplacementFactor(region);
  const realisedFactor=clamp(familySupport*health*employmentSecurity*room*food*time*conflict,.35,1.12);
  const realisedAnnualBirthRate=desiredAnnualBirthRate*realisedFactor;

  const childShare=nonNegative(demo.children)/total,workingShare=nonNegative(demo.workingAge)/total,elderlyShare=nonNegative(demo.elderly)/total;
  const dependencyRatio=(nonNegative(demo.children)+nonNegative(demo.elderly))/Math.max(1,nonNegative(demo.workingAge));
  return {desiredIndex,desiredAnnualBirthRate,realisedFactor,realisedAnnualBirthRate,childShare,workingShare,elderlyShare,dependencyRatio,
    constraints:{housing:room,food,employmentSecurity,time,health,conflict,familySupport},drivers:{urbanShare:u,housingSpareRatio:spare,survivalConfidence,pensionReplacementRate:pension,hardship,unemployment}};
}

export function recordDemographicOutcome(region,{births=0,deaths=0,elapsedDays=7}={}){
  const state=ensureDemographicSustainability(region),a=demographicFertilityAssessment(region);
  const years=Math.max(.0001,nonNegative(elapsedDays)/DAYS_PER_YEAR);
  const pop=Math.max(1,nonNegative(region.population));
  const observedGrowth=clamp((nonNegative(births)-nonNegative(deaths))/pop/years,-.2,.2);
  const smoothing=clamp(years/5,0,.25);
  state.smoothedAnnualGrowth+=(observedGrowth-state.smoothedAnnualGrowth)*smoothing;

  const growthMargin=clamp(1-Math.max(0,Math.abs(state.smoothedAnnualGrowth-.002)-.010)/.025);
  const ageMargin=clamp(1-Math.max(0,a.dependencyRatio-.90)/.75-Math.max(0,.48-a.workingShare)*1.8);
  const fertilityGap=a.desiredAnnualBirthRate>0?clamp(a.realisedAnnualBirthRate/a.desiredAnnualBirthRate):1;
  const fulfilmentMargin=clamp((fertilityGap-.55)/.45);
  const resilience=clamp((growthMargin*.42)+(ageMargin*.36)+(fulfilmentMargin*.22));
  state.durableControlMargin=resilience;
  const safe=resilience>=.68&&state.smoothedAnnualGrowth>=-.012&&state.smoothedAnnualGrowth<=.018&&a.workingShare>=.47;
  state.durableYears=safe?state.durableYears+years:Math.max(0,state.durableYears-years*.75);
  state.demonstratedDurable=state.durableYears>=20;
  state.lastAssessment={...a,smoothedAnnualGrowth:state.smoothedAnnualGrowth,durableControlMargin:state.durableControlMargin,durableYears:state.durableYears,demonstratedDurable:state.demonstratedDurable};
  region.report||={};region.report.demographicSustainability={...state.lastAssessment};
  return state.lastAssessment;
}

export function demographicSustainabilitySummary(region){
  const state=ensureDemographicSustainability(region);
  return state.lastAssessment||{...demographicFertilityAssessment(region),smoothedAnnualGrowth:state.smoothedAnnualGrowth,durableControlMargin:state.durableControlMargin,durableYears:state.durableYears,demonstratedDurable:state.demonstratedDurable};
}
