from pathlib import Path
p=Path('js/military/fleets.js'); text=p.read_text()
def rep(old,new):
 global text
 if new in text:return
 if old not in text: raise SystemExit('missing pattern: '+old[:120])
 text=text.replace(old,new,1)
old="""function navalFrontier(region,designId){
  const base=SHIP_DESIGNS[designId]||SHIP_DESIGNS.basic_war_boat,c=region?.industrialPlants?.componentCapability||{};
  const precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),readiness=clamp(region?.earlyModernMilitary?.naval?.readiness||0);
  const hull=clamp(c.hull_fabrication||precision*.45),gun=clamp(c.gun_system||precision*.35),armour=clamp(c.armour_plate||0),optics=clamp(c.optics||0),electrical=Math.min(.65,clamp(c.electronics||0));
  const engine=clamp(c.engine||precision*.35),trans=clamp(c.transmission||precision*.30);
  const quality=clamp(precision*.15+hull*.19+gun*.17+armour*.10+optics*.13+electrical*.07+readiness*.11+engine*.05+trans*.03);
  const propulsion=base.propulsion==='steam'||base.propulsion==='submersible'?clamp(engine*.5+trans*.25+precision*.15+readiness*.10):clamp(readiness*.55+precision*.25+hull*.20);
  return {quality,stats:{...base,combat:base.combat*(.92+quality*.20),durability:base.durability*(.94+(hull*.45+armour*.35+precision*.20)*.16),speed:base.speed*(.96+propulsion*.12),pursuit:base.pursuit*(.96+(propulsion*.60+optics*.20+readiness*.20)*.12),captureResistance:base.captureResistance*(.97+(hull*.45+armour*.35+readiness*.20)*.10),armour:base.armour*(.92+armour*.20),gunCapacity:base.gunCapacity}};
}
"""
new="""function navalFrontier(region,designId){
  const base=SHIP_DESIGNS[designId]||SHIP_DESIGNS.basic_war_boat,c=region?.industrialPlants?.componentCapability||{};
  const precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),readiness=clamp(region?.earlyModernMilitary?.naval?.readiness||0);
  const hull=clamp(c.hull_fabrication||precision*.45),gun=clamp(c.gun_system||precision*.35),armour=clamp(c.armour_plate||0),optics=clamp(c.optics||0),electrical=Math.min(.72,clamp(c.electronics||0));
  const engine=clamp(c.engine||precision*.35),trans=clamp(c.transmission||precision*.30),radar=region?.unlockedTechIds?.has?.('radar')?clamp(c.radar_set||0):0;
  const fireControl=clamp((c.naval_fire_control||0)*.50+optics*.27+electrical*.13+precision*.10);
  const sonar=base.submersible?0:clamp((c.sonar_set||0)*.72+electrical*.12+readiness*.16);
  const torpedo=clamp((c.torpedo_system||0)*.72+precision*.16+readiness*.12);
  const damageControl=clamp((c.damage_control||0)*.58+hull*.16+readiness*.18+electrical*.08);
  const quality=clamp(precision*.10+hull*.16+gun*.14+armour*.08+optics*.08+electrical*.05+readiness*.08+engine*.07+trans*.04+fireControl*.10+radar*.05+damageControl*.05);
  const propulsion=base.propulsion==='steam'||base.propulsion==='submersible'?clamp(engine*.48+trans*.24+precision*.12+readiness*.10+hull*.06):clamp(readiness*.55+precision*.25+hull*.20);
  const gunEffect=base.gunCapacity?clamp(gun*.44+fireControl*.34+optics*.14+radar*.08):0;
  const torpedoEffect=(designId==='destroyer'||designId==='submarine')?torpedo:0;
  const antiAir=clamp(gun*.18+fireControl*.24+radar*.30+electrical*.10+readiness*.18);
  const signature=clamp((base.submersible?.28:.72)-hull*.05-radar*.01+(base.tier||0)*.012,.18,1);
  const combatBoost=gunEffect*.15+torpedoEffect*.12+fireControl*.10+radar*.035+readiness*.04;
  return {quality,stats:{...base,combat:base.combat*(.90+quality*.12+combatBoost),durability:base.durability*(.92+(hull*.32+armour*.25+precision*.13+damageControl*.30)*.22),speed:base.speed*(.94+propulsion*.16),pursuit:base.pursuit*(.94+(propulsion*.50+optics*.12+radar*.12+readiness*.16+fireControl*.10)*.16),captureResistance:base.captureResistance*(.96+(hull*.30+armour*.20+readiness*.20+damageControl*.30)*.12),armour:base.armour*(.90+armour*.24),gunCapacity:base.gunCapacity,fireControl,radarSearch:radar,sonar,torpedoEffect,damageControl,antiAir,signature,propulsionQuality:propulsion}};
}
"""
rep(old,new)
old2="""function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const submarineBonus = isSubmarineFleet(fleet) ? 0.40 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  return clamp(0.42 + hideBonus + submarineBonus - sizePenalty - activePenalty, 0.05, 0.97);
}
"""
new2="""function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const submarineBonus = isSubmarineFleet(fleet) ? 0.40 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  const signature=fleet.ships.length?fleet.ships.reduce((s,ship)=>s+clamp(designOf(ship).signature??.72,.18,1),0)/fleet.ships.length:.72;
  return clamp(0.42 + hideBonus + submarineBonus + (1-signature)*.14 - sizePenalty - activePenalty, 0.05, 0.97);
}
"""
rep(old2,new2)
old3="""  const antiSubmarineSearch = isSubmarineFleet(target) ? fleetDestroyerCount(observer) * 0.075 : 0;
  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize + antiSubmarineSearch - targetConcealment(target) * 0.22, 0.01, 0.65);
"""
new3="""  const radarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).radarSearch||0),0)/observer.ships.length:0;
  const sonarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).sonar||0),0)/observer.ships.length:0;
  const antiSubmarineSearch = isSubmarineFleet(target) ? fleetDestroyerCount(observer) * (0.055+sonarSearch*.085) : 0;
  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize + radarSearch*.18 + antiSubmarineSearch - targetConcealment(target) * 0.22, 0.01, 0.82);
"""
rep(old3,new3)
old4="""function damageRandomShip(fleet, amount, rng) {
  if (!fleet.ships.length) return null;
  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];
  ship.condition = clamp((ship.condition ?? fleet.condition) - amount, 0.05, 1);
  return ship;
}
"""
new4="""function damageRandomShip(fleet, amount, rng) {
  if (!fleet.ships.length) return null;
  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];
  const dc=clamp(designOf(ship).damageControl||0);ship.condition = clamp((ship.condition ?? fleet.condition) - amount*(1-dc*.28), 0.05, 1);
  return ship;
}
"""
rep(old4,new4)
p.write_text(text)
print('predigital naval engineering applied')
