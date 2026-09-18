const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const TORPEDO_TECH_ID='self_propelled_torpedo';
export const NAVAL_MINES_TECH_ID='naval_mines';
export const MINESWEEPING_TECH_ID='modern_minesweeping';
export const SUBMARINE_TECH_ID='practical_submarine';
export const DREADNOUGHT_TECH_ID='dreadnought_design';

const TECHS=[
 {id:TORPEDO_TECH_ID,label:'Self-propelled torpedo',prereq:['steel_hull_shipbuilding','precision_machining'],base:.010},
 {id:NAVAL_MINES_TECH_ID,label:'Modern naval mines',prereq:['steel_hull_shipbuilding','gunpowder'],base:.014},
 {id:MINESWEEPING_TECH_ID,label:'Purpose-built minesweeping',prereq:[NAVAL_MINES_TECH_ID,'steel_hull_shipbuilding'],base:.011},
 {id:SUBMARINE_TECH_ID,label:'Practical military submarine',prereq:[TORPEDO_TECH_ID,'steel_hull_shipbuilding'],base:.008},
 {id:DREADNOUGHT_TECH_ID,label:'All-big-gun battleship',prereq:['steel_hull_shipbuilding','breech_loading_artillery','marine_steam_engine'],base:.007},
];

function industrialReadiness(region){
 const c=region.industrialSupply?.capability||{};
 return clamp((c.precision_machining||0)*.42+(c.steelmaking||0)*.30+(region.industrialMarine?.marineEngineering||0)*.28);
}
function contacts(region,byId){
 const ids=new Set(region.neighbors||[]);
 if(region.recentTradePartners?.keys)for(const id of region.recentTradePartners.keys())ids.add(id);
 else for(const id of region.tradePartnerIds||[])ids.add(id);
 return [...ids].map(id=>byId.get(id)).filter(Boolean);
}
export function tickLateIndustrialNavalBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
 const years=Math.max(.001,elapsedDays/DAYS_PER_YEAR),byId=new Map(regions.map(r=>[r.id,r])),events=[];
 for(const region of regions){
  if(!region.isCoastal)continue;
  const readiness=industrialReadiness(region);
  for(const tech of TECHS){
   if(has(region,tech.id)||!tech.prereq.every(id=>has(region,id)))continue;
   const sources=contacts(region,byId).filter(r=>has(r,tech.id)).length;
   const annual=clamp(tech.base*(.2+readiness*1.8)+sources*.035,0,.45);
   const chance=1-Math.pow(1-annual,years);
   if(rng()>=chance)continue;
   region.unlockedTechIds.add(tech.id);
   events.push({type:'late_industrial_naval_breakthrough',techId:tech.id,regionId:region.id,regionName:region.name,tick:currentTick,title:`${tech.label} developed`});
  }
 }
 return events;
}

export function ensureNavalMineState(sea){
 sea.minefields ||= [];
 if(!Array.isArray(sea.minefields))sea.minefields=[];
 return sea.minefields;
}
export function layNavalMines(fleet,sea,ownerRegion,{currentTick=0,rng=Math.random}={}){
 if(!fleet||!sea||!ownerRegion||!has(ownerRegion,NAVAL_MINES_TECH_ID))return{laid:false,reason:'technology'};
 const stock=Math.max(0,ownerRegion.stockpile?.naval_mines||0);
 if(stock<1)return{laid:false,reason:'no_mines'};
 const used=Math.min(stock,Math.max(1,Math.ceil((fleet.ships?.length||1)*.75)));
 ownerRegion.stockpile.naval_mines-=used;
 const fields=ensureNavalMineState(sea);
 let field=fields.find(f=>f.ownerActorId===fleet.ownerActorId);
 if(!field){field={id:`mine:${sea.id}:${fleet.ownerActorId}`,ownerActorId:fleet.ownerActorId,density:0,condition:1,laidTick:currentTick,knownByActorIds:[fleet.ownerActorId]};fields.push(field);}
 field.density=clamp(field.density+used*.055*(.85+rng()*.3));field.condition=1;field.laidTick=currentTick;
 return{laid:true,used,density:field.density};
}
export function sweepNavalMines(fleet,sea,ownerRegion,{elapsedDays=7,rng=Math.random}={}){
 if(!fleet||!sea||!ownerRegion||!has(ownerRegion,MINESWEEPING_TECH_ID))return{swept:false,reason:'technology'};
 const fields=ensureNavalMineState(sea).filter(f=>f.ownerActorId!==fleet.ownerActorId&&f.density>0);
 if(!fields.length)return{swept:true,cleared:0};
 const destroyers=(fleet.ships||[]).filter(s=>s.designId==='destroyer').length;
 const effort=(fleet.ships?.length||0)*.006*(1+destroyers*.45)*Math.max(.1,elapsedDays/7)*(.75+rng()*.5);
 let cleared=0;
 for(const field of fields){const amount=Math.min(field.density,effort);field.density-=amount;cleared+=amount;if(field.density<.01)field.density=0;}
 return{swept:true,cleared};
}

