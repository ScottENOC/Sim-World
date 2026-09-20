from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f'{label} anchor missing in {path}')
    p.write_text(s.replace(old,new,1))

# Trade goods: natural gas remains local until converted to LNG; LNG is the sea-traded commodity.
replace_once('js/economy/tradeGoods.js',
"  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n",
"  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n  lng:        { label: 'Liquefied natural gas', basePrice: 2.6, referenceStock: 4200, category: 'bulk_fuel', cargoKgPerUnit: 1.25 },\n",
'lng trade good')

# Modern energy infrastructure.
construction_block="""  natural_gas_field: {
    id: 'natural_gas_field', name: 'Natural-gas field', requiredTechId: 'natural_gas_extraction', unique: false, requiresDeposit: 'natural_gas',
    description: 'Production wells, gathering equipment and treatment plant bringing a gas-bearing formation into commercial service.',
    workRequired: 26000, defaultWorkers: 260, minWorkers: 80, maxWorkers: 1000,
    materials: { steel: 190, copper: 35 }, wagePerWorkerWeek: 0.0042, maintenanceRate: 0.075,
  },
  gas_power_station: {
    id: 'gas_power_station', name: 'Gas-fired power station', requiredTechId: 'gas_turbine_generation', unique: false,
    requiresInfrastructure: 'local_electric_grid', minPopulation: 8000,
    description: 'Flexible gas turbines that can ramp quickly, supplying electricity and balancing variable renewable generation.',
    workRequired: 19000, defaultWorkers: 220, minWorkers: 70, maxWorkers: 900,
    materials: { steel: 150, copper: 45 }, wagePerWorkerWeek: 0.0042, maintenanceRate: 0.065,
  },
  lng_liquefaction_terminal: {
    id: 'lng_liquefaction_terminal', name: 'LNG liquefaction terminal', requiredTechId: 'lng_processing', unique: false, coastal: true,
    requiresInfrastructure: 'harbour', minPopulation: 10000,
    description: 'Gas treatment, industrial refrigeration, insulated storage and loading facilities for seaborne LNG exports.',
    workRequired: 48000, defaultWorkers: 420, minWorkers: 130, maxWorkers: 1700,
    materials: { steel: 420, copper: 90 }, wagePerWorkerWeek: 0.005, maintenanceRate: 0.09,
  },
  lng_regasification_terminal: {
    id: 'lng_regasification_terminal', name: 'LNG regasification terminal', requiredTechId: 'lng_processing', unique: false, coastal: true,
    requiresInfrastructure: 'harbour', minPopulation: 10000,
    description: 'Marine unloading, insulated storage and regasification facilities connecting imported LNG to local gas users.',
    workRequired: 36000, defaultWorkers: 330, minWorkers: 100, maxWorkers: 1350,
    materials: { steel: 330, copper: 70 }, wagePerWorkerWeek: 0.0048, maintenanceRate: 0.085,
  },
  solar_power_station: {
    id: 'solar_power_station', name: 'Solar photovoltaic power station', requiredTechId: 'photovoltaic_generation', unique: false,
    requiresInfrastructure: 'local_electric_grid', minPopulation: 5000,
    description: 'Grid-connected photovoltaic arrays. Output follows local solar availability and requires flexible generation or other balancing as penetration rises.',
    workRequired: 14500, defaultWorkers: 180, minWorkers: 55, maxWorkers: 720,
    materials: { steel: 90, copper: 55 }, wagePerWorkerWeek: 0.004, maintenanceRate: 0.04,
  },
"""
replace_once('js/economy/construction.js',
"  coal_power_station: {\n",
construction_block+"  coal_power_station: {\n",
'modern energy construction')

