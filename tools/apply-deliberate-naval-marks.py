from pathlib import Path
p=Path('js/military/fleets.js');text=p.read_text()
def rep(old,new):
 global text
 if new in text:return
 if old not in text:raise SystemExit(f'missing: {old[:100]!r}')
 text=text.replace(old,new,1)

old="""export function ensureCurrentNavalDesign(region,designId){
  region.navalDesignCatalogue ||= {};const list=region.navalDesignCatalogue[designId] ||= [];const f=navalFrontier(region,designId),current=list[list.length-1];
  if(!current||f.quality-(current.quality||0)>=.07){const sequence=(current?.sequence||0)+1;list.push({id:`${region.id}:${designId}:${sequence}`,designId,sequence,name:`${SHIP_DESIGNS[designId]?.label||designId} Mk ${romanMark(sequence)}`,quality:f.quality,stats:f.stats});}
  return list[list.length-1];
}
"""
new="""export function currentNavalDesign(region,designId){
  const list=region?.navalDesignCatalogue?.[designId]||[];return [...list].reverse().find(d=>d.toolingReady!==false)||null;
}
function createNavalDesign(region,designId,{authorisedBy='initial_standard',toolingReady=true}={}){
  region.navalDesignCatalogue ||= {};const list=region.navalDesignCatalogue[designId] ||= [],f=navalFrontier(region,designId),sequence=(list.at(-1)?.sequence||0)+1;
  const design={id:`${region.id}:${designId}:${sequence}`,designId,sequence,name:`${SHIP_DESIGNS[designId]?.label||designId} Mk ${romanMark(sequence)}`,quality:f.quality,stats:f.stats,authorisedBy,toolingReady};list.push(design);return design;
}
export function ensureCurrentNavalDesign(region,designId){return currentNavalDesign(region,designId)||createNavalDesign(region,designId,{authorisedBy:'initial_standard',toolingReady:true});}
export function quoteNavalMarkUpgrade(region,designId){
  const spec=SHIP_DESIGNS[designId];if(!spec)return {available:false,reason:'unknown_ship_class'};
  if(!operationalInfrastructure(region,'shipyard')&&!operationalInfrastructure(region,'naval_base'))return {available:false,reason:'no_operational_shipyard'};
  const procurement=ensureNavalProcurement(region);procurement.designTooling ||= {};
  if(procurement.designTooling[designId]?.pendingDesignId)return {available:false,reason:'tooling_already_in_progress'};
  const nextSequence=((region.navalDesignCatalogue?.[designId]||[]).at(-1)?.sequence||0)+1,industrial=(spec.tier||0)>=5;
  return {available:true,designId,nextSequence,machineComponents:industrial?5+nextSequence*3:0,steel:industrial?10+nextSequence*6:0,wood:industrial?0:35+nextSequence*18,treasury:10+nextSequence*7,downtimeWeeks:Math.min(30,6+nextSequence*2)};
}
export function authoriseNavalMark(region,designId,{authorisedBy='player'}={}){
  const quote=quoteNavalMarkUpgrade(region,designId);if(!quote.available)return {authorised:false,...quote};
  region.industrialSupply ||= {};region.industrialSupply.inventory ||= {};region.stockpile ||= {};const inv=region.industrialSupply.inventory;
  if((inv.machine_components||0)<quote.machineComponents)return {authorised:false,reason:'insufficient_machine_components',...quote};
  if((region.stockpile.steel||0)<quote.steel)return {authorised:false,reason:'insufficient_steel',...quote};
  if((region.stockpile.wood||0)<quote.wood)return {authorised:false,reason:'insufficient_wood',...quote};
  if((region.treasury||0)<quote.treasury)return {authorised:false,reason:'insufficient_treasury',...quote};
  inv.machine_components=(inv.machine_components||0)-quote.machineComponents;region.stockpile.steel=(region.stockpile.steel||0)-quote.steel;region.stockpile.wood=(region.stockpile.wood||0)-quote.wood;region.treasury-=quote.treasury;
  const design=createNavalDesign(region,designId,{authorisedBy,toolingReady:false}),procurement=ensureNavalProcurement(region);procurement.designTooling ||= {};
  procurement.designTooling[designId]={pendingDesignId:design.id,weeksRemaining:quote.downtimeWeeks,totalWeeks:quote.downtimeWeeks,cost:quote,authorisedBy};
  return {authorised:true,design,cost:quote,downtimeWeeks:quote.downtimeWeeks};
}
export function tickNavalDesignPrograms(region,weeks=1){
  const procurement=ensureNavalProcurement(region);procurement.designTooling ||= {};
  for(const [designId,program] of Object.entries(procurement.designTooling)){if(!program?.pendingDesignId)continue;program.weeksRemaining=Math.max(0,(program.weeksRemaining||0)-Math.max(0,weeks));if(program.weeksRemaining<=0){const design=(region.navalDesignCatalogue?.[designId]||[]).find(d=>d.id===program.pendingDesignId);if(design)design.toolingReady=true;program.pendingDesignId=null;program.completedDesignId=design?.id||null;}}
  return procurement.designTooling;
}
function playerControlsNavalRegion(region){const p=globalThis.__worldsim?.activePlayerPolityId;if(!p)return false;return actorId(region)===p||region?.id===p;}
function considerNpcNavalDesignReview(region,weeks){
  const procurement=ensureNavalProcurement(region);procurement.designReviewWeeks=(procurement.designReviewWeeks||0)+Math.max(0,weeks);if(procurement.designReviewWeeks<26||playerControlsNavalRegion(region))return;procurement.designReviewWeeks=0;
  const classes=Object.keys(procurement.targets||{}).filter(id=>(procurement.targets[id]||0)>0);for(const id of classes){const current=ensureCurrentNavalDesign(region,id),frontier=navalFrontier(region,id),improvement=frontier.quality-(current?.quality||0);if(improvement<.07)continue;const result=authoriseNavalMark(region,id,{authorisedBy:'npc_naval_staff'});if(result.authorised)break;}
}
"""
rep(old,new)

