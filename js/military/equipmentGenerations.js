import { MILITARY_PLATFORM, platformElectronicsFrontier } from './militaryElectronics.js?v=20260919-military-computing1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const EQUIPMENT_FAMILIES=Object.freeze({
  FIELD_ARTILLERY:'field_artillery',
  HEAVY_ARTILLERY:'heavy_artillery',
  TANK:'tank',
  SELF_PROPELLED_GUN:'self_propelled_gun',
  FIGHTER:'fighter',
  BOMBER:'bomber',
});

export const MILITARY_MATERIALS=Object.freeze({
  CONVENTIONAL:'conventional',
  ALUMINIUM:'aluminium',
  TITANIUM:'titanium',
});

const FAMILY_LABELS=Object.freeze({
  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',tank:'Tank',self_propelled_gun:'Self-Propelled Gun',fighter:'Fighter',bomber:'Bomber',
});

const DEFAULT_PRIORITIES=Object.freeze({
  aircraft:{speed:1,range:1,payload:1,manoeuvrability:1,reliability:1,firepower:1},
  armour:{mobility:1,protection:1,firepower:1,reliability:1},
});

function roman(n){
  const table=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let out='',x=Math.max(1,Math.floor(n));
  for(const [v,s] of table)while(x>=v){out+=s;x-=v;} return out;
}

export function ensureEquipmentCatalogue(region){
  region.militaryEquipment ||= {designs:[],nextDesignSequence:{}};
  region.militaryEquipment.designs ||= [];
  region.militaryEquipment.nextDesignSequence ||= {};
  region.militaryEquipment.inventoryByDesign ||= {};
  return region.militaryEquipment;
}

export function designsFor(region,family){return ensureEquipmentCatalogue(region).designs.filter(d=>d.family===family);}
export function currentEquipmentDesign(region,family){return designsFor(region,family).sort((a,b)=>b.sequence-a.sequence)[0]||null;}
export function equipmentDesignById(region,id){return ensureEquipmentCatalogue(region).designs.find(d=>d.id===id)||null;}

export function createEquipmentDesign(region,family,stats,{reason='indigenous_development',tick=0,authorisedBy='system',designChoices=null}={}){
  const cat=ensureEquipmentCatalogue(region);
  const seq=(cat.nextDesignSequence[family]||0)+1;cat.nextDesignSequence[family]=seq;
  const id=`${region.id||'region'}:${family}:${seq}`;
  const design={id,family,sequence:seq,name:`${FAMILY_LABELS[family]||family} Mk ${roman(seq)}`,introducedTick:tick,reason,authorisedBy,stats:{...stats},designChoices:designChoices?structuredClone(designChoices):null};
  cat.designs.push(design);return design;
}

function mergeInputs(base={},extra={}){
  const out={...base};for(const [key,value] of Object.entries(extra||{}))out[key]=(out[key]||0)+Math.max(0,Number(value)||0);return out;
}

function has(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}

export function militaryMaterialOptions(region,family){
  const aircraft=family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER;
  const armour=family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  const options=[{id:MILITARY_MATERIALS.CONVENTIONAL,label:aircraft?'Conventional airframe':'Conventional steel structure',available:true,reason:null}];
  if(!aircraft&&!armour)return options;
  options.push({
    id:MILITARY_MATERIALS.ALUMINIUM,
    label:aircraft?'Aluminium-alloy airframe':'Aluminium light secondary structure',
    available:has(region,'aerospace_light_alloys'),
    reason:has(region,'aerospace_light_alloys')?null:'Requires aerospace light-alloy metallurgy',
  });
  options.push({
    id:MILITARY_MATERIALS.TITANIUM,
    label:aircraft?'Titanium-intensive high-performance structure':'Selective titanium armour and structure',
    available:has(region,'kroll_titanium')&&has(region,'aerospace_light_alloys'),
    reason:has(region,'kroll_titanium')&&has(region,'aerospace_light_alloys')?null:'Requires titanium-metal production and advanced light-alloy metallurgy',
  });
  return options;
}

function normalisePriorities(kind,raw={}){
  const defaults=DEFAULT_PRIORITIES[kind];const out={};let sum=0;
  for(const key of Object.keys(defaults)){out[key]=clamp(raw[key]??defaults[key],0.25,2.5);sum+=out[key];}
  const mean=sum/Object.keys(out).length;
  for(const key of Object.keys(out))out[key]/=Math.max(.01,mean);
  return out;
}

function specialised(value,priority,intensity=.12){return clamp(value*(1+(priority-1)*intensity));}

