import { effectiveInfrastructureCount } from './construction.js?v=20260921-mobile-pollination1';
import { AUTOMOBILE_TECH_ID } from '../technology/industrialProduction.js?v=20260921-mobile-pollination1';
import { ensureAgriculturalPollinators } from './agriculturalPollinators.js?v=20260921-mobile-pollination1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const PETROL_PER_COLONY_TRIP=.0012;
const MAX_EXPORT_SHARE=.55;
const COLONIES_PER_SERVICE_UNIT=220;

function roadMobility(region){
  const roads=Math.max(0,effectiveInfrastructureCount(region,'road_network'));
  const roadFactor=clamp(roads*.75,0,1);
  const motorisation=clamp(region.industrialProduction?.motorisationReadiness||0);
  const automotive=clamp(region.industrialSupply?.capability?.automotive_engineering||0);
  return clamp(roadFactor*(.25+.45*motorisation+.30*automotive));
}

function mobileEligible(region){
  return !!region.unlockedTechIds?.has?.(AUTOMOBILE_TECH_ID)&&roadMobility(region)>.08;
}

function destinationDemand(region){
  const p=ensureAgriculturalPollinators(region);
  const mix=region.foodDiversity?.productionMix||{};
  const dependentShare=clamp((Number(mix.fruit_vegetables)||0)*.72+(Number(mix.pulses)||0)*.28+(Number(mix.staple_grains)||0)*.04);
  const cultivated=nonNegative(region.agriculturalLand?.cultivatedHa);
  const deficit=clamp(1-p.serviceLevel);
  return cultivated*dependentShare*deficit;
}

function partnerIds(region){
  const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[])]);
  if(region.recentTradePartners instanceof Map)for(const id of region.recentTradePartners.keys())ids.add(id);
  return [...ids];
}

function resetMobileState(region){
  const p=ensureAgriculturalPollinators(region);
  p.incomingMobileService=0;
  p.mobileColoniesHosted=0;
  p.mobileColoniesExported=0;
  p.mobileTransportStress=clamp((Number(p.mobileTransportStress)||0)*.92);
  p.mobileDiseasePressure=clamp((Number(p.mobileDiseasePressure)||0)*.97);
  return p;
}

export function tickMobilePollination(regions,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const byId=new Map((regions||[]).map(r=>[r.id,r]));
  for(const region of regions||[])resetMobileState(region);
  const movements=[];

  for(const source of regions||[]){
    const sp=ensureAgriculturalPollinators(source);
    if(!mobileEligible(source)||sp.serviceableManagedColonies<=0)continue;
    const mobility=roadMobility(source);
    const transportable=Math.min(sp.serviceableManagedColonies,Math.max(sp.transportableColonies,sp.serviceableManagedColonies*mobility*.55));
    sp.transportableColonies=transportable;
    let exportBudget=transportable*MAX_EXPORT_SHARE;
    if(exportBudget<=0)continue;

    const petrol=nonNegative(source.stockpile?.petrol);
    const fuelCap=petrol/PETROL_PER_COLONY_TRIP;
    exportBudget=Math.min(exportBudget,fuelCap);
    if(exportBudget<=0)continue;

    const candidates=partnerIds(source).map(id=>byId.get(id)).filter(Boolean).filter(r=>r.id!==source.id&&roadMobility(r)>.05)
      .map(region=>({region,demand:destinationDemand(region)})).filter(x=>x.demand>0).sort((a,b)=>b.demand-a.demand);
    if(!candidates.length)continue;
    const totalDemand=candidates.reduce((sum,x)=>sum+x.demand,0);

    for(const c of candidates){
      if(exportBudget<=0)break;
      const share=totalDemand>0?c.demand/totalDemand:0;
      const colonies=Math.min(exportBudget,Math.max(0,transportable*share),c.demand/18);
      if(colonies<=0)continue;
      const dest=c.region,dp=ensureAgriculturalPollinators(dest);
      const tripFuel=colonies*PETROL_PER_COLONY_TRIP;
      if(nonNegative(source.stockpile?.petrol)<tripFuel)break;
      source.stockpile.petrol=Math.max(0,nonNegative(source.stockpile.petrol)-tripFuel);
      exportBudget-=colonies;
      sp.mobileColoniesExported+=colonies;
      dp.mobileColoniesHosted+=colonies;
      const transportQuality=Math.min(roadMobility(source),roadMobility(dest));
      const deliveredService=clamp((colonies/COLONIES_PER_SERVICE_UNIT)*(.55+.45*transportQuality),0,.45);
      dp.incomingMobileService=clamp(dp.incomingMobileService+deliveredService,0,.48);
      const sourceDisease=clamp(sp.mobileDiseasePressure+Math.max(0,.35-sp.managedHealth)*.55);
      const destDisease=clamp(dp.mobileDiseasePressure+Math.max(0,.35-dp.managedHealth)*.55);
      const mixingRisk=clamp((sourceDisease+destDisease)*.5+.025*(1-transportQuality));
      sp.mobileDiseasePressure=clamp(sp.mobileDiseasePressure+mixingRisk*.05*years);
      dp.mobileDiseasePressure=clamp(dp.mobileDiseasePressure+mixingRisk*.08*years);
      const stress=clamp(.04+.12*(1-transportQuality)+mixingRisk*.10);
      sp.mobileTransportStress=clamp(sp.mobileTransportStress+stress*(colonies/Math.max(1,sp.serviceableManagedColonies)));
      movements.push({sourceRegionId:source.id,destinationRegionId:dest.id,colonies,fuelUsed:tripFuel,service:deliveredService,diseaseRisk:mixingRisk});
    }
  }

  for(const region of regions||[]){
    const p=ensureAgriculturalPollinators(region);
    const diseasePenalty=clamp(p.mobileDiseasePressure*.28+p.mobileTransportStress*.18,0,.32);
    p.managedHealth=clamp(p.managedHealth*(1-diseasePenalty*years));
    region.report||={};
    region.report.mobilePollination={workers:0,transportableColonies:p.transportableColonies,coloniesExported:p.mobileColoniesExported,coloniesHosted:p.mobileColoniesHosted,incomingService:p.incomingMobileService,transportStress:p.mobileTransportStress,diseasePressure:p.mobileDiseasePressure};
  }
  return movements;
}

export function mobilePollinationCapacity(region){
  const p=ensureAgriculturalPollinators(region);
  return {eligible:mobileEligible(region),roadMobility:roadMobility(region),transportableColonies:p.transportableColonies,incomingService:p.incomingMobileService,diseasePressure:p.mobileDiseasePressure};
}