# Procedural natural-gas geology, separate from oil but correlated with sedimentary hydrocarbon basins only at an abstract level.
gas_geology="""    if (!region.deposits.natural_gas) {
      let gh = 2166136261;
      for (const c of `${region.id}:natural-gas`) gh = Math.imul(gh ^ c.charCodeAt(0), 16777619);
      const gasSignal = (gh >>> 0) / 4294967295;
      const basinChance = 0.18 + (region.isCoastal ? 0.05 : 0) + Math.min(0.07, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 90) * 0.05);
      if (gasSignal < basinChance) {
        const scale = Math.max(1, region.areaSqKm);
        const conventional = Math.round(scale * (55 + gasSignal * 105));
        const deep = Math.round(scale * (120 + gasSignal * 210));
        region.deposits.natural_gas = { tiers: [
          { id: 'conventional', label: 'Conventional natural-gas reservoir', initialStock: conventional, remainingStock: conventional, difficulty: 0.38, requiredTechId: 'natural_gas_extraction', maxWorkers: Math.max(18, Math.round(scale * 0.025)) },
          { id: 'deep', label: 'Deep natural-gas reservoir', initialStock: deep, remainingStock: deep, difficulty: 0.56, requiredTechId: 'natural_gas_extraction', maxWorkers: Math.max(35, Math.round(scale * 0.05)) },
        ] };
      }
    }
"""
replace_once('js/world/region.js',
"    if (!region.deposits.clay) {\n",
gas_geology+"    if (!region.deposits.clay) {\n",
'natural gas geology')