function applyAircraftMaterial(region,stats,material,family){
  const bomber=family===EQUIPMENT_FAMILIES.BOMBER;
  const option=militaryMaterialOptions(region,family).find(o=>o.id===material);
  const chosen=option?.available?material:MILITARY_MATERIALS.CONVENTIONAL;
  let s={...stats,systemInputs:{...(stats.systemInputs||{})},structureMaterial:chosen,materialAvailabilityWarning:option&&!option.available?option.reason:null};
  if(chosen===MILITARY_MATERIALS.ALUMINIUM){
    const aluminium=bomber?14:6;
    s={...s,
      structuralMassMultiplier:.82,
      speed:clamp(s.speed*1.055),range:clamp(s.range*1.095),payload:clamp(s.payload*1.075),manoeuvrability:clamp(s.manoeuvrability*1.045),reliability:clamp(s.reliability*1.018),
      heatTolerance:clamp(.48+(has(region,'jet_propulsion')?.08:0)),
      systemInputs:mergeInputs(s.systemInputs,{aluminium}),
    };
  }else if(chosen===MILITARY_MATERIALS.TITANIUM){
    const titanium=bomber?7:3.2,aluminium=bomber?8:3.5,jet=has(region,'jet_propulsion');
    s={...s,
      structuralMassMultiplier:.74,
      speed:clamp(s.speed*(jet?1.085:1.045)),range:clamp(s.range*1.065),payload:clamp(s.payload*1.065),manoeuvrability:clamp(s.manoeuvrability*1.035),reliability:clamp(s.reliability*1.035),
      heatTolerance:clamp(.72+(jet?.20:.06)),
      systemInputs:mergeInputs(s.systemInputs,{aluminium,titanium}),
    };
  }else{
    s.structuralMassMultiplier=1;s.heatTolerance=clamp(.38+(has(region,'jet_propulsion')?.05:0));
  }
  return s;
}

function applyArmourMaterial(region,stats,material,family){
  const spg=family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  const option=militaryMaterialOptions(region,family).find(o=>o.id===material);
  const chosen=option?.available?material:MILITARY_MATERIALS.CONVENTIONAL;
  let s={...stats,systemInputs:{...(stats.systemInputs||{})},structureMaterial:chosen,materialAvailabilityWarning:option&&!option.available?option.reason:null};
  if(chosen===MILITARY_MATERIALS.ALUMINIUM){
    const aluminium=spg?7:9;
    s={...s,
      structuralMassMultiplier:.90,
      mobility:clamp(s.mobility*1.075),reliability:clamp(s.reliability*1.012),protection:clamp(s.protection*(spg?.98:.94)),
      systemInputs:mergeInputs(s.systemInputs,{aluminium}),
    };
  }else if(chosen===MILITARY_MATERIALS.TITANIUM){
    const titanium=spg?2.6:4.2;
    s={...s,
      structuralMassMultiplier:.91,
      mobility:clamp(s.mobility*1.04),protection:clamp(s.protection*1.075),reliability:clamp(s.reliability*.992),
      systemInputs:mergeInputs(s.systemInputs,{titanium}),
    };
  }else s.structuralMassMultiplier=1;
  return s;
}

function applyDesignPriorities(stats,family,raw={}){
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER){
    const p=normalisePriorities('aircraft',raw);return {...stats,designPriorities:p,
      speed:specialised(stats.speed,p.speed,.13),range:specialised(stats.range,p.range,.14),payload:specialised(stats.payload,p.payload,.14),
      manoeuvrability:specialised(stats.manoeuvrability,p.manoeuvrability,.13),reliability:specialised(stats.reliability,p.reliability,.10),firepower:specialised(stats.firepower,p.firepower,.11)};
  }
  if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN){
    const p=normalisePriorities('armour',raw);return {...stats,designPriorities:p,
      mobility:specialised(stats.mobility,p.mobility,.12),protection:specialised(stats.protection,p.protection,.13),firepower:specialised(stats.firepower,p.firepower,.12),reliability:specialised(stats.reliability,p.reliability,.09)};
  }
  return stats;
}

export function applyMilitaryDesignChoices(region,family,frontier,{material=MILITARY_MATERIALS.CONVENTIONAL,priorities={}}={}){
  let stats={...frontier,systemInputs:{...(frontier.systemInputs||{})}};
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER)stats=applyAircraftMaterial(region,stats,material,family);
  else if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN)stats=applyArmourMaterial(region,stats,material,family);
  return applyDesignPriorities(stats,family,priorities);
}

