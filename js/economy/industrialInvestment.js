import { activeTariffs } from './tradePolicy.js?v=20260919-investment1';
import { addProductionLine, ensureIndustrialPlantState, industrialFactoryCapacity, PRODUCT_RECIPES, retoolProductionLine, tickIndustrialPlants, productCapability } from './industrialPlant.js?v=20260919-investment1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const YEARS=(days)=>Math.max(0,Number(days)||0)/365.2425;
const PRODUCTS=['motor_vehicle','self_propelled_gun','tank'];

export function ensureIndustrialInvestmentState(region){
  region.industrialInvestment ||= {demandEma:{},marginEma:{},subsidyRate:{},procurement:{},last:{}};
  const s=region.industrialInvestment;
  s.demandEma ||= {}; s.marginEma ||= {}; s.subsidyRate ||= {}; s.procurement ||= {}; s.last ||= {};
  for(const p of PRODUCTS){if(!Number.isFinite(s.demandEma[p]))s.demandEma[p]=0;if(!Number.isFinite(s.marginEma[p]))s.marginEma[p]=0;if(!Number.isFinite(s.subsidyRate[p]))s.subsidyRate[p]=0;if(!Number.isFinite(s.procurement[p]))s.procurement[p]=0;}
  return s;
}

export function setIndustrialSubsidy(region,productId,rate=0){
  const s=ensureIndustrialInvestmentState(region);s.subsidyRate[productId]=clamp(rate,0,.8);return s.subsidyRate[productId];
}

function importTariffRate(region,productId){
  let rate=0;
  for(const rule of activeTariffs(region)){
    if(rule.direction!=='import'&&rule.direction!=='trade')continue;
    if(rule.counterparties?.length)continue;
    if(rule.goods?.length&&!rule.goods.includes(productId))continue;
    rate=Math.max(rate,Number(rule.tariffRate)||0);
  }
  return clamp(rate,0,2);
}

function civilianVehicleDemand(region){
  if(!region.unlockedTechIds?.has?.('automobile'))return 0;
  const pop=Math.max(0,region.population||0),roads=clamp((region.construction?.assets||[]).some(a=>a.typeId==='road_network'&&(a.condition??1)>.25)?1:0);
  const wealth=clamp(Math.log1p(Math.max(0,region.wallet||0)/Math.max(1,pop)*1200)/5);
  const fuel=clamp(((region.stockpile?.petrol||0)+(region.stockpile?.diesel||0))/Math.max(5,pop*.002));
  const urban=clamp(region.structuralTransformation?.urbanShare||region.urbanisation?.urbanShare||0);
  return pop/10000*(.12+.58*wealth+.18*urban)*(.35+.45*roads+.20*fuel);
}

function militaryProcurementDemand(region,productId){
  const war=region.warEconomy||{},army=Math.max(0,(region.army?.personnel||0)+(region.army?.away||0));
  const readiness=productCapability(region,productId);
  if(readiness<.16||army<500)return 0;
  const wartime=war.activeCampaigns>0?1:0;
  const base=army/5000*(productId==='tank'?.75:.55);
  return base*(wartime?2.4:.35)*clamp((readiness-.12)/.55,0,1);
}

function strategicDemand(region,productId){
  if(productId==='motor_vehicle')return civilianVehicleDemand(region);
  return militaryProcurementDemand(region,productId);
}

function expectedMargin(region,productId,demand){
  const s=ensureIndustrialInvestmentState(region),tariff=productId==='motor_vehicle'?importTariffRate(region,productId):0,subsidy=clamp(s.subsidyRate[productId]||0,0,.8);
  const capability=clamp(productCapability(region,productId));
  const scale=clamp(demand/Math.max(1,industrialFactoryCapacity(region)*.18));
  const finance=clamp(region.corporateCapital?.financialDepth||0),credit=clamp(region.corporateCapital?.creditorTrust||.5);
  const inputStress=clamp(((region.stockpile?.steel||0)<4?0.22:0)+((region.industrialSupply?.inventory?.machine_components||0)<2?0.18:0));
  return clamp(.08+scale*.34+capability*.20+finance*.10+credit*.08+tariff*.20+subsidy*.30-inputStress,0,1.5);
}

function lineFor(state,productId){return state.lines.find(l=>l.productId===productId&&l.status!=='closed_no_factory');}
function idleCandidate(state,newProduct){
  const candidates=state.lines.filter(l=>['idle','mothballed'].includes(l.status)||!l.productId);
  if(!candidates.length)return null;
  const recipe=PRODUCT_RECIPES[newProduct]?.components||{};
  const similarity=(line)=>{const old=PRODUCT_RECIPES[line.productId]?.components||{};const keys=new Set([...Object.keys(old),...Object.keys(recipe)]);let a=0,b=0;for(const k of keys){a+=Math.min(old[k]||0,recipe[k]||0);b+=Math.max(old[k]||0,recipe[k]||0);}return b?a/b:0;};
  return [...candidates].sort((a,b)=>similarity(b)-similarity(a))[0];
}

