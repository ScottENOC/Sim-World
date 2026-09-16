const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export function ensureEnterpriseOperatingModel(enterprise,{publicEnterprise=false}={}){
  enterprise.operatingModel ||= {};
  const m=enterprise.operatingModel;
  const publicBias=publicEnterprise?0.12:0;
  for(const [key,value] of Object.entries({
    wageFairness:clamp(0.5+publicBias),
    workerSafety:clamp(0.55+publicBias),
    customerService:clamp(0.5+publicBias),
    maintenanceDiscipline:clamp(0.58+publicBias),
    environmentalCare:clamp(0.45+publicBias),
    rehabilitationProvision:clamp(0.4+publicBias),
  })) if(!Number.isFinite(m[key])) m[key]=value;
  return m;
}

export function enterpriseCostExternalityProfile(enterprise,{publicEnterprise=false}={}){
  const m=ensureEnterpriseOperatingModel(enterprise,{publicEnterprise});
  const costSaving=clamp((1-m.wageFairness)*.18+(1-m.workerSafety)*.12+(1-m.customerService)*.08+(1-m.maintenanceDiscipline)*.18+(1-m.environmentalCare)*.13+(1-m.rehabilitationProvision)*.11);
  return {
    apparentCostSaving:costSaving,
    labourHarm:clamp((1-m.wageFairness)*.58+(1-m.workerSafety)*.42),
    customerHarm:clamp(1-m.customerService),
    maintenanceRisk:clamp(1-m.maintenanceDiscipline),
    environmentalHarm:clamp((1-m.environmentalCare)*.62+(1-m.rehabilitationProvision)*.38),
    futureLiability:clamp((1-m.rehabilitationProvision)*.7+(1-m.maintenanceDiscipline)*.3),
  };
}

export function applyEnterpriseExternalities(region,enterprise,{scale=1,publicEnterprise=false}={}){
  const profile=enterpriseCostExternalityProfile(enterprise,{publicEnterprise});
  const weight=Math.max(0,Number(scale)||0);
  region.enterpriseExternalities ||= {labourHarm:0,customerHarm:0,maintenanceRisk:0,environmentalHarm:0,futureLiability:0};
  const state=region.enterpriseExternalities;
  for(const key of ['labourHarm','customerHarm','maintenanceRisk','environmentalHarm','futureLiability']){
    state[key]=clamp((state[key]||0)*.92+profile[key]*Math.min(1,weight)*.08);
  }
  return profile;
}

export function enterpriseCreditQuality(enterprise,{sovereignCredit=0.6,revenueReliability=0.5}={}){
  const service=clamp(enterprise.serviceObligation??0.5);
  const independence=clamp(enterprise.commercialIndependence??0.5);
  const target=Math.max(0,Number(enterprise.profitTarget)||0);
  const assetBase=Math.max(0,Number(enterprise.investedCapital)||0);
  const debt=Math.max(0,Number(enterprise.debt)||0);
  const leverage=debt/Math.max(1,assetBase+Math.max(0,Number(enterprise.governmentCapital)||0));
  return clamp(.28+clamp(sovereignCredit)*.24+clamp(revenueReliability)*.24+independence*.11+Math.min(.12,target*.6)-service*.1-leverage*.24);
}

export function enterpriseDebtCapacity(enterprise,context={}){
  const quality=enterpriseCreditQuality(enterprise,context);
  const assetBase=Math.max(0,Number(enterprise.investedCapital)||0)+Math.max(0,Number(enterprise.governmentCapital)||0);
  const maxLeverage=.18+quality*.72;
  return {quality,maxLeverage,maxDebt:assetBase*maxLeverage,available:Math.max(0,assetBase*maxLeverage-Math.max(0,Number(enterprise.debt)||0))};
}

export function borrowEnterprise(enterprise,amount,context={}){
  const wanted=Math.max(0,Number(amount)||0);
  if(wanted<=0)return{borrowed:false,reason:'invalid_amount'};
  const capacity=enterpriseDebtCapacity(enterprise,context);
  const value=Math.min(wanted,capacity.available);
  if(value<=0)return{borrowed:false,reason:'debt_capacity_exhausted',capacity};
  enterprise.debt=Math.max(0,Number(enterprise.debt)||0)+value;
  enterprise.cash=Math.max(0,Number(enterprise.cash)||0)+value;
  enterprise.creditQuality=capacity.quality;
  enterprise.interestRate=.025+(1-capacity.quality)*.12;
  return{borrowed:true,amount:value,capacity,enterprise};
}

export function serviceEnterpriseDebt(enterprise,years=1){
  const debt=Math.max(0,Number(enterprise.debt)||0);
  if(!debt)return{due:0,paid:0,shortfall:0};
  const rate=Math.max(0,Number(enterprise.interestRate)||.06),due=debt*rate*Math.max(0,Number(years)||0);
  const cash=Math.max(0,Number(enterprise.cash)||0),paid=Math.min(cash,due),shortfall=due-paid;
  enterprise.cash=cash-paid;
  enterprise.debtServiceArrears=Math.max(0,Number(enterprise.debtServiceArrears)||0)+shortfall;
  if(shortfall>0)enterprise.creditQuality=clamp((enterprise.creditQuality??.5)-Math.min(.18,shortfall/Math.max(1,debt)*.5));
  return{due,paid,shortfall};
}
