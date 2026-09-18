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
  return region.militaryEquipment;
}

export function designsFor(region,family){return ensureEquipmentCatalogue(region).designs.filter(d=>d.family===family);}
export function currentEquipmentDesign(region,family){return designsFor(region,family).sort((a,b)=>b.sequence-a.sequence)[0]||null;}
export function equipmentDesignById(region,id){return ensureEquipmentCatalogue(region).designs.find(d=>d.id===id)||null;}

export function createEquipmentDesign(region,family,stats,{reason='indigenous_development',tick=0}={}){
  const cat=ensureEquipmentCatalogue(region);
  const seq=(cat.nextDesignSequence[family]||0)+1;cat.nextDesignSequence[family]=seq;
  const id=`${region.id||'region'}:${family}:${seq}`;
  const design={id,family,sequence:seq,name:`${FAMILY_LABELS[family]||family} Mk ${roman(seq)}`,introducedTick:tick,reason,stats:{...stats}};
  cat.designs.push(design);return design;
}

function materialStep(metal){return metal==='steel'?.16:metal==='bronze'?.06:0;}

export function artilleryDesignFrontier(region,kind='field_cannon'){
  const has=(id)=>Boolean(region?.unlockedTechIds?.has?.(id));
  const fc=region.artilleryFireControl||{};
  const heavy=kind==='bombard'||kind==='heavy_howitzer';
  const breech=has('breech_loading_artillery'),quick=has('quick_firing_artillery'),howitzer=has('heavy_howitzers');
  const engineering=clamp((region.industrialSupply?.capability?.precision_machining||0)*.45+(region.structuralTransformation?.capability?.manufacture||0)*.25+(region.steelIndustry?.readiness||0)*.15+(region.massEducation?.literacy||0)*.15);
  return {
    family:heavy?EQUIPMENT_FAMILIES.HEAVY_ARTILLERY:EQUIPMENT_FAMILIES.FIELD_ARTILLERY,
    rangeKm:(heavy?3.4:2.8)*(1+(breech?.55:0)+(quick?.28:0)+(howitzer&&heavy?.55:0)+engineering*.22),
    intrinsicAccuracy:clamp(.18+(breech?.13:0)+(quick?.11:0)+engineering*.24),
    rateOfFire:clamp(.16+(breech?.22:0)+(quick?.42:0)+engineering*.12),
    reliability:clamp(.52+engineering*.30+(has('steelmaking')?.10:0)),
    mobility:clamp((heavy?.34:.58)+engineering*.14),
    firepower:clamp((heavy?.52:.34)+(breech?.10:0)+(quick?.12:0)+(howitzer&&heavy?.18:0)+engineering*.14),
    fireControlPotential:clamp(.20+(fc.rangeFinding||0)*.14+(fc.survey||0)*.14+(fc.fireDirection||0)*.18+(fc.predictedFire||0)*.18+engineering*.16),
  };
}

function designScore(stats){return (stats.rangeKm||0)/10+(stats.intrinsicAccuracy||0)*.8+(stats.rateOfFire||0)*.55+(stats.reliability||0)*.35+(stats.firepower||0)*.6+(stats.fireControlPotential||0)*.45;}

export function armouredVehicleDesignFrontier(region,family=EQUIPMENT_FAMILIES.TANK){
  const c=region.industrialPlants?.componentCapability||{};
  const exp=clamp(region.industrialPlants?.productExperience?.[family]||0);
  const q=(k,fallback=.05)=>clamp(c[k]??fallback);
  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=q('electronics'),hull=q('hull_fabrication');
  const spg=family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;
  return {family, mobility:clamp(engine*.34+trans*.26+tracks*.30+hull*.10), firepower:clamp(gun*.62+optics*.20+electronics*.08+hull*.10), protection:clamp(armour*(spg?.62:.82)+hull*(spg?.18:.12)+tracks*.06), reliability:clamp(engine*.18+trans*.18+tracks*.16+gun*.10+armour*.08+hull*.12+exp*.18), fireControlPotential:clamp(optics*.50+electronics*.28+gun*.12+exp*.10), integration:exp};
}

export function ensureCurrentArmouredVehicleDesign(region,family=EQUIPMENT_FAMILIES.TANK,tick=0){
  const frontier=armouredVehicleDesignFrontier(region,family),current=currentEquipmentDesign(region,family);
  const score=(s)=>(s.mobility||0)*.22+(s.firepower||0)*.28+(s.protection||0)*.24+(s.reliability||0)*.14+(s.fireControlPotential||0)*.12;
  if(!current)return createEquipmentDesign(region,family,frontier,{reason:'first_standard_design',tick});
  const improvement=(score(frontier)-score(current.stats))/Math.max(.15,score(current.stats));
  if(improvement>=.08)return createEquipmentDesign(region,family,frontier,{reason:'shared_component_improvement',tick});
  return current;
}

export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){
  const frontier=artilleryDesignFrontier(region,kind),family=frontier.family,current=currentEquipmentDesign(region,family);
  if(!current)return createEquipmentDesign(region,family,frontier,{reason:'first_standard_design',tick});
  const improvement=(designScore(frontier)-designScore(current.stats))/Math.max(.2,designScore(current.stats));
  if(improvement>=.10)return createEquipmentDesign(region,family,frontier,{reason:'meaningful_capability_improvement',tick});
  return current;
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
