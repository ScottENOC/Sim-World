const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const EQUIPMENT_FAMILIES=Object.freeze({
  FIELD_ARTILLERY:'field_artillery',
  HEAVY_ARTILLERY:'heavy_artillery',
  TANK:'tank',
  SELF_PROPELLED_GUN:'self_propelled_gun',
  FIGHTER:'fighter',
  BOMBER:'bomber',
});

const FAMILY_LABELS=Object.freeze({
  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',tank:'Tank',self_propelled_gun:'Self-Propelled Gun',fighter:'Fighter',bomber:'Bomber',
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

export function createEquipmentDesign(region,family,stats,{reason='indigenous_development',tick=0,authorisedBy='system'}={}){
  const cat=ensureEquipmentCatalogue(region);
  const seq=(cat.nextDesignSequence[family]||0)+1;cat.nextDesignSequence[family]=seq;
  const id=`${region.id||'region'}:${family}:${seq}`;
  const design={id,family,sequence:seq,name:`${FAMILY_LABELS[family]||family} Mk ${roman(seq)}`,introducedTick:tick,reason,authorisedBy,stats:{...stats}};
  cat.designs.push(design);return design;
}

function materialStep(metal){return metal==='steel'?.16:metal==='bronze'?.06:0;}

export function artilleryDesignFrontier(region,kind='field_cannon'){
  const has=(id)=>Boolean(region?.unlockedTechIds?.has?.(id));
  const fc=region.artilleryFireControl||{};
  const heavy=kind==='bombard'||kind==='heavy_howitzer';
  const breech=has('breech_loading_artillery'),quick=has('quick_firing_artillery'),howitzer=has('heavy_howitzers');
  const components=region.industrialPlants?.componentCapability||{};
  const gunComponent=clamp(components.gun_system||0),optical=clamp(components.optics||0),analogueElectrical=Math.min(.65,clamp(components.electronics||0)),chassis=clamp(components.wheeled_chassis||0);
  const engineering=clamp((region.industrialSupply?.capability?.precision_machining||0)*.32+(region.structuralTransformation?.capability?.manufacture||0)*.18+(region.steelIndustry?.readiness||0)*.12+(region.massEducation?.literacy||0)*.10+gunComponent*.16+optical*.08+analogueElectrical*.04);
  return {
    family:heavy?EQUIPMENT_FAMILIES.HEAVY_ARTILLERY:EQUIPMENT_FAMILIES.FIELD_ARTILLERY,
    rangeKm:(heavy?3.4:2.8)*(1+(breech?.55:0)+(quick?.28:0)+(howitzer&&heavy?.55:0)+engineering*.30+gunComponent*.24),
    intrinsicAccuracy:clamp(.18+(breech?.13:0)+(quick?.11:0)+engineering*.18+optical*.22+gunComponent*.10),
    rateOfFire:clamp(.16+(breech?.22:0)+(quick?.42:0)+engineering*.10+gunComponent*.12),
    reliability:clamp(.52+engineering*.22+gunComponent*.10+(has('steelmaking')?.10:0)),
    mobility:clamp((heavy?.34:.58)+engineering*.08+chassis*.18),
    firepower:clamp((heavy?.52:.34)+(breech?.10:0)+(quick?.12:0)+(howitzer&&heavy?.18:0)+engineering*.08+gunComponent*.18),
    fireControlPotential:clamp(.20+(fc.rangeFinding||0)*.12+(fc.survey||0)*.12+(fc.fireDirection||0)*.16+(fc.predictedFire||0)*.16+optical*.14+analogueElectrical*.08+engineering*.08),
  };
}

function designScore(stats){return (stats.rangeKm||0)/10+(stats.intrinsicAccuracy||0)*.8+(stats.rateOfFire||0)*.55+(stats.reliability||0)*.35+(stats.firepower||0)*.6+(stats.fireControlPotential||0)*.45;}

export function armouredVehicleDesignFrontier(region,family=EQUIPMENT_FAMILIES.TANK){
  const c=region.industrialPlants?.componentCapability||{};
  const exp=clamp(region.industrialPlants?.productExperience?.[family]||0);
  const q=(k,fallback=.05)=>clamp(c[k]??fallback);
  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=Math.min(.65,q('electronics')),hull=q('hull_fabrication');
  const spg=family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  return {family, mobility:clamp(engine*.34+trans*.26+tracks*.30+hull*.10), firepower:clamp(gun*.62+optics*.20+electronics*.08+hull*.10), protection:clamp(armour*(spg?.62:.82)+hull*(spg?.18:.12)+tracks*.06), reliability:clamp(engine*.18+trans*.18+tracks*.16+gun*.10+armour*.08+hull*.12+exp*.18), fireControlPotential:clamp(optics*.50+electronics*.28+gun*.12+exp*.10), integration:exp};
}

export function aircraftDesignFrontier(region,family=EQUIPMENT_FAMILIES.FIGHTER){
  const c=region.industrialPlants?.componentCapability||{};
  const productId=family===EQUIPMENT_FAMILIES.BOMBER?'bomber':'fighter';
  const exp=clamp(region.industrialPlants?.productExperience?.[productId]||0);
  const q=(k,fallback=.04)=>clamp(c[k]??fallback);
  const engine=q('aircraft_engine',Math.max(.04,(c.engine||0)*.32));
  const airframe=q('airframe');
  const wing=q('wing_design');
  const weapons=q('aircraft_weapon',Math.max(.03,(c.gun_system||0)*.35));
  const radio=q('radio_navigation',Math.max(.02,(c.electronics||0)*.35));
  const radar=q('radar_set',0);
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const jet=Boolean(region?.unlockedTechIds?.has?.('jet_propulsion'));
  const radarKnowledge=Boolean(region?.unlockedTechIds?.has?.('radar'));
  const bomber=family===EQUIPMENT_FAMILIES.BOMBER;
  const enginePower=clamp(engine*.72+precision*.18+exp*.10+(jet?.10:0));
  const structural=clamp(airframe*.58+wing*.24+precision*.10+exp*.08);
  const aerodynamics=clamp(wing*.55+airframe*.24+precision*.11+exp*.10);
  const usefulLift=clamp(enginePower*.38+wing*.34+structural*.20+exp*.08);
  const payload=clamp(usefulLift*(bomber?.92:.38)+structural*(bomber?.12:.05));
  const speed=clamp(enginePower*.50+aerodynamics*.38+structural*.06+exp*.06+(jet?.12:0));
  const range=clamp(enginePower*.22+aerodynamics*.22+structural*.14+radio*.08+payload*(bomber?.26:.08)+exp*.12+(bomber?.10:0));
  const manoeuvrability=clamp(aerodynamics*.46+enginePower*.30+structural*.10+exp*.14-(bomber?.18:0));
  const firepower=clamp(weapons*(bomber?.30:.72)+payload*(bomber?.42:.12)+radio*.05+exp*.08);
  const reliability=clamp(engine*.32+airframe*.22+wing*.14+precision*.14+exp*.18);
  const detectionAndNavigation=clamp(radio*.46+(radarKnowledge?radar*.38:0)+exp*.10+precision*.06);
  // Lower is harder to detect. Pre-digital shaping/size choices matter, but there is no modern RAM/computer optimisation.
  const rawSignature=(bomber?.72:.42)+payload*.18+structural*.06;
  const signatureReduction=(radarKnowledge?airframe*.06+wing*.07+exp*.04:airframe*.015+wing*.02);
  const radarSignature=clamp(rawSignature-signatureReduction,.18,1);
  return {family,enginePower,airframe:structural,wingDesign:aerodynamics,weapons:weapons,payload,speed,range,manoeuvrability,reliability,firepower,radioNavigation:radio,radarCapability:radarKnowledge?radar:0,radarSignature,integration:exp,propulsion:jet?'jet':'piston'};
}

export function equipmentDesignFrontier(region,family,{kind=null}={}){
  if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN)return armouredVehicleDesignFrontier(region,family);
  if(family===EQUIPMENT_FAMILIES.FIELD_ARTILLERY)return artilleryDesignFrontier(region,kind||'field_cannon');
  if(family===EQUIPMENT_FAMILIES.HEAVY_ARTILLERY)return artilleryDesignFrontier(region,kind||'heavy_howitzer');
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER)return aircraftDesignFrontier(region,family);
  return null;
}