old2="""    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:ensureCurrentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1));
"""
new2="""    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:currentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1));
"""
rep(old2,new2)

old3="""  for (const region of regions) {
    if (!(region.adjacentSeaIds || []).length) continue;
    const owned = byOwner.get(region.id) || [];
"""
new3="""  for (const region of regions) {
    if (!(region.adjacentSeaIds || []).length) continue;
    const owned = byOwner.get(region.id) || [];
    tickNavalDesignPrograms(region,weeks);considerNpcNavalDesignReview(region,weeks);
    serviceNavalModelDiversity(region,owned,weeks);
"""
rep(old3,new3)

anchor="""function moderniseOwnedFleet(region, fleets, weeks, events) {
"""
insert="""function serviceNavalModelDiversity(region,fleets,weeks){
  const ships=fleets.flatMap(f=>f.ships||[]),byClass=new Map();for(const ship of ships){if(!ship.navalDesignId)continue;const set=byClass.get(ship.designId)||new Set();set.add(ship.navalDesignId);byClass.set(ship.designId,set);}
  const extra=[...byClass.values()].reduce((sum,set)=>sum+Math.max(0,set.size-1),0),procurement=ensureNavalProcurement(region);if(extra<=0){procurement.modelSupportReadiness=1;return 1;}
  region.industrialSupply ||= {};region.industrialSupply.inventory ||= {};region.stockpile ||= {};const inv=region.industrialSupply.inventory,industrial=ships.some(s=>(SHIP_DESIGNS[s.designId]?.tier||0)>=5);
  const machineNeed=industrial*ships.length*.012*extra*Math.max(0,weeks),materialNeed=ships.length*.018*extra*Math.max(0,weeks);let fraction=1;
  if(machineNeed>0)fraction=Math.min(fraction,(inv.machine_components||0)/machineNeed);
  const materialKey=industrial?'steel':'wood';fraction=Math.min(fraction,(region.stockpile[materialKey]||0)/Math.max(.0001,materialNeed));fraction=clamp(fraction);
  inv.machine_components=Math.max(0,(inv.machine_components||0)-machineNeed*fraction);region.stockpile[materialKey]=Math.max(0,(region.stockpile[materialKey]||0)-materialNeed*fraction);procurement.modelSupportReadiness=clamp(.6+.4*fraction);procurement.lastModelSupport={extraModels:extra,machineComponents:machineNeed*fraction,[materialKey]:materialNeed*fraction,readiness:procurement.modelSupportReadiness};return procurement.modelSupportReadiness;
}

"""+anchor
rep(anchor,insert)

old4="""  let power = shipPower * skill * readiness * provisioningCombatMultiplier(fleet);
"""
new4="""  const modelSupport=clamp(origin?.navalProcurement?.modelSupportReadiness??1,.6,1);
  let power = shipPower * skill * readiness * provisioningCombatMultiplier(fleet) * modelSupport;
"""
rep(old4,new4)
p.write_text(text)
print('deliberate naval Marks applied')
