import { ensureCircularEconomy, MATERIAL_SPECS } from '../economy/circularEconomy.js?v=20260923-equipment-recycling1';
import { equipmentDesignById, EQUIPMENT_FAMILIES } from './equipmentGenerations.js?v=20260923-equipment-recycling1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

const FAMILY_EMBODIED_MATERIALS=Object.freeze({
  [EQUIPMENT_FAMILIES.FIELD_ARTILLERY]:{steel:2.0,copper:.05},
  [EQUIPMENT_FAMILIES.HEAVY_ARTILLERY]:{steel:3.2,copper:.06},
  [EQUIPMENT_FAMILIES.ROCKET_ARTILLERY]:{steel:2.6,copper:.08},
  [EQUIPMENT_FAMILIES.TANK]:{steel:6.2,copper:.18},
  [EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN]:{steel:5.0,copper:.16},
  [EQUIPMENT_FAMILIES.FIGHTER]:{steel:1.8,copper:.20},
  [EQUIPMENT_FAMILIES.BOMBER]:{steel:3.5,copper:.32},
});

function add(out,key,value){if(value>0)out[key]=(out[key]||0)+value;}

export function equipmentEmbodiedMaterials(design){
  if(!design)return {};
  const out={...(FAMILY_EMBODIED_MATERIALS[design.family]||{})};
  const inputs=design.stats?.systemInputs||{};
  for(const material of Object.keys(MATERIAL_SPECS))add(out,material,nonNegative(inputs[material]));
  if(design.stats?.structureMaterial==='aluminium'&&!out.aluminium)add(out,'aluminium',design.family===EQUIPMENT_FAMILIES.BOMBER?14:design.family===EQUIPMENT_FAMILIES.FIGHTER?6:8);
  if(design.stats?.structureMaterial==='titanium'&&!out.titanium)add(out,'titanium',design.family===EQUIPMENT_FAMILIES.BOMBER?7:design.family===EQUIPMENT_FAMILIES.FIGHTER?3.2:3.5);
  return out;
}

function productIdForFamily(family){
  if(family===EQUIPMENT_FAMILIES.TANK)return 'tank';
  if(family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN)return 'self_propelled_gun';
  if(family===EQUIPMENT_FAMILIES.FIELD_ARTILLERY||family===EQUIPMENT_FAMILIES.HEAVY_ARTILLERY)return 'towed_artillery';
  if(family===EQUIPMENT_FAMILIES.FIGHTER)return 'fighter';
  if(family===EQUIPMENT_FAMILIES.BOMBER)return 'bomber';
  return null;
}

function recyclingEfficiency(region,{condition=1}={}){
  const c=ensureCircularEconomy(region).capability||{};
  const process=clamp(.20+(c.collection||0)*.24+(c.sorting||0)*.22+(c.recovery||0)*.26+(c.closedLoop||0)*.08,.20,.95);
  return process*clamp(.35+.65*condition,.15,1);
}

export function recyclableMilitaryEquipment(region){
  const inventory=region?.militaryEquipment?.inventoryByDesign||{};
  return Object.entries(inventory).map(([designId,raw])=>{
    const design=equipmentDesignById(region,designId),quantity=nonNegative(raw);
    return design&&quantity>0?{designId,designName:design.name,family:design.family,quantity,materials:equipmentEmbodiedMaterials(design)}:null;
  }).filter(Boolean);
}

export function recycleMilitaryEquipment(region,designId,amount=1,{condition=1}={}){
  const design=equipmentDesignById(region,designId);
  if(!design)return {recycled:0,reason:'unknown_design'};
  const catalogue=region?.militaryEquipment;
  const available=nonNegative(catalogue?.inventoryByDesign?.[designId]);
  const recycled=Math.min(available,nonNegative(amount));
  if(recycled<=0)return {recycled:0,reason:'no_stockpiled_equipment'};

  const circular=ensureCircularEconomy(region),efficiency=recyclingEfficiency(region,{condition});
  const embodied=equipmentEmbodiedMaterials(design),toScrap={},unrecovered={};
  for(const [material,perUnit] of Object.entries(embodied)){
    if(!MATERIAL_SPECS[material])continue;
    const total=nonNegative(perUnit)*recycled,recoverable=total*efficiency,lost=total-recoverable;
    circular.scrap[material]=nonNegative(circular.scrap[material])+recoverable;
    if(MATERIAL_SPECS[material].elemental)circular.landfill[material]=nonNegative(circular.landfill[material])+lost;
    else circular.losses[material]=nonNegative(circular.losses[material])+lost;
    toScrap[material]=recoverable;unrecovered[material]=lost;
  }

  catalogue.inventoryByDesign[designId]=Math.max(0,available-recycled);
  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventoryByDesign||={};
  const finished=nonNegative(region.industrialSupply.inventoryByDesign[designId]);
  const fromFinished=Math.min(finished,recycled);
  region.industrialSupply.inventoryByDesign[designId]=Math.max(0,finished-fromFinished);
  const productId=productIdForFamily(design.family);
  if(productId&&fromFinished>0)region.industrialSupply.inventory[productId]=Math.max(0,nonNegative(region.industrialSupply.inventory[productId])-fromFinished);

  catalogue.recycling||={cumulativeUnits:0,cumulativeByFamily:{},last:null};
  catalogue.recycling.cumulativeUnits+=recycled;
  catalogue.recycling.cumulativeByFamily[design.family]=nonNegative(catalogue.recycling.cumulativeByFamily[design.family])+recycled;
  const result={recycled,designId,designName:design.name,family:design.family,condition:clamp(condition),efficiency,toScrap,unrecovered};
  catalogue.recycling.last=result;
  return result;
}
