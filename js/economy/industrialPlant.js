const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const INDUSTRIAL_COMPONENTS=Object.freeze({
  ENGINE:'engine', TRANSMISSION:'transmission', TRACKED_RUNNING_GEAR:'tracked_running_gear',
  WHEELED_CHASSIS:'wheeled_chassis', GUN_SYSTEM:'gun_system', ARMOUR_PLATE:'armour_plate',
  OPTICS:'optics', ELECTRONICS:'electronics', HULL_FABRICATION:'hull_fabrication',
});

export const PRODUCT_RECIPES=Object.freeze({
  motor_vehicle:{kind:'assembly',components:{engine:1,transmission:1,wheeled_chassis:1,hull_fabrication:.35,optics:.05,electronics:.04}},
  towed_artillery:{kind:'assembly',components:{gun_system:1,wheeled_chassis:.45,optics:.20,hull_fabrication:.20,electronics:.04}},
  self_propelled_gun:{kind:'assembly',components:{engine:1,transmission:1,tracked_running_gear:1,gun_system:1,armour_plate:.65,optics:.35,electronics:.12,hull_fabrication:.8}},
  tank:{kind:'assembly',components:{engine:1,transmission:1,tracked_running_gear:1,gun_system:.85,armour_plate:1,optics:.45,electronics:.18,hull_fabrication:1}},
});

const COMPONENT_INPUTS=Object.freeze({
  engine:{steel:.7,machine_components:.55}, transmission:{steel:.45,machine_components:.5},
  tracked_running_gear:{steel:1.1,machine_components:.28}, wheeled_chassis:{steel:.55,machine_components:.22},
  gun_system:{steel:1.0,machine_components:.42}, armour_plate:{steel:1.25}, optics:{machine_components:.18},
  electronics:{machine_components:.22}, hull_fabrication:{steel:.8},
});

function hasTech(region,id){return Boolean(region.unlockedTechIds?.has?.(id));}
function factoryAssets(region){return (region.construction?.assets||[]).filter(a=>a.typeId==='factory'&&(a.condition??1)>.15);}
function baseFactoryCapacity(region){
  const assets=factoryAssets(region); if(!assets.length)return 0;
  const sophistication=clamp(region.industrialProduction?.factorySophistication||0);
  const advanced=hasTech(region,'advanced_factories')?1:0;
  return assets.reduce((sum,a)=>sum+Math.max(.2,a.scale||1)*clamp(a.condition??1),0)*(24+advanced*10+sophistication*16);
}

export function ensureIndustrialPlantState(region){
  region.industrialPlants||={lines:[],componentInventory:{},componentCapability:{},productExperience:{},nextLineId:1};
  const s=region.industrialPlants; s.lines||=[];s.componentInventory||={};s.componentCapability||={};s.productExperience||={};
  if(!Number.isFinite(s.nextLineId))s.nextLineId=1;
  for(const c of Object.values(INDUSTRIAL_COMPONENTS)){if(!Number.isFinite(s.componentInventory[c]))s.componentInventory[c]=0;if(!Number.isFinite(s.componentCapability[c]))s.componentCapability[c]=0;}
  return s;
}

export function industrialFactoryCapacity(region){return baseFactoryCapacity(region);}

export function factoryRequiredFor(region,productId){
  if(!(productId in PRODUCT_RECIPES)&&!String(productId).startsWith('component:'))return false;
  return factoryAssets(region).length>0;
}

export function addProductionLine(region,{productId=null,capacityShare=1}={}){
  if(!factoryAssets(region).length)throw new Error('An operational factory is required before creating a production line');
  const s=ensureIndustrialPlantState(region);
  const line={id:`line-${s.nextLineId++}`,productId,status:productId?'active':'idle',capacityShare:clamp(capacityShare,.05,1),toolingFit:productId?1:0,idleWeeks:0,retoolWeeksRemaining:0,lastOutput:0};
  s.lines.push(line);return line;
}

function productSimilarity(a,b){
  if(!a||!b)return 0; if(a===b)return 1;
  const ra=PRODUCT_RECIPES[a]?.components,rb=PRODUCT_RECIPES[b]?.components;
  if(!ra||!rb){if(String(a).startsWith('component:')&&String(b).startsWith('component:'))return .45;return .15;}
  const keys=new Set([...Object.keys(ra),...Object.keys(rb)]);let shared=0,total=0;
  for(const k of keys){shared+=Math.min(ra[k]||0,rb[k]||0);total+=Math.max(ra[k]||0,rb[k]||0);}return total?shared/total:0;
}

export function retoolProductionLine(region,lineId,newProductId){
  const s=ensureIndustrialPlantState(region),line=s.lines.find(l=>l.id===lineId);if(!line)throw new Error(`Unknown production line ${lineId}`);
  const similarity=productSimilarity(line.productId,newProductId);line.previousProductId=line.productId;line.productId=newProductId;
  line.toolingFit=clamp(.25+similarity*.7);line.retoolWeeksRemaining=Math.ceil((1-similarity)*26);line.status='retooling';line.idleWeeks=0;return line;
}

