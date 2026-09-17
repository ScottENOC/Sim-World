const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const ECONOMIC_REGULATIONS=Object.freeze({
  wage_rules:{label:'Wage and labour rules',minCapacity:.16,kind:'labour',description:'Basic rules on pay, labour obligations and abusive employment practices.'},
  worker_safety:{label:'Workplace safety inspection',minCapacity:.34,kind:'safety',description:'Inspect workplaces and require basic safety practices.'},
  customer_service:{label:'Customer and service standards',minCapacity:.31,kind:'service',description:'Set enforceable minimum service standards for major enterprises and utilities.'},
  maintenance_standards:{label:'Maintenance inspection',minCapacity:.38,kind:'maintenance',description:'Audit maintenance of major industrial and infrastructure assets.'},
  environmental_permitting:{label:'Environmental permitting',minCapacity:.56,kind:'environment',description:'Require permits and operating conditions for pollution and environmental damage.'},
  rehabilitation_bonds:{label:'Rehabilitation bonds',minCapacity:.68,kind:'rehabilitation',description:'Require firms to lodge enforceable financial security for mine/site rehabilitation.'},
});

function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
function financeDepth(territories){return average((territories||[]).map(r=>clamp(r?.corporateCapital?.financialDepth||0)));}
function corporateLaw(territories){return average((territories||[]).map(r=>clamp(r?.corporateCapital?.corporateLaw||0)));}
function knowledgeCapacity(territories){return average((territories||[]).map(r=>clamp(r?.medievalSociety?.education?.knowledgeCapacity||0)));}

export function economicRegulatoryCapacity(polity,territories=[]){
  const admin=polity?.administration||{};
  const officialdom=clamp(admin.officialdom||0),records=clamp(admin.recordKeeping||0),accounting=clamp(admin.accounting||0),communications=clamp(admin.communications||0),delegation=clamp(admin.delegation||0);
  const finance=financeDepth(territories),law=corporateLaw(territories),knowledge=knowledgeCapacity(territories);
  const general=clamp(officialdom*.28+records*.24+accounting*.18+communications*.12+delegation*.08+knowledge*.1);
  return {general,officialdom,records,accounting,communications,delegation,finance,law,knowledge};
}

export function regulationAvailability(polity,territories=[]){
  const c=economicRegulatoryCapacity(polity,territories);
  const out={};
  for(const [id,def] of Object.entries(ECONOMIC_REGULATIONS)){
    let available=c.general>=def.minCapacity,reason=available?null:'administrative_capacity';
    if(id==='worker_safety' && (c.officialdom<.26||c.records<.22)){available=false;reason='inspection_capacity';}
    if(id==='customer_service' && (c.records<.2||c.officialdom<.22)){available=false;reason='enforcement_capacity';}
    if(id==='maintenance_standards' && (c.records<.3||c.accounting<.22)){available=false;reason='audit_capacity';}
    if(id==='environmental_permitting' && (c.records<.46||c.officialdom<.42||c.knowledge<.28)){available=false;reason='permitting_capacity';}
    if(id==='rehabilitation_bonds' && (c.records<.62||c.accounting<.62||c.officialdom<.52||c.finance<.32||c.law<.32)){available=false;reason='financial_legal_capacity';}
    out[id]={id,...def,available,reason,capacity:c.general};
  }
  return out;
}

export function ensureEconomicRegulation(polity){
  polity.economicRegulation ||= {levels:{},lastReviewTick:-Infinity};
  polity.economicRegulation.levels ||= {};
  for(const id of Object.keys(ECONOMIC_REGULATIONS)) if(!Number.isFinite(polity.economicRegulation.levels[id])) polity.economicRegulation.levels[id]=0;
  return polity.economicRegulation;
}

export function setEconomicRegulation(polity,id,level,{territories=[]}={}){
  if(!ECONOMIC_REGULATIONS[id]) return {changed:false,reason:'unknown_regulation'};
  const availability=regulationAvailability(polity,territories)[id];
  const target=clamp(level);
  if(target>0&&!availability.available) return {changed:false,reason:availability.reason,availability};
  const state=ensureEconomicRegulation(polity); state.levels[id]=target;
  return {changed:true,id,level:target,availability,state};
}

export function effectiveEnterpriseRegulation(polity,territories=[]){
  const state=ensureEconomicRegulation(polity),available=regulationAvailability(polity,territories),levels=state.levels;
  const value=(id)=>available[id]?.available?clamp(levels[id]):0;
  return {
    wageFairness:value('wage_rules'),workerSafety:value('worker_safety'),customerService:value('customer_service'),maintenanceDiscipline:value('maintenance_standards'),environmentalCare:value('environmental_permitting'),rehabilitationProvision:value('rehabilitation_bonds'),
    overall:clamp(value('wage_rules')*.12+value('worker_safety')*.2+value('customer_service')*.13+value('maintenance_standards')*.2+value('environmental_permitting')*.2+value('rehabilitation_bonds')*.15),
  };
}

export function applyRegulationToTerritories(polity,territories=[]){
  const profile=effectiveEnterpriseRegulation(polity,territories);
  for(const region of territories) region.economicRegulation={...profile,enterpriseStandards:profile.overall,labourStandards:Math.max(profile.wageFairness,profile.workerSafety)};
  return profile;
}

export function reviewNpcEconomicRegulation(polity,territories=[],context={}){
  const availability=regulationAvailability(polity,territories),state=ensureEconomicRegulation(polity),externalities={labourHarm:0,customerHarm:0,maintenanceRisk:0,environmentalHarm:0,futureLiability:0};
  if(territories.length) for(const key of Object.keys(externalities)) externalities[key]=average(territories.map(r=>clamp(r?.enterpriseExternalities?.[key]||0)));
  const grievance=average(territories.map(r=>clamp(r?.popularWellbeing?.grievance||r?.wellbeing?.grievance||0)));
  const capitalShortage=clamp(context.capitalShortage||0),industrialAmbition=clamp(context.industrialAmbition||0),security=clamp(context.securityThreat||0);
  const pressure=clamp(grievance*.3+security*.08);
  const targets={
    wage_rules:clamp(externalities.labourHarm*.55+pressure*.25-capitalShortage*.18),
    worker_safety:clamp(externalities.labourHarm*.48+pressure*.18+industrialAmbition*.08-capitalShortage*.12),
    customer_service:clamp(externalities.customerHarm*.62+pressure*.12-capitalShortage*.12),
    maintenance_standards:clamp(externalities.maintenanceRisk*.62+industrialAmbition*.18+security*.08-capitalShortage*.08),
    environmental_permitting:clamp(externalities.environmentalHarm*.68+pressure*.12-capitalShortage*.12),
    rehabilitation_bonds:clamp(externalities.futureLiability*.72+industrialAmbition*.08-capitalShortage*.12),
  };
  const changes=[];
  for(const [id,target] of Object.entries(targets)){
    if(!availability[id].available){state.levels[id]=0;continue;}
    const before=clamp(state.levels[id]),after=clamp(before+(target-before)*.2);
    state.levels[id]=after;if(Math.abs(after-before)>.01)changes.push({id,before,after});
  }
  applyRegulationToTerritories(polity,territories);
  return {changes,availability,state};
}
