const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const DAYS_PER_YEAR=365.2425;

export const AI_RISK_DOMAINS=Object.freeze(['economy','information','infrastructure','industry','military','nuclearCommand','politicalPower']);

export function ensureAiSystemicRisk(region){
  region.aiSystemicRisk||={};
  const s=region.aiSystemicRisk;
  s.policy||={};
  for(const [key,value] of Object.entries({
    manualFallback:.55,
    independentVerification:.50,
    separationOfDuties:.45,
    accessSegmentation:.50,
    modelDiversity:.30,
    publicInterestCapacity:.30,
    ownershipPluralism:.35,
    foreignDependencyLimit:.45,
  })) if(!Number.isFinite(s.policy[key]))s.policy[key]=value;
  s.controls||={};s.pressures||={};s.domainRisk||={};s.distribution||={};
  for(const key of AI_RISK_DOMAINS)if(!Number.isFinite(s.domainRisk[key]))s.domainRisk[key]=0;
  for(const [key,value] of Object.entries({
    automationBias:0,institutionalDependence:0,objectiveFailure:0,hostileCapture:0,operatorMisuse:0,
    concentratedControl:0,foreignLeverage:0,systemicRisk:0,benefitBroadness:0,postScarcityPotential:0,
    oligarchicConcentration:0,durableControlMargin:0,durableYears:0,
  }))if(!Number.isFinite(s[key]))s[key]=value;
  if(typeof s.demonstratedDurable!=='boolean')s.demonstratedDurable=false;
  return s;
}

export function setAiSystemicPolicy(region,patch={}){
  const s=ensureAiSystemicRisk(region);
  for(const key of Object.keys(s.policy))if(patch[key]!==undefined)s.policy[key]=clamp(patch[key]);
  return {...s.policy};
}

function controlQuality(region,s){
  const c=region.aiControl||{},p=s.policy;
  const human=clamp(c.policy?.humanAuthorization??.8);
  const monitoring=clamp(c.monitoringMaturity||0);
  const evaluation=clamp(c.evaluationMaturity||0);
  const containment=clamp(c.containmentMaturity||0);
  const safety=clamp(c.safetyMaturity||0);
  const manual=clamp(p.manualFallback);
  const verify=clamp(p.independentVerification);
  const duties=clamp(p.separationOfDuties);
  const segmentation=clamp(p.accessSegmentation);
  const diversity=clamp(p.modelDiversity);
  const overrideReliability=clamp(.16+human*.24+manual*.22+verify*.17+duties*.11+diversity*.10);
  const cyberControl=clamp(.10+monitoring*.21+containment*.18+segmentation*.25+duties*.14+verify*.12);
  const objectiveControl=clamp(.12+safety*.31+evaluation*.28+verify*.19+diversity*.10);
  return {overrideReliability,cyberControl,objectiveControl,manualFallback:manual,independentVerification:verify,separationOfDuties:duties,accessSegmentation:segmentation,modelDiversity:diversity};
}

function ownershipAndDistribution(region,s){
  const labour=region.aiLabour||{};
  const ownership=region.economicOwnership||region.ownership||{};
  const broadOwnership=clamp(Math.max(Number(ownership.householdShare)||0,Number(ownership.workerShare)||0,Number(ownership.publicShare)||0));
  const social=clamp(region.socialProtection?.coverage||region.socialProtectionReport?.coverage||0);
  const worker=clamp(labour.workerPower||0);
  const employer=clamp(labour.employerPower||0);
  const publicCapacity=clamp(s.policy.publicInterestCapacity);
  const pluralism=clamp(s.policy.ownershipPluralism);
  const wageDividend=clamp(labour.wageShare||0),priceDividend=clamp(labour.priceShare||0),leisure=clamp(labour.leisureShare||0),profit=clamp(labour.profitShare||0);
  const benefitBroadness=clamp(.10+broadOwnership*.22+social*.16+worker*.13+publicCapacity*.14+pluralism*.12+wageDividend*.06+priceDividend*.04+leisure*.03-employer*.06);
  const concentratedControl=clamp(.08+profit*.30+employer*.22+(1-broadOwnership)*.16+(1-pluralism)*.14+(1-publicCapacity)*.10);
  const postScarcityPotential=clamp((labour.productivityGain||0)*(.28+.72*benefitBroadness)*(1-(labour.automationDisplacementRate||0)*.45));
  const oligarchicConcentration=clamp((labour.productivityGain||0)*concentratedControl*(.55+.45*(labour.labourSheddingShare||0)));
  return {benefitBroadness,concentratedControl,postScarcityPotential,oligarchicConcentration,broadOwnership,socialProtection:social};
}

