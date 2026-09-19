from pathlib import Path

def replace(path, old, new):
    p=Path(path); text=p.read_text()
    if new in text: return
    if old not in text: raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
    p.write_text(text.replace(old,new,1))

# Land equipment: shared components drive repeated Marks, but digital electronics are capped.
replace('js/military/equipmentGenerations.js',
"  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=q('electronics'),hull=q('hull_fabrication');",
"  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=Math.min(.65,q('electronics')),hull=q('hull_fabrication');")
replace('js/military/equipmentGenerations.js',
"  const engineering=clamp((region.industrialSupply?.capability?.precision_machining||0)*.45+(region.structuralTransformation?.capability?.manufacture||0)*.25+(region.steelIndustry?.readiness||0)*.15+(region.massEducation?.literacy||0)*.15);",
"  const components=region.industrialPlants?.componentCapability||{};\n  const gunComponent=clamp(components.gun_system||0),optical=clamp(components.optics||0),analogueElectrical=Math.min(.65,clamp(components.electronics||0)),chassis=clamp(components.wheeled_chassis||0);\n  const engineering=clamp((region.industrialSupply?.capability?.precision_machining||0)*.32+(region.structuralTransformation?.capability?.manufacture||0)*.18+(region.steelIndustry?.readiness||0)*.12+(region.massEducation?.literacy||0)*.10+gunComponent*.16+optical*.08+analogueElectrical*.04);")
replace('js/military/equipmentGenerations.js',
"    rangeKm:(heavy?3.4:2.8)*(1+(breech?.55:0)+(quick?.28:0)+(howitzer&&heavy?.55:0)+engineering*.22),\n    intrinsicAccuracy:clamp(.18+(breech?.13:0)+(quick?.11:0)+engineering*.24),\n    rateOfFire:clamp(.16+(breech?.22:0)+(quick?.42:0)+engineering*.12),\n    reliability:clamp(.52+engineering*.30+(has('steelmaking')?.10:0)),\n    mobility:clamp((heavy?.34:.58)+engineering*.14),\n    firepower:clamp((heavy?.52:.34)+(breech?.10:0)+(quick?.12:0)+(howitzer&&heavy?.18:0)+engineering*.14),\n    fireControlPotential:clamp(.20+(fc.rangeFinding||0)*.14+(fc.survey||0)*.14+(fc.fireDirection||0)*.18+(fc.predictedFire||0)*.18+engineering*.16),",
"    rangeKm:(heavy?3.4:2.8)*(1+(breech?.55:0)+(quick?.28:0)+(howitzer&&heavy?.55:0)+engineering*.30+gunComponent*.24),\n    intrinsicAccuracy:clamp(.18+(breech?.13:0)+(quick?.11:0)+engineering*.18+optical*.22+gunComponent*.10),\n    rateOfFire:clamp(.16+(breech?.22:0)+(quick?.42:0)+engineering*.10+gunComponent*.12),\n    reliability:clamp(.52+engineering*.22+gunComponent*.10+(has('steelmaking')?.10:0)),\n    mobility:clamp((heavy?.34:.58)+engineering*.08+chassis*.18),\n    firepower:clamp((heavy?.52:.34)+(breech?.10:0)+(quick?.12:0)+(howitzer&&heavy?.18:0)+engineering*.08+gunComponent*.18),\n    fireControlPotential:clamp(.20+(fc.rangeFinding||0)*.12+(fc.survey||0)*.12+(fc.fireDirection||0)*.16+(fc.predictedFire||0)*.16+optical*.14+analogueElectrical*.08+engineering*.08),")
replace('js/military/equipmentGenerations.js',
"  if(improvement>=.10)return createEquipmentDesign(region,family,frontier,{reason:'meaningful_capability_improvement',tick});",
"  if(improvement>=.065)return createEquipmentDesign(region,family,frontier,{reason:'meaningful_capability_improvement',tick});")
replace('js/military/equipmentGenerations.js',
"  if(improvement>=.08)return createEquipmentDesign(region,family,frontier,{reason:'shared_component_improvement',tick});",
"  if(improvement>=.06)return createEquipmentDesign(region,family,frontier,{reason:'shared_component_improvement',tick});")

# Vehicle production records which physical Mark was actually delivered.
replace('js/economy/industrialPlant.js',
"const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));",
"import { EQUIPMENT_FAMILIES, ensureCurrentArmouredVehicleDesign, ensureCurrentArtilleryDesign } from '../military/equipmentGenerations.js?v=20260919-predigital1';\n\nconst clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));")
replace('js/economy/industrialPlant.js',
"  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventory[productId]=(region.industrialSupply.inventory[productId]||0)+actual;return actual;",
"  region.industrialSupply||={};region.industrialSupply.inventory||={};region.industrialSupply.inventory[productId]=(region.industrialSupply.inventory[productId]||0)+actual;\n  if(actual>0&&['tank','self_propelled_gun','towed_artillery'].includes(productId)){\n    const family=productId==='tank'?EQUIPMENT_FAMILIES.TANK:productId==='self_propelled_gun'?EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN:EQUIPMENT_FAMILIES.FIELD_ARTILLERY;\n    const design=productId==='towed_artillery'?ensureCurrentArtilleryDesign(region,'field_cannon'):ensureCurrentArmouredVehicleDesign(region,family);\n    region.militaryEquipment ||= {designs:[],nextDesignSequence:{}};region.militaryEquipment.inventoryByDesign ||= {};\n    region.militaryEquipment.inventoryByDesign[design.id]=(region.militaryEquipment.inventoryByDesign[design.id]||0)+actual;\n  }\n  return actual;")

