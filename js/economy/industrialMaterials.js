import { ensureCircularEconomy } from './circularEconomy.js?v=20260923-material-substitution1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

export const POLYMER_APPLICATIONS=Object.freeze({
  GENERAL:'general',
  VEHICLE:'vehicle',
  MILITARY_VEHICLE:'military_vehicle',
  AIRCRAFT:'aircraft',
  ELECTRICAL:'electrical',
  ELECTRONICS:'electronics',
  CONSUMER:'consumer',
});

const PRODUCT_POLYMER_INTENSITY=Object.freeze({
  motor_vehicle:.32,
  towed_artillery:.06,
  self_propelled_gun:.14,
  tank:.12,
  fighter:.18,
  bomber:.24,
  transport_aircraft:.23,
  computers:.35,
});

function tech(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function stock(region,key){return nonNegative(region?.stockpile?.[key]);}
function manufacture(region){return clamp(region?.structuralTransformation?.capability?.manufacture||0);}
function sophistication(region){return clamp(region?.industrialProduction?.factorySophistication||0);}

export function ensureIndustrialMaterials(region){
  region.industrialMaterials||={};
  const s=region.industrialMaterials;
  s.lastProducts||={};
  s.cumulativePolymerUse=nonNegative(s.cumulativePolymerUse);
  s.cumulativeBiomaterialUse=nonNegative(s.cumulativeBiomaterialUse);
  s.cumulativeConventionalFallback=nonNegative(s.cumulativeConventionalFallback);
  return s;
}

export function productPolymerIntensity(productId){
  return PRODUCT_POLYMER_INTENSITY[productId]??.10;
}

function substitutionCapability(region){
  const circular=ensureCircularEconomy(region);
  return clamp(Math.max(circular.capability?.substitution||0,circular.plasticSubstitution||0));
}

function biomaterialCapability(region){
  const substitution=substitutionCapability(region);
  const biotech=tech(region,'crop_biotechnology')||tech(region,'industrial_biotechnology')||tech(region,'precision_fermentation');
  const advanced=tech(region,'advanced_factories')||tech(region,'industrial_ecodesign');
  return clamp((advanced?.24:0)+(biotech?.24:0)+substitution*.52);
}

function naturalCompositeCapability(region){
  const substitution=substitutionCapability(region);
  const factory=tech(region,'advanced_factories')?.22:0;
  return clamp(.18+manufacture(region)*.24+sophistication(region)*.16+substitution*.36+factory);
}

export function polymerMaterialOptions(region,{application=POLYMER_APPLICATIONS.GENERAL}={}){
  const electrical=application===POLYMER_APPLICATIONS.ELECTRICAL||application===POLYMER_APPLICATIONS.ELECTRONICS;
  const bio=biomaterialCapability(region),natural=naturalCompositeCapability(region);
  const petroleum=stock(region,'industrial_polymers');
  const food=stock(region,'food'),wood=stock(region,'wood');
  return [
    {id:'petrochemical_polymer',label:'Petrochemical polymers',available:petroleum>0,stock:petroleum,utilityPerInput:1,mass:1,cost:.92,performance:1.04},
    {id:'biopolymer',label:'Bioplastics / bio-based polymers',available:bio>.20&&food>0,stock:food,utilityPerInput:.72+.22*bio,mass:1.03,cost:1.03,performance:1.015},
    {id:'natural_fibre_composite',label:'Natural-fibre composite',available:!electrical&&natural>.16&&wood>0,stock:wood,utilityPerInput:.55+.25*natural,mass:1.10,cost:1.06,performance:.985},
    {id:'conventional_substitute',label:electrical?'Glass, ceramic, rubber and metal substitutes':'Metal, timber, glass and other conventional substitutes',available:true,stock:Infinity,utilityPerInput:1,mass:electrical?1.16:1.14,cost:electrical?1.12:1.09,performance:electrical?.93:.95},
  ];
}

function consumeStock(region,key,amount){
  region.stockpile||={};
  const take=Math.min(stock(region,key),nonNegative(amount));
  region.stockpile[key]=stock(region,key)-take;
  return take;
}

export function consumePolymerUtility(region,utilityNeeded,{application=POLYMER_APPLICATIONS.GENERAL,allowConventionalFallback=true}={}){
  const target=nonNegative(utilityNeeded);
  const state=ensureIndustrialMaterials(region);
  if(target<=0)return {requested:0,covered:0,coverage:1,sourceMix:{},massMultiplier:1,costMultiplier:1,performanceMultiplier:1};
  const options=polymerMaterialOptions(region,{application});
  let remaining=target,mass=0,cost=0,performance=0,covered=0;
  const sourceMix={};
  for(const option of options){
    if(remaining<=1e-9)break;
    if(!option.available)continue;
    if(option.id==='conventional_substitute'&&!allowConventionalFallback)continue;
    let utility=remaining,input=utility/option.utilityPerInput;
    if(Number.isFinite(option.stock)){
      const key=option.id==='petrochemical_polymer'?'industrial_polymers':option.id==='biopolymer'?'food':'wood';
      const available=stock(region,key);
      input=Math.min(input,available);utility=input*option.utilityPerInput;
      consumeStock(region,key,input);
    }
    if(utility<=0)continue;
    sourceMix[option.id]=(sourceMix[option.id]||0)+utility;
    covered+=utility;remaining-=utility;
    mass+=utility*option.mass;cost+=utility*option.cost;performance+=utility*option.performance;
  }
  const coverage=clamp(covered/target);
  const denom=Math.max(1e-9,covered);
  const result={requested:target,covered,coverage,sourceMix,massMultiplier:mass/denom,costMultiplier:cost/denom,performanceMultiplier:performance/denom};
  state.cumulativePolymerUse+=sourceMix.petrochemical_polymer||0;
  state.cumulativeBiomaterialUse+=(sourceMix.biopolymer||0)+(sourceMix.natural_fibre_composite||0);
  state.cumulativeConventionalFallback+=sourceMix.conventional_substitute||0;
  return result;
}

export function previewProductMaterialPlan(region,productId,{application=null}={}){
  const intensity=productPolymerIntensity(productId);
  const inferred=application||(
    productId==='motor_vehicle'?POLYMER_APPLICATIONS.VEHICLE:
    ['tank','self_propelled_gun','towed_artillery'].includes(productId)?POLYMER_APPLICATIONS.MILITARY_VEHICLE:
    ['fighter','bomber','transport_aircraft'].includes(productId)?POLYMER_APPLICATIONS.AIRCRAFT:
    POLYMER_APPLICATIONS.GENERAL
  );
  const options=polymerMaterialOptions(region,{application:inferred});
  const preferred=options.find(o=>o.available)||options[options.length-1];
  return {
    productId,intensity,application:inferred,preferredMaterial:preferred.id,
    massMultiplier:1-intensity*(1-preferred.mass),
    costMultiplier:1-intensity*(1-preferred.cost),
    performanceMultiplier:1+intensity*(preferred.performance-1),
    throughputMultiplier:clamp(1+intensity*(1.04/preferred.cost-1),.88,1.10),
    canProduceWithoutPetrochemicalPlastic:true,
  };
}

export function consumeProductMaterials(region,productId,units,{application=null}={}){
  const plan=previewProductMaterialPlan(region,productId,{application});
  const utility=nonNegative(units)*plan.intensity;
  const used=consumePolymerUtility(region,utility,{application:plan.application,allowConventionalFallback:true});
  const state=ensureIndustrialMaterials(region);
  const result={...plan,units:nonNegative(units),...used};
  state.lastProducts[productId]=result;
  return result;
}

export function industrialMaterialsSummary(region){
  const s=ensureIndustrialMaterials(region);
  return {
    industrialPolymers:stock(region,'industrial_polymers'),
    biomaterialCapability:biomaterialCapability(region),
    naturalCompositeCapability:naturalCompositeCapability(region),
    cumulativePolymerUse:s.cumulativePolymerUse,
    cumulativeBiomaterialUse:s.cumulativeBiomaterialUse,
    cumulativeConventionalFallback:s.cumulativeConventionalFallback,
    lastProducts:{...s.lastProducts},
  };
}