# Electricity: LNG processing load, solar learning, and demand-responsive gas peakers.
p='js/economy/electricity.js'; s=Path(p).read_text()
imp="import { modernEnergyElectricityDemand, gasPowerPotential, consumeGasForGeneration, solarGenerationMultiplier } from './lngSolarEnergy.js?v=20260920-modern-energy1';\n"
if imp not in s:
    anchor="import { tickStrategicNuclearFuelCycle, strategicNuclearElectricityDemand } from './strategicNuclear.js?v=20260920-strategic-nuclear1';\n"
    if anchor not in s: raise SystemExit('electricity import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
old="""  const strategicNuclearDemand = nonNegative(region.strategicNuclear?.electricityLoad);
  const industrialDemand = baseIndustrialDemand + lightMetalsDemand + strategicNuclearDemand;
  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand, lightMetalsDemand, strategicNuclearDemand };
"""
new="""  const strategicNuclearDemand = nonNegative(region.strategicNuclear?.electricityLoad);
  const modernEnergyDemand = modernEnergyElectricityDemand(region);
  const industrialDemand = baseIndustrialDemand + lightMetalsDemand + strategicNuclearDemand + modernEnergyDemand;
  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand, lightMetalsDemand, strategicNuclearDemand, modernEnergyDemand };
"""
if new not in s:
    if old not in s: raise SystemExit('electricity demand anchor missing')
    s=s.replace(old,new,1)
old="""  const solarOutput = solarStations * 3900 * years * solarAvailability;
  const windOutput = windStations * 4500 * years * windAvailability;

  const demand = electricityDemand(region, elapsedDays);
  const dispatch = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, nuclear: nuclear.output }, demand.total);
  const generated = dispatch.usableGeneration;
"""
new="""  const solarOutput = solarStations * 3900 * years * solarAvailability * solarGenerationMultiplier(region, elapsedDays);
  const windOutput = windStations * 4500 * years * windAvailability;

  const demand = electricityDemand(region, elapsedDays);
  const preliminary = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, nuclear: nuclear.output }, demand.total);
  const gasPotential = gasPowerPotential(region, elapsedDays);
  const gasWanted = Math.max(0, demand.total - preliminary.usableGeneration) + preliminary.balancingShortfall;
  const gasOutput = Math.min(gasPotential.outputPotential, gasWanted);
  const gasConsumed = consumeGasForGeneration(region, gasOutput, gasPotential);
  const dispatch = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, peaking: gasOutput, nuclear: nuclear.output }, demand.total);
  const generated = dispatch.usableGeneration;
"""
if new not in s:
    if old not in s: raise SystemExit('electricity generation anchor missing')
    s=s.replace(old,new,1)
old="""  state.strategicNuclearDemand = demand.strategicNuclearDemand || 0;
  return {
    ...state, coalOutput, hydroOutput, solarOutput, windOutput, nuclearOutput: nuclear.output || 0, nuclear, gridCapacity, networkReliability,
"""
new="""  state.strategicNuclearDemand = demand.strategicNuclearDemand || 0;
  state.modernEnergyDemand = demand.modernEnergyDemand || 0;
  state.gasConsumed = gasConsumed;
  return {
    ...state, coalOutput, hydroOutput, solarOutput, windOutput, gasOutput, nuclearOutput: nuclear.output || 0, nuclear, gridCapacity, networkReliability,
"""
if new not in s:
    if old not in s: raise SystemExit('electricity result anchor missing')
    s=s.replace(old,new,1)
Path(p).write_text(s)

# LNG trade is sea-only, terminal-to-terminal, and an actual carrier is reserved for the venture until it returns.
p='js/economy/trade.js'; s=Path(p).read_text()
imp="import { idleLngCarrier, lngCarrierCargoCapacity, lngRouteCompatible } from './lngSolarEnergy.js?v=20260920-modern-energy1';\n"
if imp not in s:
    anchor="import { warTradeDisruptionMultiplier } from './industrialWarEconomy.js?v=20260918-industrial-war1';\n"
    if anchor not in s: raise SystemExit('trade import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
old="""  for (const opp of opportunities) {
    if (idle < 1 || launched >= ventureCap) break;
    const capacityPerMerchant = Math.max(0.01, (opp.route.capacityKgPerMerchant / cargoKgPerUnit(opp.resource)) * opp.route.reliability);
"""
new="""  for (const opp of opportunities) {
    if (idle < 1 || launched >= ventureCap) break;
    const lngCarrier = opp.resource === 'lng' ? idleLngCarrier(region) : null;
    if (opp.resource === 'lng' && (opp.route.mode !== 'sea' || !lngCarrier || !lngRouteCompatible(region, opp.dest))) continue;
    const capacityPerMerchant = opp.resource === 'lng'
      ? lngCarrierCargoCapacity(lngCarrier) * opp.route.reliability
      : Math.max(0.01, (opp.route.capacityKgPerMerchant / cargoKgPerUnit(opp.resource)) * opp.route.reliability);
"""
if new not in s:
    if old not in s: raise SystemExit('trade LNG capacity anchor missing')
    s=s.replace(old,new,1)
old="""      resource: opp.resource,
      cargo,
      merchants,
"""
new="""      resource: opp.resource,
      cargo,
      merchants,
      lngCarrierId: lngCarrier?.id || null,
"""
if new not in s:
    if old not in s: raise SystemExit('trade venture carrier anchor missing')
    s=s.replace(old,new,1)
Path(p).write_text(s)

# Main runtime: process gas/LNG before electricity and allow gradual carrier procurement.
p='js/main.js'; s=Path(p).read_text()
imp="import { tickModernEnergy, tickLngCarrierProcurement, syncNextLngCarrierId } from './economy/lngSolarEnergy.js?v=20260920-modern-energy1';\n"
if imp not in s:
    anchor="import { tickPetroleumRefining } from './economy/petroleumRefining.js?v=20260917-oil2';\n"
    if anchor not in s: raise SystemExit('main modern energy import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
old="""  const regions = await loadWorld();
  clock.setWorldTempo(assessWorldTempo(regions));
"""
new="""  const regions = await loadWorld();
  syncNextLngCarrierId(regions);
  clock.setWorldTempo(assessWorldTempo(regions));
"""
if new not in s:
    if old not in s: raise SystemExit('main LNG id anchor missing')
    s=s.replace(old,new,1)
old="""    for (const region of regions) tickPetroleumRefining(region, time.elapsedDays);
    for (const region of regions) tickElectricity(region, time.elapsedDays);
"""
new="""    for (const region of regions) tickPetroleumRefining(region, time.elapsedDays);
    for (const region of regions) { tickModernEnergy(region, time.elapsedDays); tickLngCarrierProcurement(region); }
    for (const region of regions) tickElectricity(region, time.elapsedDays);
"""
if new not in s:
    if old not in s: raise SystemExit('main modern energy tick anchor missing')
    s=s.replace(old,new,1)
Path(p).write_text(s)

# Technology integration.
p='js/technology/breakthroughs.js'; s=Path(p).read_text()
imp="import { tickModernEnergyBreakthroughs } from './modernEnergy.js?v=20260920-modern-energy1';\n"
if imp not in s:
    anchor="import { tickElectrificationBreakthroughs } from './electrification.js?v=20260917-electric1';\n"
    if anchor not in s: raise SystemExit('breakthrough import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
call="  events.push(...tickModernEnergyBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
if call not in s:
    anchor="  events.push(...tickElectrificationBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
    if anchor not in s: raise SystemExit('breakthrough modern energy tick anchor missing')
    s=s.replace(anchor,anchor+call,1)
Path(p).write_text(s)