export function artilleryDesignFrontier(region,kind='field_cannon'){
  const fc=region.artilleryFireControl||{};
  const heavy=kind==='bombard'||kind==='heavy_howitzer';
  const breech=has(region,'breech_loading_artillery'),quick=has(region,'quick_firing_artillery'),howitzer=has(region,'heavy_howitzers');
  const components=region.industrialPlants?.componentCapability||{};
  const gunComponent=clamp(components.gun_system||0),optical=clamp(components.optics||0),analogueElectrical=Math.min(.65,clamp(components.electronics||0)),chassis=clamp(components.wheeled_chassis||0);
  const engineering=clamp((region.industrialSupply?.capability?.precision_machining||0)*.32+(region.structuralTransformation?.capability?.manufacture||0)*.18+(region.steelIndustry?.readiness||0)*.12+(region.massEducation?.literacy||0)*.10+gunComponent*.16+optical*.08+analogueElectrical*.04);
  const electronics=platformElectronicsFrontier(region,MILITARY_PLATFORM.ARTILLERY,{fireControlBase:.20+(fc.rangeFinding||0)*.12+(fc.survey||0)*.12+(fc.fireDirection||0)*.16+(fc.predictedFire||0)*.16+optical*.14+analogueElectrical*.08+engineering*.08});
  return {
    family:heavy?EQUIPMENT_FAMILIES.HEAVY_ARTILLERY:EQUIPMENT_FAMILIES.FIELD_ARTILLERY,
    rangeKm:(heavy?3.4:2.8)*(1+(breech?.55:0)+(quick?.28:0)+(howitzer&&heavy?.55:0)+engineering*.30+gunComponent*.24),
    intrinsicAccuracy:clamp(.18+(breech?.13:0)+(quick?.11:0)+engineering*.18+optical*.22+gunComponent*.10+electronics.fireControlGain*.35),
    rateOfFire:clamp(.16+(breech?.22:0)+(quick?.42:0)+engineering*.10+gunComponent*.12),
    reliability:clamp(.52+engineering*.22+gunComponent*.10+(has(region,'steelmaking')?.10:0)),
    mobility:clamp((heavy?.34:.58)+engineering*.08+chassis*.18),
    firepower:clamp((heavy?.52:.34)+(breech?.10:0)+(quick?.12:0)+(howitzer&&heavy?.18:0)+engineering*.08+gunComponent*.18),
    fireControlPotential:electronics.fireControl,
    onboardPower:electronics.power,computationalPower:electronics.compute,electronicCapabilities:electronics.capabilities,systemInputs:electronics.systemInputs,
  };
}

function designScore(stats){return (stats.rangeKm||0)/10+(stats.intrinsicAccuracy||0)*.8+(stats.rateOfFire||0)*.55+(stats.reliability||0)*.35+(stats.firepower||0)*.6+(stats.fireControlPotential||0)*.45;}

export function armouredVehicleDesignFrontier(region,family=EQUIPMENT_FAMILIES.TANK){
  const c=region.industrialPlants?.componentCapability||{};
  const exp=clamp(region.industrialPlants?.productExperience?.[family]||0);
  const q=(k,fallback=.05)=>clamp(c[k]??fallback);
  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=Math.min(.65,q('electronics')),hull=q('hull_fabrication');
  const spg=family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  const platform=spg?MILITARY_PLATFORM.SELF_PROPELLED_GUN:MILITARY_PLATFORM.TANK;
  const digital=platformElectronicsFrontier(region,platform,{fireControlBase:clamp(optics*.50+electronics*.28+gun*.12+exp*.10)});
  return {
    family,
    mobility:clamp(engine*.34+trans*.26+tracks*.30+hull*.10),
    firepower:clamp(gun*.62+optics*.20+electronics*.08+hull*.10+digital.mobileFireGain*.20),
    protection:clamp(armour*(spg?.62:.82)+hull*(spg?.18:.12)+tracks*.06),
    reliability:clamp(engine*.18+trans*.18+tracks*.16+gun*.10+armour*.08+hull*.12+exp*.18),
    fireControlPotential:digital.fireControl,
    movingFireEffectiveness:clamp(.10+optics*.12+digital.mobileFireGain),
    onboardPower:digital.power,computationalPower:digital.compute,electronicCapabilities:digital.capabilities,systemInputs:digital.systemInputs,integration:exp,
  };
}

