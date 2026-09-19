import {
  EQUIPMENT_FAMILIES, authoriseEquipmentMark, currentEquipmentDesign, equipmentDesignById,
  equipmentFrontierImprovement, equipmentSupportBurden, ensureCurrentArmouredVehicleDesign, ensureCurrentArtilleryDesign,
  ensureCurrentAircraftDesign,
} from '../military/equipmentGenerations.js?v=20260919-aircraft-industry2';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const INDUSTRIAL_COMPONENTS=Object.freeze({
  ENGINE:'engine', TRANSMISSION:'transmission', TRACKED_RUNNING_GEAR:'tracked_running_gear',
  WHEELED_CHASSIS:'wheeled_chassis', GUN_SYSTEM:'gun_system', ARMOUR_PLATE:'armour_plate',
  OPTICS:'optics', ELECTRONICS:'electronics', HULL_FABRICATION:'hull_fabrication',
  AIRCRAFT_ENGINE:'aircraft_engine', AIRFRAME:'airframe', WING_DESIGN:'wing_design',
  AIRCRAFT_WEAPON:'aircraft_weapon', RADIO_NAVIGATION:'radio_navigation', RADAR_SET:'radar_set',
});

export const PRODUCT_RECIPES=Object.freeze({
  motor_vehicle:{kind:'assembly',components:{engine:1,transmission:1,wheeled_chassis:1,hull_fabrication:.35,optics:.05,electronics:.04}},
  towed_artillery:{kind:'assembly',components:{gun_system:1,wheeled_chassis:.45,optics:.20,hull_fabrication:.20,electronics:.04}},
  self_propelled_gun:{kind:'assembly',components:{engine:1,transmission:1,tracked_running_gear:1,gun_system:1,armour_plate:.65,optics:.35,electronics:.12,hull_fabrication:.8}},
  tank:{kind:'assembly',components:{engine:1,transmission:1,tracked_running_gear:1,gun_system:.85,armour_plate:1,optics:.45,electronics:.18,hull_fabrication:1}},
  fighter:{kind:'assembly',components:{aircraft_engine:1,airframe:.82,wing_design:.92,aircraft_weapon:.70,radio_navigation:.30,radar_set:.08,optics:.12,electronics:.14}},
  bomber:{kind:'assembly',components:{aircraft_engine:1.25,airframe:1.15,wing_design:1.05,aircraft_weapon:.36,radio_navigation:.50,radar_set:.12,optics:.16,electronics:.18}},
  transport_aircraft:{kind:'assembly',components:{aircraft_engine:1.15,airframe:1.20,wing_design:1.10,radio_navigation:.46,radar_set:.06,optics:.08,electronics:.16}},
});

const COMPONENT_INPUTS=Object.freeze({
  engine:{steel:.7,machine_components:.55}, transmission:{steel:.45,machine_components:.5},
  tracked_running_gear:{steel:1.1,machine_components:.28}, wheeled_chassis:{steel:.55,machine_components:.22},
  gun_system:{steel:1.0,machine_components:.42}, armour_plate:{steel:1.25}, optics:{machine_components:.18},
  electronics:{machine_components:.22}, hull_fabrication:{steel:.8},
  aircraft_engine:{steel:.55,machine_components:.85}, airframe:{steel:.42,machine_components:.30},
  wing_design:{steel:.18,machine_components:.34}, aircraft_weapon:{steel:.42,machine_components:.38},
  radio_navigation:{machine_components:.34}, radar_set:{steel:.14,machine_components:.62},
});

function hasTech(region,id){return Boolean(region.unlockedTechIds?.has?.(id));}
function factoryAssets(region){
  const publicAssets=(region.construction?.assets||[]).filter(a=>a.typeId==='factory'&&(a.condition??1)>.15).map(a=>({source:'construction',scale:Math.max(.2,a.scale||1),condition:clamp(a.condition??1)}));
  const corporateAssets=(region.corporateInfrastructure?.assets||[]).filter(a=>a.type==='factory'&&a.status==='operational'&&(a.condition??1)>.15).map(a=>({source:'corporate',scale:Math.max(.2,a.effectiveCapacity||a.baseCapacity||1),condition:clamp(a.condition??1)}));
  return [...publicAssets,...corporateAssets];
}
function baseFactoryCapacity(region){
  const assets=factoryAssets(region); if(!assets.length)return 0;
  const sophistication=clamp(region.industrialProduction?.factorySophistication||0);
  const advanced=hasTech(region,'advanced_factories')?1:0;
  return assets.reduce((sum,a)=>sum+Math.max(.2,a.scale||1)*clamp(a.condition??1),0)*(24+advanced*10+sophistication*16);
}

