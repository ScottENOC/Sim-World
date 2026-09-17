import { reviewNpcEconomicRegulation } from './economicRegulation.js';
import { chooseNpcInvestmentPolicy, ensureInvestmentPolicy } from './infrastructureInvestment.js';
import { chooseNpcProcurementPolicy, ensureIndustrialSupply, ensureProcurementPolicy } from './industrialSupply.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||null;}
function territoriesFor(regions,id){return (regions||[]).filter(region=>polityId(region)===id);}
function activeWar(polity){return !!((polity?.atWarWith?.length)||(polity?.enemiesAtWar?.length)||(polity?.wars||[]).some(w=>w?.active!==false));}
function securityThreat(polity,territories){
  if(activeWar(polity))return 1;
  const pressure=territories.reduce((max,region)=>Math.max(max,Number(region?.report?.conflict?.pressure||region?.conflictPressure||0)),0);
  const instability=territories.length?territories.reduce((sum,region)=>sum+(1-clamp(region?.stability??1)),0)/territories.length:0;
  return clamp(pressure*.7+instability*.35);
}
function domesticCapability(territories){
  if(!territories.length)return 0;
  let weighted=0,total=0;
  for(const region of territories){
    const s=ensureIndustrialSupply(region),pop=Math.max(1,Number(region.population)||1),c=s.capability;
    const score=clamp((c.steelmaking||0)*.18+(c.precision_machining||0)*.22+(c.railway_engineering||0)*.25+(c.locomotive_engineering||0)*.2+(c.rail_vehicle_manufacture||0)*.15);
    weighted+=score*pop; total+=pop;
  }
  return total?clamp(weighted/total):0;
}
function foreignDependence(polity,territories){
  let foreign=0,total=0;
  for(const region of territories)for(const asset of region.corporateInfrastructure?.assets||[]){if(asset.status==='destroyed')continue;const value=Math.max(1,Number(asset.value)||1);total+=value;if(asset.foreignOwner)foreign+=value;}
  for(const line of polity?.railways?.lines||[]){if(line.status==='destroyed')continue;const value=Math.max(1,Number(line.value)||Number(line.lengthKm)||1);total+=value;if(line.foreignOwner)foreign+=value;}
  return total?clamp(foreign/total):0;
}
function capitalShortage(territories){
  if(!territories.length)return 1;
  const treasury=territories.reduce((sum,region)=>sum+Math.max(0,Number(region.treasury)||0),0);
  const corporate=territories.reduce((sum,region)=>sum+(region.corporateCapital?.firms||[]).filter(f=>f.status==='active').reduce((s,f)=>s+Math.max(0,Number(f.capitalIndex)||0),0),0);
  const population=territories.reduce((sum,region)=>sum+Math.max(0,Number(region.population)||0),0);
  const capitalPerCapita=(treasury+corporate*80)/Math.max(1,population);
  return clamp(1-capitalPerCapita/0.08);
}
function industrialAmbition(polity,territories,capability){
  if(Number.isFinite(polity?.industrialAmbition))return clamp(polity.industrialAmbition);
  const population=territories.reduce((sum,region)=>sum+Math.max(0,Number(region.population)||0),0);
  const trade=territories.reduce((sum,region)=>sum+Math.max(0,Number(region.tradeEconomy?.exportIncomeEma)||0)+Math.max(0,Number(region.tradeEconomy?.importSpendEma)||0),0);
  return clamp(Math.log1p(population)/18*.35+Math.log1p(trade)/10*.2+capability*.45);
}
export function reviewNpcGovernmentEconomicPolicies(regions,polities,playerPolityId=null){
  const changes=[];
  for(const polity of polities||[]){
    if(!polity?.id||polity.id===playerPolityId)continue;
    const territories=territoriesFor(regions,polity.id); if(!territories.length)continue;
    const capability=domesticCapability(territories),dependence=foreignDependence(polity,territories),security=securityThreat(polity,territories),shortage=capitalShortage(territories),ambition=industrialAmbition(polity,territories,capability);
    const previousInvestment={...ensureInvestmentPolicy(polity)},previousProcurement=ensureProcurementPolicy(polity).infrastructure;
    chooseNpcInvestmentPolicy(polity,{securityThreat:security,foreignDependence:dependence,industrialAmbition:ambition,capitalShortage:shortage,hostility:security});
    chooseNpcProcurementPolicy(polity,{securityThreat:security,industrialAmbition:ambition,domesticCapability:capability,capitalShortage:shortage,foreignDependence:dependence});
    const regulationReview=reviewNpcEconomicRegulation(polity,territories,{securityThreat:security,industrialAmbition:ambition,capitalShortage:shortage,foreignDependence:dependence});
    const nextInvestment=ensureInvestmentPolicy(polity),nextProcurement=ensureProcurementPolicy(polity).infrastructure;
    if(previousInvestment.general!==nextInvestment.general||previousInvestment.strategic!==nextInvestment.strategic||previousProcurement!==nextProcurement)changes.push({polityId:polity.id,investment:{...nextInvestment},procurement:nextProcurement,regulationChanges:regulationReview.changes,metrics:{securityThreat:security,foreignDependence:dependence,domesticCapability:capability,capitalShortage:shortage,industrialAmbition:ambition}});
  }
  return changes;
}
