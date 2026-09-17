import { createStateEnterprise } from './economicOwnership.js';
import { enterpriseCostExternalityProfile } from './enterpriseBehaviour.js';
import { ensureEconomicRegulation } from './economicRegulation.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const strategicSectors=new Set(['mining','shipping','infrastructure','rail','power_generation','power_grid','water','telecommunications','finance']);

function capitalRegion(polity,territories=[]){return territories.find(r=>r.id===polity?.capitalRegionId)||territories[0]||null;}
function treasuryAvailable(polity,territories=[]){return Math.max(0,Number(capitalRegion(polity,territories)?.treasury)||0);}
function limitedLiability(region,firm){
  const practice=clamp(region?.corporateCapital?.limitedLiabilityPractice||0);
  const form=firm?.form==='joint_stock_company'?1:firm?.form==='chartered_venture'?.55:.15;
  return clamp(practice*.7+form*.3);
}
function regulationLevel(polity,id){return clamp(ensureEconomicRegulation(polity).levels?.[id]||0);}

export function assessFirmDistress(region,polity,firm,territories=[]){
  const profile=enterpriseCostExternalityProfile(firm,{publicEnterprise:false});
  const capital=Math.max(.01,Number(firm.capitalIndex)||0);
  const debt=Math.max(0,Number(firm.debtIndex)||0);
  const leverage=debt/capital;
  const liabilityScale=capital*(.18+profile.futureLiability*.72+profile.environmentalHarm*.28);
  const rehabSecurity=liabilityScale*regulationLevel(polity,'rehabilitation_bonds')*clamp((region?.economicRegulation?.rehabilitationProvision||0));
  const uncoveredLiability=Math.max(0,liabilityScale-rehabSecurity);
  const stateExposure=uncoveredLiability*(.35+limitedLiability(region,firm)*.5);
  const strategic=strategicSectors.has(firm.sector)?1:.25;
  const serviceImportance=clamp(strategic*.5+(firm.sector==='finance'?.25:0)+(firm.sector==='mining'?.12:0));
  const bailoutCost=Math.max(.05,capital*Math.max(.08,.3-clamp(firm.solvency)) + debt*.08);
  const buyoutCost=Math.max(.05,capital*.34+debt*.18);
  const restructuringWriteDown=clamp(.18+(1-clamp(firm.solvency))*.35,0.18,.58);
  return {capital,debt,leverage,liabilityScale,rehabSecurity,uncoveredLiability,stateExposure,strategic,serviceImportance,bailoutCost,buyoutCost,restructuringWriteDown,treasury:treasuryAvailable(polity,territories),limitedLiability:limitedLiability(region,firm),profile};
}

export function firmResolutionOptions(region,polity,firm,territories=[]){
  const a=assessFirmDistress(region,polity,firm,territories);
  return [
    {id:'bailout',label:'Provide emergency finance',available:a.treasury>=a.bailoutCost,cost:a.bailoutCost,summary:'Keep the firm operating with public capital in exchange for a government claim.'},
    {id:'buyout',label:'Buy out and nationalise the enterprise',available:a.treasury>=a.buyoutCost,cost:a.buyoutCost,summary:'Purchase the distressed firm and continue its operations as a state enterprise.'},
    {id:'restructure',label:'Force a creditor restructuring',available:a.debt>0.01,cost:0,summary:'Write down debt and existing equity. Creditors take losses; the firm survives under tighter finances.'},
    {id:'insolvency',label:'Allow orderly insolvency',available:true,cost:0,summary:'Liquidate the firm. Owners and creditors lose money and uncovered social or rehabilitation costs may fall on the public.'},
  ];
}

function spendTreasury(polity,territories,amount){
  const region=capitalRegion(polity,territories),cost=Math.max(0,Number(amount)||0);
  if(!region||Math.max(0,Number(region.treasury)||0)+1e-9<cost)return false;
  region.treasury-=cost;return true;
}
function addPublicLiability(region,amount,kind='enterprise_failure'){
  region.publicLiabilities ||= {enterpriseFailure:0,environmentalCleanup:0,serviceContinuity:0};
  region.publicLiabilities.enterpriseFailure += Math.max(0,amount);
  if(kind==='environmental_cleanup') region.publicLiabilities.environmentalCleanup += Math.max(0,amount);
  if(kind==='service_continuity') region.publicLiabilities.serviceContinuity += Math.max(0,amount);
}