function consumeInventory(region,inputs,amount){
  let fraction=1;const inv=region.industrialSupply?.inventory||{};
  for(const [key,per] of Object.entries(inputs||{})){const store=key==='machine_components'?inv:region.stockpile||{};fraction=Math.min(fraction,(store[key]||0)/Math.max(.0001,per*amount));}
  fraction=clamp(fraction);const actual=amount*fraction;
  for(const [key,per] of Object.entries(inputs||{})){const store=key==='machine_components'?inv:region.stockpile||{};store[key]=Math.max(0,(store[key]||0)-per*actual);}return actual;
}

function componentQuality(region,component){
  const s=ensureIndustrialPlantState(region);const general=clamp(region.industrialSupply?.capability?.precision_machining||0);
  return clamp(s.componentCapability[component]*.78+general*.22);
}

export function productComponentProfile(region,productId){
  const recipe=PRODUCT_RECIPES[productId]?.components||{};const out={};for(const c of Object.keys(recipe))out[c]=componentQuality(region,c);return out;
}

export function productCapability(region,productId){
  const recipe=PRODUCT_RECIPES[productId]?.components;if(!recipe)return 0;let weighted=0,total=0;
  for(const [c,w] of Object.entries(recipe)){weighted+=componentQuality(region,c)*w;total+=w;}
  const integration=clamp(ensureIndustrialPlantState(region).productExperience[productId]||0);
  return clamp((total?weighted/total:0)*.82+integration*.18);
}

function learnComponents(region,productId,output,capacity){
  if(output<=0)return;const s=ensureIndustrialPlantState(region);const recipe=PRODUCT_RECIPES[productId]?.components||{};
  const intensity=clamp(output/Math.max(1,capacity));
  for(const [c,w] of Object.entries(recipe)){const gain=.0035*intensity*clamp(w);s.componentCapability[c]=clamp(s.componentCapability[c]+gain*(1-s.componentCapability[c]));}
  s.productExperience[productId]=clamp((s.productExperience[productId]||0)+.0045*intensity*(1-(s.productExperience[productId]||0)));
}

function produceComponent(region,component,requested){
  const s=ensureIndustrialPlantState(region);const actual=consumeInventory(region,COMPONENT_INPUTS[component]||{},requested);s.componentInventory[component]+=actual;
  const general=clamp(region.industrialSupply?.capability?.precision_machining||0);s.componentCapability[component]=clamp(s.componentCapability[component]+.0025*clamp(actual/10)*(1-s.componentCapability[component])+.0003*general);return actual;
}

function assemble(region,productId,requested){
  const s=ensureIndustrialPlantState(region),recipe=PRODUCT_RECIPES[productId]?.components||{};let actual=requested;
  for(const [c,per] of Object.entries(recipe))actual=Math.min(actual,(s.componentInventory[c]||0)/Math.max(.0001,per));actual=Math.max(0,actual);
  for(const [c,per] of Object.entries(recipe))s.componentInventory[c]=Math.max(0,(s.componentInventory[c]||0)-per*actual);
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventory[productId]=(region.industrialSupply.inventory[productId]||0)+actual;return actual;
}

export function tickIndustrialPlants(region,elapsedDays=7){
  const s=ensureIndustrialPlantState(region),factoryCapacity=baseFactoryCapacity(region),weeks=Math.max(0,elapsedDays)/7;
  if(factoryCapacity<=0){for(const l of s.lines)l.status='closed_no_factory';return s;}
  const orders=region.industrialOrders||{};const active=s.lines.filter(l=>l.status!=='closed_no_factory');const shares=active.reduce((a,l)=>a+clamp(l.capacityShare,.05,1),0)||1;
  for(const line of active){
    if(line.retoolWeeksRemaining>0){line.retoolWeeksRemaining=Math.max(0,line.retoolWeeksRemaining-weeks);line.status=line.retoolWeeksRemaining>0?'retooling':'active';line.lastOutput=0;continue;}
    const demand=Math.max(0,Number(orders[line.productId])||0);if(!line.productId||demand<=0){line.idleWeeks+=weeks;line.lastOutput=0;line.status=line.idleWeeks>=104?'mothballed':'idle';if(line.idleWeeks>=260){line.productId=null;line.toolingFit=0;}continue;}
    line.idleWeeks=0;line.status='active';const cap=factoryCapacity*(line.capacityShare/shares)*clamp(line.toolingFit||1,.2,1)*weeks;
    const requested=Math.min(demand,cap);const output=String(line.productId).startsWith('component:')?produceComponent(region,String(line.productId).slice(10),requested):assemble(region,line.productId,requested);
    line.lastOutput=output;orders[line.productId]=Math.max(0,demand-output);if(PRODUCT_RECIPES[line.productId])learnComponents(region,line.productId,output,cap);
    line.toolingFit=clamp((line.toolingFit||.25)+.003*clamp(output/Math.max(1,cap))*(1-(line.toolingFit||.25)));
  }
  s.factoryCapacity=factoryCapacity;return s;
}

export function strategicIndustrialCapacity(region){
  const s=ensureIndustrialPlantState(region);return {factoryCapacity:baseFactoryCapacity(region),components:{...s.componentCapability},motorVehicle:productCapability(region,'motor_vehicle'),selfPropelledGun:productCapability(region,'self_propelled_gun'),tank:productCapability(region,'tank')};
}