function access(region,domain){
  const a=region.aiControl?.access||{};
  if(domain==='economy'||domain==='information')return clamp(a.civilianDigital||0);
  if(domain==='industry')return clamp(a.industrial||0);
  if(domain==='infrastructure')return clamp(a.infrastructure||0);
  if(domain==='military')return clamp(a.military||0);
  if(domain==='nuclearCommand')return clamp(a.nuclearCommand||0);
  if(domain==='politicalPower')return clamp(Math.max(a.civilianDigital||0,region.aiLabour?.sectors?.administration?.adoption||0));
  return 0;
}

function pressureAssessment(region,s,controls,distribution){
  const c=region.aiControl||{},labour=region.aiLabour||{};
  const capability=clamp(labour.capability||region.aiEconomy?.capability||0);
  const adoption=clamp(labour.adoption||0);
  const autonomy=clamp(c.autonomy||0);
  const growth=clamp((c.capabilityGrowthRate||0)/1.5);
  const disclosure=clamp(c.policy?.incidentDisclosure??.5);
  const competition=clamp(region.aiCompetitionPressure||region.strategicAiPressure||0);
  const foreignExposure=clamp(region.aiForeignDependency||region.computingIndustry?.foreignDependency||0);
  const extremistPressure=clamp(region.nonStateThreats?.terrorism||region.terrorismPressure||0);
  const cyberThreat=clamp(region.cyberThreatPressure||region.covertPressure||0);
  const stateMisuse=clamp(region.authoritarianPressure||region.stateCoercionPressure||0);
  const dataOpacity=clamp(1-controls.independentVerification*.55-(c.monitoringMaturity||0)*.30-controls.modelDiversity*.15);

  const automationBias=clamp(capability*adoption*(.18+.34*autonomy+.22*growth)*(1-controls.overrideReliability*.68));
  const institutionalDependence=clamp(adoption*(.18+.42*capability+.18*competition)*(1-controls.manualFallback*.65));
  const objectiveFailure=clamp(capability*capability*(.15+.38*autonomy+.22*growth)*dataOpacity*(1-controls.objectiveControl*.55));
  const hostileCapture=clamp(capability*(.10+.28*cyberThreat+.16*extremistPressure+foreignExposure*.22)*(1-controls.cyberControl*.72));
  const operatorMisuse=clamp(capability*adoption*(.08+stateMisuse*.28+extremistPressure*.18+distribution.concentratedControl*.22)*(1-controls.separationOfDuties*.48));
  const foreignLeverage=clamp(capability*foreignExposure*(.35+.35*access(region,'infrastructure')+.30*access(region,'information'))*(1-s.policy.foreignDependencyLimit*.62));
  return {automationBias,institutionalDependence,objectiveFailure,hostileCapture,operatorMisuse,foreignLeverage,competition,cyberThreat,foreignExposure};
}

