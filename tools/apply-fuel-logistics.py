from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f'{label} anchor missing in {path}')
    p.write_text(s.replace(old,new,1))

# Natural gas is a market commodity only because trade.js now forbids generic
# carriage and requires a continuous gas-pipeline path.
replace_once('js/economy/tradeGoods.js',
"  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n",
"  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n  natural_gas:{ label: 'Pipeline natural gas', basePrice: 1.9, referenceStock: 7000, category: 'gaseous_fuel', cargoKgPerUnit: 0.72 },\n",
'natural gas trade good')

p=Path('js/economy/trade.js'); s=p.read_text()
imp="import { tickFuelLogistics, fuelTransportProfile, isDedicatedFuel } from './fuelLogistics.js?v=20260920-fuel-logistics1';\n"
if imp not in s:
    anchor="import { idleLngCarrier, lngCarrierCargoCapacity, lngRouteCompatible } from './lngSolarEnergy.js?v=20260920-modern-energy1';\n"
    if anchor not in s: raise SystemExit('trade fuel logistics import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
old="""    const lngCarrier = opp.resource === 'lng' ? idleLngCarrier(region) : null;
    if (opp.resource === 'lng' && (opp.route.mode !== 'sea' || !lngCarrier || !lngRouteCompatible(region, opp.dest))) continue;
    const capacityPerMerchant = opp.resource === 'lng'
      ? lngCarrierCargoCapacity(lngCarrier) * opp.route.reliability
      : Math.max(0.01, (opp.route.capacityKgPerMerchant / cargoKgPerUnit(opp.resource)) * opp.route.reliability);
"""
new="""    const lngCarrier = opp.resource === 'lng' ? idleLngCarrier(region) : null;
    const dedicatedFuel = isDedicatedFuel(opp.resource);
    const fuelTransport = dedicatedFuel ? fuelTransportProfile(region, opp.dest, opp.resource, opp.route, regionsById) : null;
    if (opp.resource === 'lng' && (opp.route.mode !== 'sea' || !lngCarrier || !lngRouteCompatible(region, opp.dest))) continue;
    if (dedicatedFuel && !fuelTransport) continue;
    const capacityPerMerchant = opp.resource === 'lng'
      ? lngCarrierCargoCapacity(lngCarrier) * opp.route.reliability
      : fuelTransport
        ? fuelTransport.capacityUnits * opp.route.reliability * fuelTransport.reliabilityMultiplier
        : Math.max(0.01, (opp.route.capacityKgPerMerchant / cargoKgPerUnit(opp.resource)) * opp.route.reliability);
"""
if new not in s:
    if old not in s: raise SystemExit('trade launch transport anchor missing')
    s=s.replace(old,new,1)
old="""      merchants,
      lngCarrierId: lngCarrier?.id || null,
      originPrice: opp.originPrice,
      expectedPrice: opp.expectedPrice,
      routeCost: opp.route.cost,
      tollsPaid,
      reliability: opp.route.reliability,
      transportMode: opp.route.mode,
"""
new="""      merchants,
      lngCarrierId: lngCarrier?.id || null,
      fuelAssetId: fuelTransport?.assetId || null,
      fuelTransportMode: fuelTransport?.mode || null,
      originPrice: opp.originPrice,
      expectedPrice: opp.expectedPrice,
      routeCost: opp.route.cost * (fuelTransport?.costMultiplier ?? 1),
      tollsPaid,
      reliability: opp.route.reliability * (fuelTransport?.reliabilityMultiplier ?? 1),
      transportMode: fuelTransport?.mode || opp.route.mode,
"""
if new not in s:
    if old not in s: raise SystemExit('trade venture metadata anchor missing')
    s=s.replace(old,new,1)
old="""      arrivalDay: departureDay + opp.route.oneWayDays,
      returnDay: departureDay + opp.route.roundTripDays,
"""
new="""      arrivalDay: departureDay + opp.route.oneWayDays * (fuelTransport?.timeMultiplier ?? 1),
      returnDay: departureDay + (opp.route.oneWayDays * 2 * (fuelTransport?.timeMultiplier ?? 1) + MARKET_TURNAROUND_DAYS),
"""
if new not in s:
    if old not in s: raise SystemExit('trade venture timing anchor missing')
    s=s.replace(old,new,1)
old="""export function tickTrade(regions, currentTick = null, time = null, agreements = [], profiler = null) {
  if (Number.isFinite(currentTick)) tickTradePolicyCommunications(regions, currentTick);
"""
new="""export function tickTrade(regions, currentTick = null, time = null, agreements = [], profiler = null) {
  tickFuelLogistics(regions, currentTick, time?.elapsedDays ?? 7);
  if (Number.isFinite(currentTick)) tickTradePolicyCommunications(regions, currentTick);
"""
if new not in s:
    if old not in s: raise SystemExit('trade fuel logistics tick anchor missing')
    s=s.replace(old,new,1)
Path(p).write_text(s)

# Mirrored pipeline endpoint records must age symmetrically so route direction
# cannot change the apparent condition of the same physical link.
p=Path('js/economy/fuelLogistics.js'); s=p.read_text()
old="for(const links of Object.values(s.pipelineConnections))for(const p of Object.values(links||{}))if(p.ownerRegionId===region.id){p.condition=clamp((p.condition??1)-years*.018);}\n"
new="for(const links of Object.values(s.pipelineConnections))for(const p of Object.values(links||{})){p.condition=clamp((p.condition??1)-years*.018);}\n"
if new not in s:
    if old not in s: raise SystemExit('pipeline mirror maintenance anchor missing')
    s=s.replace(old,new,1)
p.write_text(s)
