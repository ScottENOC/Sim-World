import { PETROLEUM_REFINING_TECH_ID, SHALLOW_OIL_DRILLING_TECH_ID } from './petroleum.js?v=20260920-modern-energy1';
import { ELECTRICAL_GENERATION_TECH_ID, INDUSTRIAL_ELECTRIFICATION_TECH_ID } from './electrification.js?v=20260920-modern-energy1';
import { BATTERY_TECH_IDS } from '../economy/batteryStorage.js?v=20260920-battery1';
import { tickSpaceRaceWithLaunchGeography } from './spaceLaunchGeography.js?v=20260921-space-geography1';
import { tickSpaceExplorationBreakthroughs } from './offworldHabitats.js?v=20260921-offworld1';
import { tickOffworldHabitatsWithInfrastructure } from './spaceCooperation.js?v=20260921-space-cooperation1';
import { tickOrbitalSatellites } from './orbitalSatellites.js?v=20260921-satnav1';
import { tickSatelliteResilienceBreakthroughs } from './satelliteResilience.js?v=20260921-resilience1';
import { tickSatelliteNavigationBreakthroughs, syncSatelliteNavigationServices } from './satelliteNavigation.js?v=20260921-satnav1';
import { tickDroneBreakthroughs, tickDrones } from '../military/drones.js?v=20260920-drones2';
import { tickGuidedAirDefenceBreakthroughs, tickGuidedAirDefenceIndustry } from '../military/guidedAirDefence.js?v=20260921-ew1';
import { tickDirectedEnergyBreakthroughs, tickDirectedEnergyDefence } from '../military/directedEnergy.js?v=20260920-directed-energy1';
import { tickCarrierBreakthroughs } from '../military/carrierAviation.js?v=20260920-carriers1';
import { tickAirborneEarlyWarningBreakthroughs } from '../military/airborneEarlyWarning.js?v=20260920-aew1';
import { tickSpaceWarfareBreakthroughs, tickSpaceWarfare } from '../military/spaceWarfare.js?v=20260920-space-warfare1';
import { tickPrecisionStrikeBreakthroughs, tickPrecisionStrikeIndustry } from '../military/precisionStrike.js?v=20260921-precision-strike1';
import { tickElectronicWarfareBreakthroughs, tickElectronicWarfare } from '../military/tacticalElectronicWarfare.js?v=20260921-ew1';

export const NATURAL_GAS_EXTRACTION_TECH_ID='natural_gas_extraction';
export const GAS_TURBINE_GENERATION_TECH_ID='gas_turbine_generation';
export const LNG_PROCESSING_TECH_ID='lng_processing';
export const LNG_CARRIER_TECH_ID='lng_carrier_design';
export const PHOTOVOLTAIC_GENERATION_TECH_ID='photovoltaic_generation';

const ZERO_ENERGY_CHANCES=Object.freeze({gas:0,turbine:0,lng:0,carrier:0,solar:0,leadAcid:0,advancedBattery:0,lithiumIon:0});
const DRONE_TECH_IDS_FAST=Object.freeze(['radio_controlled_aircraft','unmanned_reconnaissance_aircraft','remotely_piloted_strike_aircraft','loitering_munitions','battery_multirotor_drones']);
const GUIDED_TECH_IDS_FAST=Object.freeze(['guided_missile_guidance','surface_to_air_missiles','radar_guided_surface_to_air_missiles']);
const DIRECTED_TECH_IDS_FAST=Object.freeze(['high_energy_laser_weapon_research','shipborne_high_energy_laser','compact_laser_power_and_thermal_systems','vehicle_mounted_laser_weapons','airborne_laser_weapons']);
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const weekly=(p,days)=>1-Math.pow(1-clamp(p),Math.max(0,Number(days)||0)/7);
const hasAnyTech=(world,ids)=>{for(const r of world){const t=r.unlockedTechIds;if(!t)continue;for(const id of ids)if(t.has(id))return true;}return false;};
function contacts(region,byId,techId){const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[])]);if(region.recentTradePartners instanceof Map)for(const id of region.recentTradePartners.keys())ids.add(id);let count=0;for(const id of ids)if(byId.get(id)?.unlockedTechIds?.has?.(techId))count++;return count;}
function diffusion(region,byId,techId,base){return 1-Math.pow(1-base,contacts(region,byId,techId));}
function readiness(region){const c=region.industrialSupply?.capability||{},p=region.industrialPlants?.componentCapability||{};const machining=clamp(c.precision_machining||0),manufacture=clamp(region.structuralTransformation?.capability?.manufacture||0),electronics=clamp(p.electronics||p.radio_navigation||0),finance=clamp(region.corporateCapital?.financialDepth||0),electric=clamp(region.electricity?.industrialService||0);return{machining,manufacture,electronics,finance,electric,overall:clamp(machining*.28+manufacture*.28+electronics*.18+finance*.10+electric*.16)};}