// A frontier is knowledge/capability. A Mark is a deliberate standardisation decision.
// This function snapshots whatever the country can actually build at that moment;
// it deliberately does not require the new model to dominate the old one.
export function authoriseEquipmentMark(region,family,{kind=null,tick=0,reason='new_production_standard',authorisedBy='player'}={}){
  const frontier=equipmentDesignFrontier(region,family,{kind});
  if(!frontier)return null;
  return createEquipmentDesign(region,family,frontier,{reason,tick,authorisedBy});
}

// Backwards compatibility and first production run only. Capability growth by itself
// never creates Mk II+; later Marks require authoriseEquipmentMark / factory tooling.
export function ensureCurrentArmouredVehicleDesign(region,family=EQUIPMENT_FAMILIES.TANK,tick=0){
  return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{tick,reason:'first_standard_design',authorisedBy:'initial_standard'});
}

export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){
  const frontier=artilleryDesignFrontier(region,kind),family=frontier.family;
  return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{kind,tick,reason:'first_standard_design',authorisedBy:'initial_standard'});
}

export function ensureCurrentAircraftDesign(region,family=EQUIPMENT_FAMILIES.FIGHTER,tick=0){
  return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{tick,reason:'first_standard_design',authorisedBy:'initial_standard'});
}

function aircraftScore(s){return (s.speed||0)*.18+(s.range||0)*.13+(s.manouevrability||s.manoeuvrability||0)*.18+(s.reliability||0)*.13+(s.firepower||0)*.16+(s.payload||0)*.12+(s.radarCapability||0)*.06+(1-(s.radarSignature??1))*.04;}