export function ensureIndustrialPlantState(region){
  region.industrialPlants||={lines:[],componentInventory:{},componentCapability:{},productExperience:{},nextLineId:1};
  const s=region.industrialPlants; s.lines||=[];s.componentInventory||={};s.componentCapability||={};s.productExperience||={};
  if(!Number.isFinite(s.nextLineId))s.nextLineId=1;if(!Number.isFinite(s.elapsedWeeks))s.elapsedWeeks=0;if(!Number.isFinite(s.designReviewWeeks))s.designReviewWeeks=0;
  for(const c of Object.values(INDUSTRIAL_COMPONENTS)){if(!Number.isFinite(s.componentInventory[c]))s.componentInventory[c]=0;if(!Number.isFinite(s.componentCapability[c]))s.componentCapability[c]=0;}
  return s;
}

export function industrialFactoryCapacity(region){return baseFactoryCapacity(region);}

export function factoryRequiredFor(region,productId){
  if(!(productId in PRODUCT_RECIPES)&&!String(productId).startsWith('component:'))return false;
  return factoryAssets(region).length>0;
}

export function equipmentFamilyForProduct(productId){
  if(productId==='tank')return EQUIPMENT_FAMILIES.TANK;
  if(productId==='self_propelled_gun')return EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  if(productId==='towed_artillery')return EQUIPMENT_FAMILIES.FIELD_ARTILLERY;
  if(productId==='fighter')return EQUIPMENT_FAMILIES.FIGHTER;
  if(productId==='bomber')return EQUIPMENT_FAMILIES.BOMBER;
  return null;
}
function kindForProduct(productId){return productId==='towed_artillery'?'field_cannon':null;}

export function addProductionLine(region,{productId=null,capacityShare=1}={}){
  if(!factoryAssets(region).length)throw new Error('An operational factory is required before creating a production line');
  const s=ensureIndustrialPlantState(region);
  const line={id:`line-${s.nextLineId++}`,productId,status:productId?'active':'idle',capacityShare:clamp(capacityShare,.05,1),toolingFit:productId?1:0,idleWeeks:0,retoolWeeksRemaining:0,lastOutput:0,approvedDesignId:null,pendingDesignId:null};
  s.lines.push(line);return line;
}

export function productionSimilarity(a,b){
  if(!a||!b)return 0; if(a===b)return 1;
  const ra=PRODUCT_RECIPES[a]?.components,rb=PRODUCT_RECIPES[b]?.components;
  if(!ra||!rb){if(String(a).startsWith('component:')&&String(b).startsWith('component:'))return .45;return .15;}
  const keys=new Set([...Object.keys(ra),...Object.keys(rb)]);let shared=0,total=0;
  for(const k of keys){shared+=Math.min(ra[k]||0,rb[k]||0);total+=Math.max(ra[k]||0,rb[k]||0);}return total?shared/total:0;
}

export function retoolProductionLine(region,lineId,newProductId){
  const s=ensureIndustrialPlantState(region),line=s.lines.find(l=>l.id===lineId);if(!line)throw new Error(`Unknown production line ${lineId}`);
  const oldProduct=line.productId,similarity=productionSimilarity(oldProduct,newProductId);
  const relatedExperience=clamp(s.productExperience[oldProduct]||0)*similarity*.65;
  line.previousProductId=oldProduct;line.productId=newProductId;
  s.productExperience[newProductId]=Math.max(s.productExperience[newProductId]||0,relatedExperience);
  line.toolingFit=clamp(.25+similarity*.7);line.retoolWeeksRemaining=Math.ceil((1-similarity)*26);line.status='retooling';line.idleWeeks=0;line.approvedDesignId=null;line.pendingDesignId=null;return line;
}

export function quoteProductionMarkUpgrade(region,lineId){
  const line=ensureIndustrialPlantState(region).lines.find(l=>l.id===lineId);if(!line)return {available:false,reason:'unknown_line'};
  const family=equipmentFamilyForProduct(line.productId);if(!family)return {available:false,reason:'not_standardised_military_product'};
  if(!factoryAssets(region).length)return {available:false,reason:'no_operational_factory'};
  if((line.retoolWeeksRemaining||0)>0)return {available:false,reason:'line_already_retooling'};
  const current=currentEquipmentDesign(region,family),nextSequence=(current?.sequence||0)+1;
  const aircraft=family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER;
  return {available:true,family,nextSequence,machineComponents:(aircraft?9:6)+nextSequence*(aircraft?5:4),steel:(aircraft?8:10)+nextSequence*(aircraft?4:6),treasury:(aircraft?16:12)+nextSequence*(aircraft?10:8),downtimeWeeks:Math.min(30,(aircraft?7:5)+nextSequence*2)};
}