export function modernEnergyBreakthroughChances(region,byId){const t=region.unlockedTechIds||new Set(),r=readiness(region),hasGas=Boolean(region.deposits?.natural_gas);const gas=t.has(NATURAL_GAS_EXTRACTION_TECH_ID)||!t.has(SHALLOW_OIL_DRILLING_TECH_ID)?0:(hasGas?(0.20+r.machining*.42+r.manufacture*.38)*0.000010:0)+diffusion(region,byId,NATURAL_GAS_EXTRACTION_TECH_ID,0.00024);const turbine=t.has(GAS_TURBINE_GENERATION_TECH_ID)||!t.has(ELECTRICAL_GENERATION_TECH_ID)||!t.has(NATURAL_GAS_EXTRACTION_TECH_ID)?0:r.overall*(.35+r.machining*.35+r.manufacture*.30)*0.000006+diffusion(region,byId,GAS_TURBINE_GENERATION_TECH_ID,0.00016);const lng=t.has(LNG_PROCESSING_TECH_ID)||!t.has(PETROLEUM_REFINING_TECH_ID)||!t.has(NATURAL_GAS_EXTRACTION_TECH_ID)||!t.has(INDUSTRIAL_ELECTRIFICATION_TECH_ID)?0:r.overall*(.30+r.machining*.25+r.manufacture*.25+r.finance*.20)*0.000004+diffusion(region,byId,LNG_PROCESSING_TECH_ID,0.00012);const carrier=t.has(LNG_CARRIER_TECH_ID)||!t.has(LNG_PROCESSING_TECH_ID)||!region.isCoastal?0:r.overall*(.35+r.machining*.30+r.manufacture*.35)*0.0000035+diffusion(region,byId,LNG_CARRIER_TECH_ID,0.00010);const solar=t.has(PHOTOVOLTAIC_GENERATION_TECH_ID)||!t.has(ELECTRICAL_GENERATION_TECH_ID)?0:r.overall*(.25+r.electronics*.45+r.machining*.30)*0.0000038+diffusion(region,byId,PHOTOVOLTAIC_GENERATION_TECH_ID,0.00014);const leadAcid=t.has(BATTERY_TECH_IDS.LEAD_ACID)||!t.has(ELECTRICAL_GENERATION_TECH_ID)?0:r.overall*(.30+r.machining*.35+r.manufacture*.35)*0.000007+diffusion(region,byId,BATTERY_TECH_IDS.LEAD_ACID,0.00020);const advancedBattery=t.has(BATTERY_TECH_IDS.ADVANCED)||!t.has(BATTERY_TECH_IDS.LEAD_ACID)||!t.has(INDUSTRIAL_ELECTRIFICATION_TECH_ID)?0:r.overall*(.24+r.electronics*.28+r.machining*.20+r.manufacture*.28)*0.000004+diffusion(region,byId,BATTERY_TECH_IDS.ADVANCED,0.00014);const lithiumIon=t.has(BATTERY_TECH_IDS.LITHIUM_ION)||!t.has(BATTERY_TECH_IDS.ADVANCED)?0:r.overall*r.overall*(.22+r.electronics*.48+r.manufacture*.30)*0.0000025+diffusion(region,byId,BATTERY_TECH_IDS.LITHIUM_ION,0.00010);return{gas:clamp(gas),turbine:clamp(turbine),lng:clamp(lng),carrier:clamp(carrier),solar:clamp(solar),leadAcid:clamp(leadAcid),advancedBattery:clamp(advancedBattery),lithiumIon:clamp(lithiumIon)};}