export function resolveFirmDistress({region,polity,firm,territories=[],choice,currentTick=0}){
  if(!region||!polity||!firm||!['active','distressed'].includes(firm.status))return{resolved:false,reason:'firm_unavailable'};
  const a=assessFirmDistress(region,polity,firm,territories);
  const options=firmResolutionOptions(region,polity,firm,territories);
  const option=options.find(o=>o.id===choice);
  if(!option||!option.available)return{resolved:false,reason:'option_unavailable',assessment:a,options};
  firm.distressResolvedTick=currentTick;
  firm.lastResolution=choice;
  if(choice==='bailout'){
    if(!spendTreasury(polity,territories,a.bailoutCost))return{resolved:false,reason:'insufficient_treasury'};
    const preEquity=Math.max(.01,Number(firm.equityIndex)||a.capital*.5);
    firm.equityIndex=preEquity+a.bailoutCost;
    firm.stateStake=clamp((Number(firm.stateStake)||0)+a.bailoutCost/Math.max(.01,preEquity+a.bailoutCost));
    firm.solvency=clamp(Math.max(.38,(firm.solvency||0)+.34));
    firm.status='active';
    return{resolved:true,choice,cost:a.bailoutCost,stateStake:firm.stateStake,assessment:a,summary:`The government injected ${a.bailoutCost.toFixed(2)} and took a ${Math.round(firm.stateStake*100)}% claim in the firm.`};
  }
  if(choice==='buyout'){
    if(!spendTreasury(polity,territories,a.buyoutCost))return{resolved:false,reason:'insufficient_treasury'};
    const created=createStateEnterprise(polity,{name:`${region.name} ${String(firm.sector).replaceAll('_',' ')} enterprise`,sectors:[firm.sector],governmentCapital:a.buyoutCost,stateOwnership:1,profitTarget:0.03,serviceObligation:.65,commercialIndependence:.5});
    if(!created.created)return{resolved:false,reason:created.reason||'state_enterprise_failed'};
    const enterprise=created.enterprise;
    enterprise.cash=Math.max(0,a.buyoutCost*.12);
    enterprise.investedCapital=a.capital;
    enterprise.debt=a.debt*(1-a.restructuringWriteDown*.35);
    enterprise.assets=[{sourceFirmId:firm.id,regionId:region.id,bookValue:a.capital}];
    firm.status='nationalised';firm.successorEnterpriseId=enterprise.id;firm.defaultTick=currentTick;
    return{resolved:true,choice,cost:a.buyoutCost,enterprise,assessment:a,summary:`The state bought the distressed enterprise and transferred its operating assets into ${enterprise.name}.`};
  }
  if(choice==='restructure'){
    const haircut=a.restructuringWriteDown;
    firm.debtIndex=a.debt*(1-haircut);
    firm.equityIndex=Math.max(0,(Number(firm.equityIndex)||0)*(1-haircut*.8));
    firm.solvency=clamp(Math.max(.32,(firm.solvency||0)+haircut*.55));
    firm.status='active';
    const s=region.corporateCapital||{};s.creditorTrust=clamp((s.creditorTrust??.5)-haircut*.12);s.failedFirmPressure=clamp((s.failedFirmPressure||0)+haircut*.08);
    return{resolved:true,choice,haircut,assessment:a,summary:`Creditors accepted a ${Math.round(haircut*100)}% write-down. The enterprise survives, but lenders have become more cautious.`};
  }
  const assetRecovery=Math.min(a.capital,a.debt+a.capital*.18)*clamp(.35+(firm.solvency||0)*.5);
  const creditorLoss=Math.max(0,a.debt-assetRecovery);
  const ownerRecourse=(1-a.limitedLiability)*Math.min(creditorLoss,a.capital*.28);
  const cleanupPublic=Math.max(0,a.uncoveredLiability-ownerRecourse);
  const servicePublic=a.serviceImportance*a.capital*.08;
  addPublicLiability(region,cleanupPublic,'environmental_cleanup');
  addPublicLiability(region,servicePublic,'service_continuity');
  region.enterpriseExternalities ||= {};
  region.enterpriseExternalities.futureLiability=clamp((region.enterpriseExternalities.futureLiability||0)+cleanupPublic/Math.max(.1,a.capital)*.12);
  const s=region.corporateCapital||{};s.creditorTrust=clamp((s.creditorTrust??.5)-Math.min(.28,creditorLoss/Math.max(.1,a.debt)*.22));
  firm.status='defaulted';firm.defaultTick=currentTick;firm.creditorLoss=creditorLoss;firm.publicFailureCost=cleanupPublic+servicePublic;
  return{resolved:true,choice,creditorLoss,ownerRecourse,cleanupPublic,servicePublic,assessment:a,summary:`The firm entered insolvency. Creditors lost ${creditorLoss.toFixed(2)}; uncovered public liabilities total ${(cleanupPublic+servicePublic).toFixed(2)}.`};
}

export function chooseNpcFirmResolution(region,polity,firm,territories=[],context={}){
  const a=assessFirmDistress(region,polity,firm,territories);
  const fiscalRoom=clamp(a.treasury/Math.max(.1,a.buyoutCost*3));
  const harm=clamp(a.profile.labourHarm*.2+a.profile.customerHarm*.15+a.profile.environmentalHarm*.25+a.profile.futureLiability*.25+a.serviceImportance*.25);
  const capitalShortage=clamp(context.capitalShortage||0);
  const stateControl=clamp(context.stateControl??polity?.economicOwnership?.stateControl??0);
  const bailoutScore=fiscalRoom*.35+a.strategic*.25+harm*.2-capitalShortage*.18;
  const buyoutScore=fiscalRoom*.3+a.strategic*.32+harm*.2+stateControl*.12-capitalShortage*.15;
  const restructureScore=clamp(.34+a.debt/Math.max(.1,a.capital)*.18+(1-fiscalRoom)*.2);
  const insolvencyScore=clamp(.25+(1-a.strategic)*.22+(1-fiscalRoom)*.22-harm*.16);
  const choices=[['bailout',bailoutScore],['buyout',buyoutScore],['restructure',restructureScore],['insolvency',insolvencyScore]]
    .filter(([id])=>firmResolutionOptions(region,polity,firm,territories).find(o=>o.id===id)?.available)
    .sort((x,y)=>y[1]-x[1]);
  return choices[0]?.[0]||'insolvency';
}

export function createFirmDistressEvent(region,polity,firm,territories=[],currentTick=0){
  const assessment=assessFirmDistress(region,polity,firm,territories);
  return{type:'commercial_firm_distress',regionId:region.id,polityId:polity?.id||null,firmId:firm.id,sector:firm.sector,assessment,options:firmResolutionOptions(region,polity,firm,territories),createdTick:currentTick};
}
