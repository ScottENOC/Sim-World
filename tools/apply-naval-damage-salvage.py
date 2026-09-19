from pathlib import Path
p=Path('js/military/fleets.js')
text=p.read_text()
old_import="import { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';"
new_import="import { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, shipSensorMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';"
if old_import in text:
    text=text.replace(old_import,new_import,1)
elif new_import not in text:
    raise SystemExit('missing naval damage import')
old="""  const radarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).radarSearch||0),0)/observer.ships.length:0;
  const sonarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).sonar||0),0)/observer.ships.length:0;"""
new="""  const radarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).radarSearch||0)*shipSensorMultiplier(ship,'radar'),0)/observer.ships.length:0;
  const sonarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).sonar||0)*shipSensorMultiplier(ship,'sonar'),0)/observer.ships.length:0;"""
if old in text:
    text=text.replace(old,new,1)
elif new not in text:
    raise SystemExit('missing fleet sensor search block')
p.write_text(text)
print('naval sensor damage integration applied')