function isSubmarineFleet(fleet){return (fleet?.ships?.length||0)>0&&fleet.ships.every(s=>s.designId==='submarine');}
function destroyerCount(fleet){return (fleet?.ships||[]).filter(s=>s.designId==='destroyer').length;}
function capitalShipCount(fleet){return (fleet?.ships||[]).filter(s=>['dreadnought','steel_warship','ironclad','ship_of_line'].includes(s.designId)).length;}
function damageRandomShip(fleet,damage,rng){
 const ships=(fleet?.ships||[]).filter(s=>(s.condition??1)>0.02);if(!ships.length)return null;
 const ship=ships[Math.floor(clamp(rng())*ships.length)%ships.length];ship.condition=clamp((ship.condition??1)-damage);
 return ship;
}
function resolveMineRisk(fleet,sea,rng){
 let total=0;for(const field of ensureNavalMineState(sea)){if(field.ownerActorId===fleet.ownerActorId||field.density<=0)continue;total+=field.density*field.condition;}
 if(total<=0)return null;
 const sweepProtection=destroyerCount(fleet)*.04;
 const chance=clamp(total*.16-sweepProtection,.005,.45);
 if(rng()>=chance)return null;
 const ship=damageRandomShip(fleet,.18+clamp(rng())*.35,rng);return ship?{type:'fleet_mine_strike',fleetId:fleet.id,shipId:ship.id,seaRegionId:sea.id,damage:1-(ship.condition??1)}:null;
}
function submarineAmbush(subFleet,target,ownerRegion,rng){
 const subs=subFleet.ships?.length||0;if(!subs||!target?.ships?.length)return null;
 const torpedoes=Math.max(0,ownerRegion.stockpile?.torpedoes||0);if(torpedoes<1)return null;
 const escorts=destroyerCount(target),capitals=capitalShipCount(target);
 const targetVisibility=clamp(.35+Math.log1p(target.ships.length)*.08+capitals*.09);
 const attackChance=clamp(.16+subs*.055+targetVisibility*.35,.08,.72);
 if(rng()>=attackChance)return null;
 const shots=Math.min(torpedoes,Math.max(1,Math.ceil(subs*.65)));ownerRegion.stockpile.torpedoes-=shots;
 const hitChance=clamp(.28+capitals*.045-escorts*.035,.08,.62);
 let hits=0,ship=null;for(let i=0;i<shots;i++){if(rng()<hitChance){hits++;ship=damageRandomShip(target,.32+clamp(rng())*.42,rng);}}
 const counterDetect=clamp(.04+escorts*.095+Math.log1p(target.ships.length)*.015,.03,.55);
 let subLost=false;if(rng()<counterDetect){const victim=damageRandomShip(subFleet,.45+clamp(rng())*.45,rng);subLost=Boolean(victim);}
 return{type:'submarine_ambush',submarineFleetId:subFleet.id,targetFleetId:target.id,seaRegionId:subFleet.seaRegionId,shots,hits,targetShipId:ship?.id||null,counterDetected:subLost};
}

export function tickLateIndustrialNavalWarfare(fleets,regions,seaRegions,currentTick,elapsedDays=7,rng=Math.random){
 const events=[],regionsById=new Map(regions.map(r=>[r.id,r])),seasById=new Map(seaRegions.map(s=>[s.id,s]));
 for(const sea of seaRegions)for(const field of ensureNavalMineState(sea)){field.condition=clamp(field.condition-Math.max(0,elapsedDays)/DAYS_PER_YEAR*.18);field.density=clamp(field.density*field.condition);}
 for(const fleet of fleets){
  if(fleet.locationType!=='sea'||!fleet.seaRegionId||fleet.routeSeaIds?.length)continue;
  const sea=seasById.get(fleet.seaRegionId),owner=regionsById.get(fleet.ownerRegionId);if(!sea||!owner)continue;
  if(fleet.mission==='lay_mines'){const r=layNavalMines(fleet,sea,owner,{currentTick,rng});if(r.laid)events.push({type:'naval_mines_laid',fleetId:fleet.id,seaRegionId:sea.id,...r});continue;}
  if(fleet.mission==='sweep_mines'){const r=sweepNavalMines(fleet,sea,owner,{elapsedDays,rng});if(r.swept&&r.cleared>0)events.push({type:'naval_mines_swept',fleetId:fleet.id,seaRegionId:sea.id,...r});continue;}
  const mineEvent=resolveMineRisk(fleet,sea,rng);if(mineEvent)events.push(mineEvent);
  if(!isSubmarineFleet(fleet)||!['submarine_patrol','submarine_raid_shipping'].includes(fleet.mission))continue;
  const targets=fleets.filter(t=>t!==fleet&&t.locationType==='sea'&&t.seaRegionId===fleet.seaRegionId&&t.ownerActorId!==fleet.ownerActorId&&!isSubmarineFleet(t));
  if(!targets.length)continue;
  const weighted=[...targets].sort((a,b)=>(capitalShipCount(b)*4+b.ships.length)-(capitalShipCount(a)*4+a.ships.length));
  const event=submarineAmbush(fleet,weighted[0],owner,rng);if(event)events.push(event);
 }
 return events;
}