export function aircraftDesignFrontier(region,family=EQUIPMENT_FAMILIES.FIGHTER){
  const c=region.industrialPlants?.componentCapability||{};
  const productId=family===EQUIPMENT_FAMILIES.BOMBER?'bomber':'fighter';
  const exp=clamp(region.industrialPlants?.productExperience?.[productId]||0);
  const q=(k,fallback=.04)=>clamp(c[k]??fallback);
  const engine=q('aircraft_engine',Math.max(.04,(c.engine||0)*.32));
  const airframe=q('airframe'),wing=q('wing_design'),weapons=q('aircraft_weapon',Math.max(.03,(c.gun_system||0)*.35)),radio=q('radio_navigation',Math.max(.02,(c.electronics||0)*.35)),radar=q('radar_set',0);
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0),jet=has(region,'jet_propulsion'),radarKnowledge=has(region,'radar'),bomber=family===EQUIPMENT_FAMILIES.BOMBER;
  const enginePower=clamp(engine*.72+precision*.18+exp*.10+(jet?.10:0));
  const structural=clamp(airframe*.58+wing*.24+precision*.10+exp*.08),aerodynamics=clamp(wing*.55+airframe*.24+precision*.11+exp*.10),usefulLift=clamp(enginePower*.38+wing*.34+structural*.20+exp*.08);
  const payload=clamp(usefulLift*(bomber?.92:.38)+structural*(bomber?.12:.05));
  const speed=clamp(enginePower*.50+aerodynamics*.38+structural*.06+exp*.06+(jet?.12:0)),range=clamp(enginePower*.22+aerodynamics*.22+structural*.14+radio*.08+payload*(bomber?.26:.08)+exp*.12+(bomber?.10:0)),manoeuvrability=clamp(aerodynamics*.46+enginePower*.30+structural*.10+exp*.14-(bomber?.18:0));
  const digital=platformElectronicsFrontier(region,MILITARY_PLATFORM.AIRCRAFT,{radarCapability:radarKnowledge?radar:0,fireControlBase:clamp(weapons*.18+radio*.12)});
  const firepower=clamp(weapons*(bomber?.30:.72)+payload*(bomber?.42:.12)+radio*.05+exp*.08+digital.fireControlGain*.10),reliability=clamp(engine*.32+airframe*.22+wing*.14+precision*.14+exp*.18);
  const detectionAndNavigation=clamp(radio*.46+(radarKnowledge?radar*.38:0)+exp*.10+precision*.06+digital.sensorGain*.14),rawSignature=(bomber?.72:.42)+payload*.18+structural*.06,signatureReduction=(radarKnowledge?airframe*.06+wing*.07+exp*.04:airframe*.015+wing*.02)+(digital.capabilities.sensorFusion?.025:0),radarSignature=clamp(rawSignature-signatureReduction,.18,1);
  return {family,enginePower,airframe:structural,wingDesign:aerodynamics,weapons,payload,speed,range,manoeuvrability,reliability,firepower,radioNavigation:radio,radarCapability:radarKnowledge?radar:0,radarSignature,detectionAndNavigation,onboardPower:digital.power,computationalPower:digital.compute,electronicCapabilities:digital.capabilities,systemInputs:digital.systemInputs,integration:exp,propulsion:jet?'jet':'piston'};
}

export function equipmentDesignFrontier(region,family,{kind=null}={}){
  if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN)return armouredVehicleDesignFrontier(region,family);
  if(family===EQUIPMENT_FAMILIES.FIELD_ARTILLERY)return artilleryDesignFrontier(region,kind||'field_cannon');
  if(family===EQUIPMENT_FAMILIES.HEAVY_ARTILLERY)return artilleryDesignFrontier(region,kind||'heavy_howitzer');
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER)return aircraftDesignFrontier(region,family);
  return null;
}

export function previewEquipmentDesign(region,family,{kind=null,material=MILITARY_MATERIALS.CONVENTIONAL,priorities={}}={}){
  const frontier=equipmentDesignFrontier(region,family,{kind});if(!frontier)return null;
  return applyMilitaryDesignChoices(region,family,frontier,{material,priorities});
}

export function authoriseEquipmentMark(region,family,{kind=null,tick=0,reason='new_production_standard',authorisedBy='player',material=MILITARY_MATERIALS.CONVENTIONAL,priorities={}}={}){
  const stats=previewEquipmentDesign(region,family,{kind,material,priorities});if(!stats)return null;
  return createEquipmentDesign(region,family,stats,{reason,tick,authorisedBy,designChoices:{material:stats.structureMaterial||MILITARY_MATERIALS.CONVENTIONAL,priorities:stats.designPriorities||{}}});
}