export function tickModernEnergyBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const world=regions||[],events=[];
  const energyActive=hasAnyTech(world,[SHALLOW_OIL_DRILLING_TECH_ID,ELECTRICAL_GENERATION_TECH_ID]);
  const byId=energyActive?new Map(world.map(r=>[r.id,r])):null;
  const attempts=[['gas',NATURAL_GAS_EXTRACTION_TECH_ID,'natural_gas_breakthrough','Natural-gas production','Drilling and gas-handling methods make commercial natural-gas production practical.'],['turbine',GAS_TURBINE_GENERATION_TECH_ID,'gas_turbine_breakthrough','Gas-turbine generation','Flexible gas-fired generating plant can now support electrical grids.'],['lng',LNG_PROCESSING_TECH_ID,'lng_processing_breakthrough','Liquefied natural gas','Industrial refrigeration and gas handling make bulk LNG export and import practical.'],['carrier',LNG_CARRIER_TECH_ID,'lng_carrier_breakthrough','LNG carrier design','Specialised insulated merchant ships can now carry LNG between equipped terminals.'],['solar',PHOTOVOLTAIC_GENERATION_TECH_ID,'photovoltaic_breakthrough','Photovoltaic generation','Semiconductor manufacturing has matured enough for practical grid-connected solar generation.'],['leadAcid',BATTERY_TECH_IDS.LEAD_ACID,'lead_acid_battery_breakthrough','Rechargeable batteries','Practical rechargeable lead-acid cells make stored electrical power useful for stationary and mobile applications.'],['advancedBattery',BATTERY_TECH_IDS.ADVANCED,'advanced_battery_breakthrough','Advanced rechargeable batteries','Improved rechargeable chemistries provide better endurance, cycle life and portable power.'],['lithiumIon',BATTERY_TECH_IDS.LITHIUM_ION,'lithium_ion_battery_breakthrough','Lithium-ion batteries','Advanced materials and electronics make high-energy rechargeable cells practical at industrial scale.']];
  const directedOperating=world.some(r=>(r.directedEnergyDefence?.groundSystems||0)>0);
  for(const region of world){
    region.unlockedTechIds||=new Set();
    const chances=energyActive?modernEnergyBreakthroughChances(region,byId):ZERO_ENERGY_CHANCES;
    for(const [key,id,type,title,message] of attempts){
      if(region.unlockedTechIds.has(id))continue;
      if(rng()>=weekly(chances[key]||0,elapsedDays))continue;
      region.unlockedTechIds.add(id);events.push({type,regionId:region.id,regionName:region.name,tick:currentTick,title,message:`${region.name}: ${message}`});break;
    }
    if(directedOperating&&region.directedEnergyDefence?.groundSystems>0)tickDirectedEnergyDefence(region,elapsedDays);
  }

  events.push(...tickSpaceRaceWithLaunchGeography(world,currentTick,rng,elapsedDays));
  const spaceActive=world.some(r=>Boolean(r.spaceProgramme));
  if(spaceActive){
    events.push(...tickSpaceExplorationBreakthroughs(world,currentTick,rng,elapsedDays));
    events.push(...tickOffworldHabitatsWithInfrastructure(world,currentTick,rng,elapsedDays));
    events.push(...tickSatelliteNavigationBreakthroughs(world,currentTick,rng,elapsedDays));
    events.push(...tickOrbitalSatellites(world,currentTick,rng,elapsedDays));
    events.push(...tickSatelliteResilienceBreakthroughs(world,currentTick,rng,elapsedDays));
    events.push(...tickSpaceWarfareBreakthroughs(world,currentTick,rng,elapsedDays));
    events.push(...tickSpaceWarfare(world,currentTick,rng,elapsedDays));
    syncSatelliteNavigationServices(world);
  }

  const guidedActive=hasAnyTech(world,['rocket_stabilisation',...GUIDED_TECH_IDS_FAST]);
  if(guidedActive){events.push(...tickGuidedAirDefenceBreakthroughs(world,currentTick,rng,elapsedDays));if(hasAnyTech(world,['surface_to_air_missiles']))events.push(...tickGuidedAirDefenceIndustry(world,currentTick,rng,elapsedDays));}

  const directedActive=hasAnyTech(world,['surface_to_air_missiles',...DIRECTED_TECH_IDS_FAST]);
  if(directedActive)events.push(...tickDirectedEnergyBreakthroughs(world,currentTick,rng,elapsedDays));

  const droneActive=hasAnyTech(world,['powered_flight',...DRONE_TECH_IDS_FAST]);
  if(droneActive)events.push(...tickDroneBreakthroughs(world,currentTick,rng,elapsedDays));
  if(world.some(r=>(r.droneForces?.inventory?.length||0)>0))events.push(...tickDrones(world,currentTick,elapsedDays,rng));

  // These remaining families have their own prerequisites but still need
  // dedicated world-level gates. Keep them active for now rather than risk
  // suppressing legitimate first discoveries; the next profile will identify
  // which should be converted next.
  events.push(...tickElectronicWarfareBreakthroughs(world,currentTick,rng,elapsedDays));events.push(...tickElectronicWarfare(world,currentTick,rng,elapsedDays));events.push(...tickCarrierBreakthroughs(world,currentTick,rng,elapsedDays));events.push(...tickAirborneEarlyWarningBreakthroughs(world,currentTick,rng,elapsedDays));events.push(...tickPrecisionStrikeBreakthroughs(world,currentTick,rng,elapsedDays));events.push(...tickPrecisionStrikeIndustry(world,currentTick,rng,elapsedDays));return events;
}