# Naval Marks: each hull class has its own evolving design catalogue. Static class is the hull concept; Mark is the current detailed design.
replace('js/military/fleets.js',
"function designOf(ship) { return SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }",
"function romanMark(n){const t=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let x=Math.max(1,Math.floor(n)),o='';for(const[v,s]of t)while(x>=v){o+=s;x-=v;}return o;}\nfunction navalFrontier(region,designId){\n  const base=SHIP_DESIGNS[designId]||SHIP_DESIGNS.basic_war_boat,c=region?.industrialPlants?.componentCapability||{};\n  const precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),readiness=clamp(region?.earlyModernMilitary?.naval?.readiness||0);\n  const hull=clamp(c.hull_fabrication||precision*.45),gun=clamp(c.gun_system||precision*.35),armour=clamp(c.armour_plate||0),optics=clamp(c.optics||0),electrical=Math.min(.65,clamp(c.electronics||0));\n  const engine=clamp(c.engine||precision*.35),trans=clamp(c.transmission||precision*.30);\n  const quality=clamp(precision*.15+hull*.19+gun*.17+armour*.10+optics*.13+electrical*.07+readiness*.11+engine*.05+trans*.03);\n  const propulsion=base.propulsion==='steam'||base.propulsion==='submersible'?clamp(engine*.5+trans*.25+precision*.15+readiness*.10):clamp(readiness*.55+precision*.25+hull*.20);\n  return {quality,stats:{...base,combat:base.combat*(.92+quality*.20),durability:base.durability*(.94+(hull*.45+armour*.35+precision*.20)*.16),speed:base.speed*(.96+propulsion*.12),pursuit:base.pursuit*(.96+(propulsion*.60+optics*.20+readiness*.20)*.12),captureResistance:base.captureResistance*(.97+(hull*.45+armour*.35+readiness*.20)*.10),armour:base.armour*(.92+armour*.20),gunCapacity:base.gunCapacity}};\n}\nexport function ensureCurrentNavalDesign(region,designId){\n  region.navalDesignCatalogue ||= {};const list=region.navalDesignCatalogue[designId] ||= [];const f=navalFrontier(region,designId),current=list[list.length-1];\n  if(!current||f.quality-(current.quality||0)>=.07){const sequence=(current?.sequence||0)+1;list.push({id:`${region.id}:${designId}:${sequence}`,designId,sequence,name:`${SHIP_DESIGNS[designId]?.label||designId} Mk ${romanMark(sequence)}`,quality:f.quality,stats:f.stats});}\n  return list[list.length-1];\n}\nfunction designOf(ship) { return ship?.designStats || SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }")
replace('js/military/fleets.js',
"function makeShip(designId, ownerRegionId, overrides = {}) {\n  const spec = SHIP_DESIGNS[designId] || SHIP_DESIGNS.basic_war_boat;\n  return {\n    id: `ship-${nextShipId++}`,\n    designId: spec.id,\n    classLabel: spec.label,",
"function makeShip(designId, ownerRegionOrId, overrides = {}) {\n  const region=typeof ownerRegionOrId==='object'?ownerRegionOrId:null,ownerRegionId=region?.id||ownerRegionOrId;\n  const spec = SHIP_DESIGNS[designId] || SHIP_DESIGNS.basic_war_boat;\n  const generation=region?ensureCurrentNavalDesign(region,spec.id):null;\n  return {\n    id: `ship-${nextShipId++}`,\n    designId: spec.id,\n    navalDesignId:generation?.id||null,modelSequence:generation?.sequence||1,modelName:generation?.name||spec.label,designStats:generation?.stats?{...generation.stats}:null,\n    classLabel: spec.label,")
for old,new in [
("makeShip(choice.target, region.id, {", "makeShip(choice.target, region, {"),
("makeShip(preferredWarshipDesign(region, i), region.id)", "makeShip(preferredWarshipDesign(region, i), region)"),
("makeShip('basic_war_boat', region.id)", "makeShip('basic_war_boat', region)"),
("makeShip(designId, region.id)", "makeShip(designId, region)"),
]: replace('js/military/fleets.js',old,new)

# A shipyard may refit the same hull class to the current Mark; it costs a real refit slot and materials.
replace('js/military/fleets.js',
"    if (fleet.refitProgress < 1) continue;\n    const candidates = fleet.ships.map((ship, index) => ({ ship, index, target: preferredWarshipDesign(region, index) }))",
"    if (fleet.refitProgress < 1) continue;\n    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:ensureCurrentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1));\n    if(markCandidate&&payRefitCost(region,markCandidate.ship.designId)){const oldLabel=markCandidate.ship.modelName||shipLabel(markCandidate.ship),replacement=makeShip(markCandidate.ship.designId,region,{id:markCandidate.ship.id,prize:false,capturedFromActorId:null});fleet.ships[markCandidate.index]=replacement;fleet.refitProgress-=1;if(events)events.push({type:'fleet_ship_mark_refit',ownerRegionId:region.id,fleetId:fleet.id,shipId:replacement.id,fromClassLabel:oldLabel,toClassLabel:replacement.modelName||replacement.classLabel});continue;}\n    const candidates = fleet.ships.map((ship, index) => ({ ship, index, target: preferredWarshipDesign(region, index) }))")

print('pre-digital equipment generations applied')