function ensureComponentOrdersAndLines(region,productId,demand){
  const plant=ensureIndustrialPlantState(region),recipe=PRODUCT_RECIPES[productId]?.components||{};region.industrialOrders ||= {};
  for(const [component,per] of Object.entries(recipe)){
    const key=`component:${component}`;const shortage=Math.max(0,demand*per-(plant.componentInventory[component]||0));
    if(shortage<=0)continue;region.industrialOrders[key]=Math.max(region.industrialOrders[key]||0,shortage);
    if(!lineFor(plant,key)&&plant.lines.length<18)addProductionLine(region,{productId:key,capacityShare:.18});
  }
}

function manageProductLine(region,productId,demand,margin){
  const plant=ensureIndustrialPlantState(region);let line=lineFor(plant,productId);
  if(demand>.08&&margin>.26){
    if(!line){const candidate=idleCandidate(plant,productId);line=candidate?retoolProductionLine(region,candidate.id,productId):addProductionLine(region,{productId,capacityShare:productId==='motor_vehicle'?.48:.35});}
    ensureComponentOrdersAndLines(region,productId,demand);
    region.industrialOrders ||= {};region.industrialOrders[productId]=Math.max(region.industrialOrders[productId]||0,demand);
  } else if(line&&margin<.14){line.idleWeeks=Math.max(line.idleWeeks||0,104);line.status='mothballed';}
}

function placeGovernmentOrders(region,demands,elapsedDays){
  const s=ensureIndustrialInvestmentState(region),years=YEARS(elapsedDays);let committed=0;
  for(const p of ['self_propelled_gun','tank']){
    const unitCost=p==='tank'?.34:.26;const desired=Math.max(0,demands[p]||0);const affordable=Math.max(0,region.treasury||0)/Math.max(.001,unitCost);
    const order=Math.min(desired,affordable*clamp(years*8,0,1));s.procurement[p]=order;committed+=order*unitCost;
  }
  s.last.procurementCommitment=committed;
}

function settleProduction(region,elapsedDays){
  const s=ensureIndustrialInvestmentState(region),plant=ensureIndustrialPlantState(region);let militarySpend=0,subsidySpend=0,revenue=0;
  for(const line of plant.lines){const output=Math.max(0,line.lastOutput||0),p=line.productId;if(!output||!p)continue;
    if(p==='tank'||p==='self_propelled_gun'){
      const unitCost=p==='tank'?.34:.26;const due=output*unitCost;const paid=Math.min(Math.max(0,region.treasury||0),due);region.treasury=Math.max(0,(region.treasury||0)-paid);revenue+=paid;militarySpend+=paid;
    } else if(p==='motor_vehicle'){
      const price=.08;revenue+=output*price;const rate=clamp(s.subsidyRate[p]||0,0,.8),due=output*price*rate,paid=Math.min(Math.max(0,region.treasury||0),due);region.treasury=Math.max(0,(region.treasury||0)-paid);revenue+=paid;subsidySpend+=paid;
    }
  }
  region.wallet=(region.wallet||0)+revenue*.35;
  const firms=region.corporateCapital?.firms?.filter(f=>f.status==='active'&&f.sector==='manufacture')||[];
  if(firms.length){const each=revenue*.65/firms.length;for(const f of firms){f.capitalIndex=Math.max(0,(f.capitalIndex||0)+each*.08);f.profitability=clamp((f.profitability||0)+Math.min(.08,each*.004),-.5,.5);}}
  s.last={...s.last,revenue,militarySpend,subsidySpend};
}

export function tickIndustrialInvestment(region,elapsedDays=7){
  const s=ensureIndustrialInvestmentState(region);if(industrialFactoryCapacity(region)<=0){s.last={factoryCapacity:0};return s;}
  const demands={};for(const p of PRODUCTS){const raw=strategicDemand(region,p);s.demandEma[p]+=(raw-s.demandEma[p])*clamp(YEARS(elapsedDays)*2.4,0,.35);demands[p]=Math.max(raw,s.demandEma[p]);const m=expectedMargin(region,p,demands[p]);s.marginEma[p]+=(m-s.marginEma[p])*clamp(YEARS(elapsedDays)*3,0,.4);}
  placeGovernmentOrders(region,demands,elapsedDays);
  for(const p of PRODUCTS){const demand=p==='motor_vehicle'?demands[p]:Math.min(demands[p],s.procurement[p]||0);manageProductLine(region,p,demand,s.marginEma[p]);}
  tickIndustrialPlants(region,elapsedDays);settleProduction(region,elapsedDays);
  s.last={...s.last,factoryCapacity:industrialFactoryCapacity(region),demands,margins:{...s.marginEma},tariffSupport:importTariffRate(region,'motor_vehicle')};
  region.report ||= {};region.report.industrialInvestment=s.last;return s;
}