export function equipmentFrontierImprovement(region,family,{kind=null}={}){
  const frontier=equipmentDesignFrontier(region,family,{kind}),current=currentEquipmentDesign(region,family);
  if(!frontier)return 0;if(!current)return 1;
  if(family===EQUIPMENT_FAMILIES.TANK||family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN){
    const score=(s)=>(s.mobility||0)*.22+(s.firepower||0)*.28+(s.protection||0)*.24+(s.reliability||0)*.14+(s.fireControlPotential||0)*.12;
    return (score(frontier)-score(current.stats))/Math.max(.15,score(current.stats));
  }
  if(family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER)return (aircraftScore(frontier)-aircraftScore(current.stats))/Math.max(.15,aircraftScore(current.stats));
  return (designScore(frontier)-designScore(current.stats))/Math.max(.2,designScore(current.stats));
}

export function stampEquipment(unit,design){
  if(!unit||!design)return unit;
  unit.designId=design.id;unit.modelName=design.name;unit.designStats={...design.stats};unit.designSequence=design.sequence;return unit;
}

export function backfillArtilleryDesign(region,gun,tick=0){
  if(gun?.designId)return gun;
  const design=ensureCurrentArtilleryDesign(region,gun?.kind||'field_cannon',tick);
  return stampEquipment(gun,design);
}

export function equipmentSupportBurden(region){
  const cat=ensureEquipmentCatalogue(region),byFamily=new Map();let total=0;
  for(const [id,rawQty] of Object.entries(cat.inventoryByDesign||{})){
    const qty=Math.max(0,Number(rawQty)||0);if(qty<=.001)continue;
    const design=equipmentDesignById(region,id);if(!design)continue;
    total+=qty;const row=byFamily.get(design.family)||{family:design.family,total:0,models:0,designIds:[]};
    row.total+=qty;row.models+=1;row.designIds.push(id);byFamily.set(design.family,row);
  }
  let weightedExtraModels=0;
  for(const row of byFamily.values())weightedExtraModels+=Math.max(0,row.models-1)*Math.sqrt(Math.max(1,row.total));
  const scale=Math.sqrt(Math.max(1,total));
  const diversityMultiplier=total>0?1+clamp(weightedExtraModels/Math.max(1,scale)*.16,0,1.5):1;
  return {total,diversityMultiplier,families:[...byFamily.values()]};
}

export function equipmentModernitySummary(region,units=[]){
  const groups=new Map();
  for(const unit of units||[]){
    if(!unit?.designId)continue;
    const design=equipmentDesignById(region,unit.designId)||{id:unit.designId,name:unit.modelName||'Unknown model',family:'unknown',sequence:unit.designSequence||1,stats:unit.designStats||{}};
    const g=groups.get(design.id)||{design,count:0};g.count++;groups.set(design.id,g);
  }
  const rows=[...groups.values()].sort((a,b)=>(b.design.sequence||0)-(a.design.sequence||0));
  const total=rows.reduce((s,r)=>s+r.count,0);
  let current=0;
  for(const row of rows){const newest=currentEquipmentDesign(region,row.design.family);if(newest?.id===row.design.id)current+=row.count;}
  return {total,current,currentShare:total?current/total:1,models:rows};
}

export function designCapabilityLabel(design){
  if(!design?.stats)return 'unknown';
  const s=design.stats;const score=designScore(s);
  return score<.85?'legacy':score<1.25?'early industrial':score<1.65?'modern':score<2.05?'advanced':'cutting edge';
}

export function materialDesignAdjustment(stats,metal){
  const q=materialStep(metal);return {...stats,reliability:clamp((stats.reliability||0)+q),firepower:clamp((stats.firepower||0)+q*.35)};
}