export function ensureCurrentArmouredVehicleDesign(region,family=EQUIPMENT_FAMILIES.TANK,tick=0){return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}
export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){const frontier=artilleryDesignFrontier(region,kind),family=frontier.family;return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{kind,tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}
export function ensureCurrentAircraftDesign(region,family=EQUIPMENT_FAMILIES.FIGHTER,tick=0){return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}

function aircraftScore(s){return (s.speed||0)*.18+(s.range||0)*.13+(s.manouevrability||s.manoeuvrability||0)*.18+(s.reliability||0)*.13+(s.firepower||0)*.16+(s.payload||0)*.12+(s.radarCapability||0)*.06+(1-(s.radarSignature??1))*.04+(s.computationalPower||0)*.03;}

export function equipmentFrontierImprovement(region,family,{kind=null,material=MILITARY_MATERIALS.CONVENTIONAL,priorities={}}={}){
  const frontier=previewEquipmentDesign(region,family,{kind,material,priorities}),current=currentEquipmentDesign(region,family);if(!frontier)return 0;if(!current)return 1;
  if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN){const score=s=>(s.mobility||0)*.20+(s.firepower||0)*.25+(s.protection||0)*.22+(s.reliability||0)*.13+(s.fireControlPotential||0)*.12+(s.movingFireEffectiveness||0)*.08;return (score(frontier)-score(current.stats))/Math.max(.15,score(current.stats));}
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER)return (aircraftScore(frontier)-aircraftScore(current.stats))/Math.max(.15,aircraftScore(current.stats));
  return (designScore(frontier)-designScore(current.stats))/Math.max(.2,designScore(current.stats));
}

export function stampEquipment(unit,design){if(!unit||!design)return unit;unit.designId=design.id;unit.modelName=design.name;unit.designStats={...design.stats};unit.designSequence=design.sequence;return unit;}
export function backfillArtilleryDesign(region,gun,tick=0){if(gun?.designId)return gun;const design=ensureCurrentArtilleryDesign(region,gun?.kind||'field_cannon',tick);return stampEquipment(gun,design);}

export function equipmentSupportBurden(region){
  const cat=ensureEquipmentCatalogue(region),byFamily=new Map();let total=0;
  for(const [id,rawQty] of Object.entries(cat.inventoryByDesign||{})){const qty=Math.max(0,Number(rawQty)||0);if(qty<=.001)continue;const design=equipmentDesignById(region,id);if(!design)continue;total+=qty;const row=byFamily.get(design.family)||{family:design.family,total:0,models:0,designIds:[]};row.total+=qty;row.models+=1;row.designIds.push(id);byFamily.set(design.family,row);}
  let weightedExtraModels=0;for(const row of byFamily.values())weightedExtraModels+=Math.max(0,row.models-1)*Math.sqrt(Math.max(1,row.total));
  const scale=Math.sqrt(Math.max(1,total)),diversityMultiplier=total>0?1+clamp(weightedExtraModels/Math.max(1,scale)*.16,0,1.5):1;return {total,diversityMultiplier,families:[...byFamily.values()]};
}

export function equipmentModernitySummary(region,units=[]){
  const groups=new Map();for(const unit of units||[]){if(!unit?.designId)continue;const design=equipmentDesignById(region,unit.designId)||{id:unit.designId,name:unit.modelName||'Unknown model',family:'unknown',sequence:unit.designSequence||1,stats:unit.designStats||{}};const g=groups.get(design.id)||{design,count:0};g.count++;groups.set(design.id,g);}
  const rows=[...groups.values()].sort((a,b)=>(b.design.sequence||0)-(a.design.sequence||0)),total=rows.reduce((s,r)=>s+r.count,0);let current=0;for(const row of rows){const newest=currentEquipmentDesign(region,row.design.family);if(newest?.id===row.design.id)current+=row.count;}return {total,current,currentShare:total?current/total:1,models:rows};
}

export function designCapabilityLabel(design){if(!design?.stats)return 'unknown';const score=designScore(design.stats);return score<.85?'legacy':score<1.25?'early industrial':score<1.65?'modern':score<2.05?'advanced':'cutting edge';}

export function materialDesignAdjustment(stats,metal){
  const q=metal==='steel'?.16:metal==='bronze'?.06:0;return {...stats,reliability:clamp((stats.reliability||0)+q),firepower:clamp((stats.firepower||0)+q*.35)};
}