export function authoriseProductionMark(region,lineId,{tick=0,authorisedBy='player'}={}){
  const s=ensureIndustrialPlantState(region),line=s.lines.find(l=>l.id===lineId),quote=quoteProductionMarkUpgrade(region,lineId);
  if(!line||!quote.available)return {authorised:false,...quote};
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.stockpile||={};
  const inv=region.industrialSupply.inventory,treasury=Math.max(0,Number(region.treasury)||0);
  if((inv.machine_components||0)<quote.machineComponents)return {authorised:false,reason:'insufficient_machine_components',...quote};
  if((region.stockpile.steel||0)<quote.steel)return {authorised:false,reason:'insufficient_steel',...quote};
  if(treasury<quote.treasury)return {authorised:false,reason:'insufficient_treasury',...quote};
  inv.machine_components-=quote.machineComponents;region.stockpile.steel-=quote.steel;region.treasury-=quote.treasury;
  const design=authoriseEquipmentMark(region,quote.family,{kind:kindForProduct(line.productId),tick,reason:'authorised_factory_upgrade',authorisedBy});
  line.pendingDesignId=design.id;line.retoolWeeksRemaining=Math.max(line.retoolWeeksRemaining||0,quote.downtimeWeeks);line.status='retooling';line.toolingFit=Math.min(line.toolingFit||1,.88);
  line.lastModelUpgrade={tick,designId:design.id,cost:{machineComponents:quote.machineComponents,steel:quote.steel,treasury:quote.treasury},downtimeWeeks:quote.downtimeWeeks,authorisedBy};
  return {authorised:true,design,lineId,cost:line.lastModelUpgrade.cost,downtimeWeeks:quote.downtimeWeeks};
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

function initialDesignForProduct(region,productId){
  const family=equipmentFamilyForProduct(productId);if(!family)return null;
  if(productId==='towed_artillery')return ensureCurrentArtilleryDesign(region,'field_cannon');
  if(productId==='fighter'||productId==='bomber')return ensureCurrentAircraftDesign(region,family);
  return ensureCurrentArmouredVehicleDesign(region,family);
}

function assemble(region,productId,requested,line=null){
  const s=ensureIndustrialPlantState(region),recipe=PRODUCT_RECIPES[productId]?.components||{};let actual=requested;
  for(const [c,per] of Object.entries(recipe))actual=Math.min(actual,(s.componentInventory[c]||0)/Math.max(.0001,per));actual=Math.max(0,actual);
  for(const [c,per] of Object.entries(recipe))s.componentInventory[c]=Math.max(0,(s.componentInventory[c]||0)-per*actual);
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventoryByDesign||={};
  region.industrialSupply.inventory[productId]=(region.industrialSupply.inventory[productId]||0)+actual;
  if(actual>0&&equipmentFamilyForProduct(productId)){
    let design=line?.approvedDesignId?equipmentDesignById(region,line.approvedDesignId):null;
    if(!design){design=initialDesignForProduct(region,productId);if(line)line.approvedDesignId=design?.id||null;}
    if(design){
      region.militaryEquipment.inventoryByDesign[design.id]=(region.militaryEquipment.inventoryByDesign[design.id]||0)+actual;
      region.industrialSupply.inventoryByDesign[design.id]=(region.industrialSupply.inventoryByDesign[design.id]||0)+actual;
    }
  }
  return actual;
}

export function takeFinishedEquipment(region,productId,amount=1){
  const family=equipmentFamilyForProduct(productId),need=Math.max(0,amount);if(!family||need<=0)return null;
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventoryByDesign||={};
  if((region.industrialSupply.inventory[productId]||0)<need)return null;
  const designs=Object.entries(region.industrialSupply.inventoryByDesign)
    .map(([id,qty])=>({design:equipmentDesignById(region,id),qty:Number(qty)||0}))
    .filter(x=>x.design?.family===family&&x.qty>=need)
    .sort((a,b)=>(b.design.sequence||0)-(a.design.sequence||0));
  const chosen=designs[0];if(!chosen)return null;
  region.industrialSupply.inventory[productId]-=need;region.industrialSupply.inventoryByDesign[chosen.design.id]-=need;
  if(region.militaryEquipment?.inventoryByDesign?.[chosen.design.id]!=null)region.militaryEquipment.inventoryByDesign[chosen.design.id]=Math.max(0,region.militaryEquipment.inventoryByDesign[chosen.design.id]-need);
  return chosen.design;
}

function serviceModelDiversity(region,weeks){
  const burden=equipmentSupportBurden(region);if(burden.total<=0)return burden;
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.stockpile||={};
  const inv=region.industrialSupply.inventory;
  const machineNeed=burden.total*.0007*weeks*burden.diversityMultiplier,steelNeed=burden.total*.0010*weeks*burden.diversityMultiplier;
  const fraction=Math.min(1,(inv.machine_components||0)/Math.max(.0001,machineNeed),(region.stockpile.steel||0)/Math.max(.0001,steelNeed));
  inv.machine_components=Math.max(0,(inv.machine_components||0)-machineNeed*fraction);region.stockpile.steel=Math.max(0,(region.stockpile.steel||0)-steelNeed*fraction);
  const cat=region.militaryEquipment;cat.supportReadiness=clamp(.55+fraction*.45);cat.lastSupport={machineComponents:machineNeed*fraction,steel:steelNeed*fraction,requiredMachineComponents:machineNeed,requiredSteel:steelNeed,diversityMultiplier:burden.diversityMultiplier,readiness:cat.supportReadiness};
  return {...burden,readiness:cat.supportReadiness};
}

function playerControlsRegion(region){
  const player=globalThis.__worldsim?.activePlayerPolityId;if(!player)return false;
  return region?.governance?.sovereignPolityId===player||region?.controllingActorId===player||region?.id===player;
}
function considerNpcModelReviews(region,weeks){
  const s=ensureIndustrialPlantState(region);s.designReviewWeeks+=weeks;if(s.designReviewWeeks<26||playerControlsRegion(region))return;
  s.designReviewWeeks=0;
  const war=Boolean(region.warEconomy?.activeCampaigns>0);
  for(const line of s.lines){
    const family=equipmentFamilyForProduct(line.productId);if(!family||(line.retoolWeeksRemaining||0)>0)continue;
    const current=currentEquipmentDesign(region,family);if(!current)continue;
    const improvement=equipmentFrontierImprovement(region,family,{kind:kindForProduct(line.productId)});
    if(improvement<(war?.025:.075))continue;
    const result=authoriseProductionMark(region,line.id,{tick:Math.round(s.elapsedWeeks),authorisedBy:'npc_industrial_staff'});if(result.authorised)break;
  }
}

export function tickIndustrialPlants(region,elapsedDays=7){
  const s=ensureIndustrialPlantState(region),factoryCapacity=baseFactoryCapacity(region),weeks=Math.max(0,elapsedDays)/7;s.elapsedWeeks+=weeks;
  if(factoryCapacity<=0){for(const l of s.lines)l.status='closed_no_factory';return s;}
  serviceModelDiversity(region,weeks);
  const orders=region.industrialOrders||{};const active=s.lines.filter(l=>l.status!=='closed_no_factory');const shares=active.reduce((a,l)=>a+clamp(l.capacityShare,.05,1),0)||1;
  for(const line of active){
    if(line.retoolWeeksRemaining>0){line.retoolWeeksRemaining=Math.max(0,line.retoolWeeksRemaining-weeks);if(line.retoolWeeksRemaining<=0&&line.pendingDesignId){line.approvedDesignId=line.pendingDesignId;line.pendingDesignId=null;}line.status=line.retoolWeeksRemaining>0?'retooling':'active';line.lastOutput=0;continue;}
    const demand=Math.max(0,Number(orders[line.productId])||0);if(!line.productId||demand<=0){line.idleWeeks+=weeks;line.lastOutput=0;line.status=line.idleWeeks>=104?'mothballed':'idle';if(line.idleWeeks>=260){line.productId=null;line.toolingFit=0;line.approvedDesignId=null;}continue;}
    line.idleWeeks=0;line.status='active';const cap=factoryCapacity*(line.capacityShare/shares)*clamp(line.toolingFit||1,.2,1)*weeks;
    const requested=Math.min(demand,cap);const output=String(line.productId).startsWith('component:')?produceComponent(region,String(line.productId).slice(10),requested):assemble(region,line.productId,requested,line);
    line.lastOutput=output;orders[line.productId]=Math.max(0,demand-output);if(PRODUCT_RECIPES[line.productId])learnComponents(region,line.productId,output,cap);
    line.toolingFit=clamp((line.toolingFit||.25)+.003*clamp(output/Math.max(1,cap))*(1-(line.toolingFit||.25)));
  }
  considerNpcModelReviews(region,weeks);s.factoryCapacity=factoryCapacity;return s;
}

export function strategicIndustrialCapacity(region){
  const s=ensureIndustrialPlantState(region);return {factoryCapacity:baseFactoryCapacity(region),components:{...s.componentCapability},motorVehicle:productCapability(region,'motor_vehicle'),selfPropelledGun:productCapability(region,'self_propelled_gun'),tank:productCapability(region,'tank'),fighter:productCapability(region,'fighter'),bomber:productCapability(region,'bomber'),equipmentSupportReadiness:region.militaryEquipment?.supportReadiness??1};
}