function domainAssessment(region,pressures,controls,distribution){
  const r={};
  const weights={
    economy:{bias:.22,depend:.24,objective:.15,capture:.18,misuse:.15,foreign:.06},
    information:{bias:.25,depend:.12,objective:.20,capture:.18,misuse:.20,foreign:.05},
    infrastructure:{bias:.16,depend:.23,objective:.17,capture:.27,misuse:.10,foreign:.07},
    industry:{bias:.14,depend:.27,objective:.19,capture:.19,misuse:.13,foreign:.08},
    military:{bias:.18,depend:.16,objective:.17,capture:.21,misuse:.24,foreign:.04},
    nuclearCommand:{bias:.23,depend:.11,objective:.19,capture:.17,misuse:.28,foreign:.02},
    politicalPower:{bias:.18,depend:.13,objective:.17,capture:.14,misuse:.27,foreign:.11},
  };
  for(const [domain,w] of Object.entries(weights)){
    const base=pressures.automationBias*w.bias+pressures.institutionalDependence*w.depend+pressures.objectiveFailure*w.objective+
      pressures.hostileCapture*w.capture+pressures.operatorMisuse*w.misuse+pressures.foreignLeverage*w.foreign;
    const domainAccess=access(region,domain);
    const fallback=(domain==='nuclearCommand'||domain==='military')?controls.overrideReliability:controls.manualFallback;
    r[domain]=clamp(base*domainAccess*(.65+.35*(1-fallback)));
  }
  r.politicalPower=clamp(r.politicalPower+distribution.oligarchicConcentration*.28);
  return r;
}

export function tickAiSystemicRisk(region,elapsedDays=7){
  const s=ensureAiSystemicRisk(region);
  const years=Math.max(.0001,(Number(elapsedDays)||0)/DAYS_PER_YEAR);
  const controls=controlQuality(region,s);
  const distribution=ownershipAndDistribution(region,s);
  const pressures=pressureAssessment(region,s,controls,distribution);
  const domainRisk=domainAssessment(region,pressures,controls,distribution);
  s.controls=controls;s.pressures=pressures;s.domainRisk=domainRisk;
  Object.assign(s,distribution);

  const catastrophic=Math.max(domainRisk.nuclearCommand,domainRisk.military*.72,domainRisk.infrastructure*.55);
  const chronic=(domainRisk.economy+domainRisk.information+domainRisk.industry+domainRisk.politicalPower)/4;
  s.systemicRisk=clamp(catastrophic*.52+chronic*.48);

  // High capability is not itself failure. Durable control means the benefits can remain large while
  // institutions retain independent judgement, manual fallbacks and protection against capture/misuse.
  const controlMargin=clamp(.45*controls.overrideReliability+.22*controls.cyberControl+.18*controls.objectiveControl+.15*distribution.benefitBroadness-s.systemicRisk*.72);
  s.durableControlMargin=controlMargin;
  const safe=controlMargin>=.62&&s.systemicRisk<=.16&&domainRisk.nuclearCommand<=.08&&domainRisk.infrastructure<=.18;
  s.durableYears=safe?s.durableYears+years:Math.max(0,s.durableYears-years*.8);
  s.demonstratedDurable=s.durableYears>=20;

  // Expose cross-system pressures without resolving them into a cartoon "rogue AI" event.
  region.aiFinancialInstabilityPressure=clamp(domainRisk.economy*.70+pressures.operatorMisuse*.18);
  region.aiGridDisruptionPressure=clamp(domainRisk.infrastructure*.82+pressures.hostileCapture*.10);
  region.aiInformationIntegrityPressure=clamp(domainRisk.information);
  region.aiPoliticalCapturePressure=clamp(domainRisk.politicalPower);
  region.aiForeignControlPressure=clamp(pressures.foreignLeverage);
  region.report||={};region.report.aiSystemicRisk=aiSystemicRiskSummary(region);
  return s;
}

export function aiSystemicRiskSummary(region){
  const s=ensureAiSystemicRisk(region);
  return {
    controls:{...s.controls},pressures:{...s.pressures},domainRisk:{...s.domainRisk},
    distribution:{benefitBroadness:s.benefitBroadness,postScarcityPotential:s.postScarcityPotential,oligarchicConcentration:s.oligarchicConcentration,concentratedControl:s.concentratedControl},
    systemicRisk:s.systemicRisk,durableControlMargin:s.durableControlMargin,durableYears:s.durableYears,demonstratedDurable:s.demonstratedDurable,
    policy:{...s.policy},
  };
}
