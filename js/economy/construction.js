import { localPrice } from './prices.js?v=20260904-weather1';
import { constructionProductivity } from './constructionProductivity.js?v=20260925-construction-productivity1';
import { tickConstructionEquipment } from './constructionEquipment.js?v=20260925-construction-equipment1';

export const HILL_FORT_TECH_ID = 'hill_forts';

export const CONSTRUCTION_TYPES = Object.freeze({
  road_network: {
    id: 'road_network', name: 'Road and bridge network', requiredTechId: null, unique: true,
    description: 'Maintained routes, causeways, bridges and waystations linking the region.',
    workRequired: 9000, defaultWorkers: 120, minWorkers: 35, maxWorkers: 500,
    materials: { stone: 500, wood: 500 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.035,
  },
  wells_cisterns: {
    id: 'wells_cisterns', name: 'Wells and cisterns', requiredTechId: null, unique: true,
    description: 'Protected wells and lined public cisterns for dry seasons and sieges.',
    workRequired: 3200, defaultWorkers: 50, minWorkers: 15, maxWorkers: 200,
    materials: { stone: 350, wood: 100, pottery: 80 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.018,
  },
  irrigation: {
    id: 'irrigation', name: 'Irrigation and drainage', requiredTechId: 'water_management', unique: true,
    description: 'Channels, ditches, embankments and drains stabilising agricultural water supply.',
    workRequired: 8500, defaultWorkers: 120, minWorkers: 40, maxWorkers: 500,
    materials: { stone: 350, wood: 450, pottery: 100 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.05,
  },
  river_weir: {
    id: 'river_weir', name: 'River weir and diversion works', requiredTechId: 'water_management', unique: true,
    requiresInfrastructure: 'irrigation', minPopulation: 4000,
    description: 'A low weir, sluices and diversion channels that store a modest pulse of river water, regulate irrigation withdrawals and alter downstream timing.',
    workRequired: 11000, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { stone: 900, wood: 800, pottery: 120 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.055,
  },
  reservoir_dam: {
    id: 'reservoir_dam', name: 'Major reservoir dam', requiredTechId: 'hydraulic_engineering', unique: true,
    requiresInfrastructure: 'river_weir', minPopulation: 12000,
    description: 'A large impoundment with controlled outlets. It can shift wet-season water into dry periods, suppress floods, secure irrigation and later support hydropower, while materially changing downstream flow.',
    workRequired: 52000, defaultWorkers: 520, minWorkers: 160, maxWorkers: 2200,
    materials: { stone: 6200, wood: 1800, pottery: 300, iron: 80 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.075,
  },
  river_weir: {
    id: 'river_weir', name: 'River weir and diversion works', requiredTechId: 'water_management', unique: true, requiresRiver: true,
    requiresInfrastructure: 'irrigation', minPopulation: 4000,
    description: 'A low weir, sluices and diversion channels that store a modest pulse of river water, regulate irrigation withdrawals and alter downstream timing.',
    workRequired: 11000, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { stone: 900, wood: 800, pottery: 120 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.055,
  },
  reservoir_dam: {
    id: 'reservoir_dam', name: 'Major reservoir dam', requiredTechId: 'hydraulic_engineering', unique: true, requiresRiver: true,
    requiresInfrastructure: 'river_weir', minPopulation: 12000,
    description: 'A large impoundment with controlled outlets. It can shift wet-season water into dry periods, suppress floods, secure irrigation and later support hydropower, while materially changing downstream flow.',
    workRequired: 52000, defaultWorkers: 520, minWorkers: 160, maxWorkers: 2200,
    materials: { stone: 6200, wood: 1800, pottery: 300, iron: 80 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.075,
  },
  aqueduct: {
    id: 'aqueduct', name: 'Long-distance aqueduct', requiredTechId: 'hydraulic_engineering', unique: true,
    requiresInfrastructure: 'irrigation', minPopulation: 9000,
    description: 'Surveyed channels, conduits, arcades and settling works bringing dependable water from beyond the settlement catchment. Its main payoff is a much higher sustainable urban population.',
    workRequired: 26000, defaultWorkers: 320, minWorkers: 90, maxWorkers: 1400,
    materials: { stone: 2600, wood: 700, pottery: 450 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.055,
  },
  urban_drainage: {
    id: 'urban_drainage', name: 'Urban drainage and sewers', requiredTechId: 'urban_drainage', unique: true,
    requiresInfrastructure: 'aqueduct', minPopulation: 12000,
    description: 'Covered drains, street channels, culverts and sewer outfalls that let dense settlements handle wastewater and stormwater without relying entirely on household disposal.',
    workRequired: 19000, defaultWorkers: 240, minWorkers: 70, maxWorkers: 1000,
    materials: { stone: 1900, wood: 350, pottery: 500 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.065,
  },
  water_treatment_plant: {
    id: 'water_treatment_plant', name: 'Drinking-water treatment plant', requiredTechId: 'germ_theory', unique: true,
    requiresInfrastructure: 'aqueduct', minPopulation: 18000,
    description: 'Filtration, settling, disinfection and pumping works that turn raw water into dependable potable supply. Service falls when the plant is damaged or loses electricity.',
    workRequired: 24000, defaultWorkers: 260, minWorkers: 80, maxWorkers: 1000,
    materials: { stone: 1600, steel: 220, iron: 180, copper: 45 }, wagePerWorkerWeek: 0.004, maintenanceRate: 0.075,
  },
  wastewater_treatment_plant: {
    id: 'wastewater_treatment_plant', name: 'Wastewater treatment plant', requiredTechId: 'germ_theory', unique: true,
    requiresInfrastructure: 'urban_drainage', minPopulation: 20000,
    description: 'Settling, biological treatment and sludge-handling works that remove pathogens and nutrients before discharge and create a source for later water reuse.',
    workRequired: 28000, defaultWorkers: 300, minWorkers: 90, maxWorkers: 1150,
    materials: { stone: 1700, steel: 260, iron: 200, copper: 55 }, wagePerWorkerWeek: 0.0042, maintenanceRate: 0.085,
  },
  water_pumping_station: {
    id: 'water_pumping_station', name: 'Municipal water pumping station', requiredTechId: 'industrial_electrification', unique: true,
    requiresInfrastructure: 'aqueduct', minPopulation: 18000,
    description: 'Electric pumps, valves and service reservoirs that maintain pressure and move bulk water through a modern urban network.',
    workRequired: 15000, defaultWorkers: 170, minWorkers: 50, maxWorkers: 650,
    materials: { stone: 650, steel: 260, iron: 160, copper: 85 }, wagePerWorkerWeek: 0.0045, maintenanceRate: 0.08,
  },
  bulk_water_pipeline: {
    id: 'bulk_water_pipeline', name: 'Bulk water pipeline', requiredTechId: 'industrial_electrification', unique: true,
    requiresInfrastructure: 'water_pumping_station', minPopulation: 22000,
    description: 'Large pressurised mains and trunk pipelines connecting sources, treatment works, reservoirs and urban distribution networks.',
    workRequired: 32000, defaultWorkers: 340, minWorkers: 100, maxWorkers: 1300,
    materials: { steel: 700, iron: 300, copper: 40, stone: 800 }, wagePerWorkerWeek: 0.0045, maintenanceRate: 0.065,
  },
  desalination_plant: {
    id: 'desalination_plant', name: 'Seawater desalination plant', requiredTechId: 'industrial_electrification', coastal: true, unique: true,
    requiresInfrastructure: 'water_pumping_station', minPopulation: 30000,
    description: 'Energy-intensive seawater intake, membrane or thermal treatment, and pumping works producing a drought-resistant water source. Output collapses with plant damage or power loss.',
    workRequired: 46000, defaultWorkers: 440, minWorkers: 130, maxWorkers: 1700,
    materials: { steel: 950, iron: 360, copper: 150, stone: 1100 }, wagePerWorkerWeek: 0.0052, maintenanceRate: 0.11,
  },
  watchtowers: {
    id: 'watchtowers', name: 'Watchtower network', requiredTechId: 'hill_forts', unique: true,
    description: 'Border towers, signal fires and patrol posts providing early warning.',
    workRequired: 4200, defaultWorkers: 60, minWorkers: 20, maxWorkers: 250,
    materials: { stone: 250, wood: 400 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.03,
  },
  settlement_walls: {
    id: 'settlement_walls', name: 'Fortified settlement walls', requiredTechId: 'hill_forts', unique: true,
    minPopulation: 5000,
    description: 'Walls and gates protecting the principal settlement, inhabitants and stores.',
    workRequired: 14000, defaultWorkers: 180, minWorkers: 60, maxWorkers: 700,
    materials: { stone: 1400, wood: 500 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.018,
  },
  state_quarry: {
    id: 'state_quarry', name: 'State quarry', requiredTechId: null, unique: true, requiresDeposit: 'stone',
    description: 'Organised faces, ramps and hauling teams increasing dependable stone supply.',
    workRequired: 5000, defaultWorkers: 75, minWorkers: 25, maxWorkers: 300,
    materials: { wood: 500, bronze: 12 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.025,
  },
  deep_mine: {
    id: 'deep_mine', name: 'Deep mine works', requiredTechId: 'shaft_mining', unique: true,
    description: 'Shafts, shoring and haulage opening deposits beneath exhausted surface workings.',
    workRequired: 8000, defaultWorkers: 100, minWorkers: 30, maxWorkers: 400,
    materials: { wood: 900, stone: 250, bronze: 20 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.045,
  },
  mine_drainage: {
    id: 'mine_drainage', name: 'Mine drainage works', requiredTechId: 'mine_drainage', unique: true,
    requiresInfrastructure: 'deep_mine',
    description: 'Drains, sumps and lifting machinery allowing miners to work below the water table.',
    workRequired: 7000, defaultWorkers: 90, minWorkers: 30, maxWorkers: 350,
    materials: { wood: 700, stone: 400, bronze: 25 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.055,
  },
  royal_arsenal: {
    id: 'royal_arsenal', name: 'Royal arsenal', requiredTechId: null, unique: true,
    description: 'Secure workshops and stores coordinating arms and siege-engine production.',
    workRequired: 6000, defaultWorkers: 80, minWorkers: 25, maxWorkers: 350,
    materials: { stone: 300, wood: 600, bronze: 30 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.025,
  },
  drill_ground: {
    id: 'drill_ground', name: 'Barracks and drill ground', requiredTechId: 'military_drill', unique: true,
    requiresInfrastructure: 'royal_arsenal', minPopulation: 7000,
    description: 'Permanent mustering space, barracks, stores and instructors that make repeated formation drill and standardised mobilisation practical.',
    workRequired: 9000, defaultWorkers: 110, minWorkers: 35, maxWorkers: 450,
    materials: { stone: 650, wood: 800, iron: 20 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.035,
  },
  market_customs: {
    id: 'market_customs', name: 'Market and customs house', requiredTechId: null, unique: true,
    minPopulation: 3000,
    description: 'A supervised market, standard storehouses and officials assessing traded goods.',
    workRequired: 4500, defaultWorkers: 65, minWorkers: 20, maxWorkers: 250,
    materials: { stone: 250, wood: 450, pottery: 100 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.025,
  },
  mint: {
    id: 'mint', name: 'State mint', requiredTechId: 'coinage', unique: true,
    requiresInfrastructure: 'market_customs', minPopulation: 5000,
    description: 'A controlled workshop for assaying metal, maintaining official dies and issuing recognisable state coinage. It improves monetary administration rather than creating wealth from nothing.',
    workRequired: 5200, defaultWorkers: 70, minWorkers: 20, maxWorkers: 260,
    materials: { stone: 280, wood: 300, bronze: 18 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.025,
  },
  administrative_centre: {
    id: 'administrative_centre', name: 'Palace and administrative centre', requiredTechId: null, unique: true,
    minPopulation: 5000,
    description: 'Audience halls, records rooms, stores and offices supporting durable government.',
    workRequired: 10000, defaultWorkers: 140, minWorkers: 45, maxWorkers: 550,
    materials: { stone: 900, wood: 700, pottery: 150, bronze: 20 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.025,
  },
  relay_stations: {
    id: 'relay_stations', name: 'Royal relay stations', requiredTechId: 'relay_administration', unique: true,
    requiresInfrastructure: 'road_network', minPopulation: 6000,
    description: 'Maintained posts, remounts, messengers and stores that carry official information and orders much faster than ordinary travellers.',
    workRequired: 7600, defaultWorkers: 85, minWorkers: 25, maxWorkers: 350,
    materials: { stone: 350, wood: 650, pottery: 100 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.045,
  },
  canal: {
    id: 'canal', name: 'Canal', requiredTechId: 'water_management', unique: true,
    requiresInfrastructure: 'irrigation', minPopulation: 10000,
    description: 'A major managed waterway carrying irrigation water and bulk goods.',
    workRequired: 22000, defaultWorkers: 250, minWorkers: 80, maxWorkers: 1000,
    materials: { stone: 1600, wood: 1000, pottery: 200 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.06,
  },
  public_granary: {
    id: 'public_granary', name: 'Public granary', requiredTechId: null,
    description: 'A guarded communal storehouse using raised floors, sealed rooms and pottery vessels.',
    workRequired: 2600, defaultWorkers: 50, minWorkers: 15, maxWorkers: 200,
    materials: { stone: 250, wood: 300, pottery: 200 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.02,
  },
  harbour: {
    id: 'harbour', name: 'Harbour', requiredTechId: null, coastal: true, unique: true,
    description: 'Quays, sheltered moorings, ramps and stores capable of supporting large vessels.',
    workRequired: 7800, defaultWorkers: 100, minWorkers: 30, maxWorkers: 500,
    materials: { stone: 800, wood: 600 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.025,
  },
  shipyard: {
    id: 'shipyard', name: 'Advanced shipyard', requiredTechId: 'advanced_boatbuilding', coastal: true, unique: true,
    requiresInfrastructure: 'harbour',
    description: 'Specialist slips, sheds, cranes and stores for constructing advanced vessels.',
    workRequired: 6200, defaultWorkers: 80, minWorkers: 25, maxWorkers: 350,
    materials: { stone: 350, wood: 900, bronze: 20 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.03,
  },
  airfield: {
    id: 'airfield', name: 'Airfield and aircraft workshops', requiredTechId: 'powered_flight', unique: false,
    minPopulation: 8000,
    description: 'Prepared flying ground, hangars, fuel stores and workshops supporting persistent aircraft. Damaged aircraft require materials, money and time here to return to service.',
    workRequired: 18000, defaultWorkers: 180, minWorkers: 55, maxWorkers: 750,
    materials: { wood: 1000, stone: 450, steel: 160, textiles: 100 }, wagePerWorkerWeek: 0.0042,
    maintenanceRate: 0.07,
  },
  telephone_exchange: {
    id: 'telephone_exchange', name: 'Telephone exchange and local lines', requiredTechId: 'telephone_networks', unique: false,
    requiresInfrastructure: 'telegraph_network', minPopulation: 10000,
    description: 'A staffed switchboard, local copper loops and business/government subscribers. Early networks improve dense local coordination rather than replacing long-distance telegraphy.',
    workRequired: 11500, defaultWorkers: 135, minWorkers: 40, maxWorkers: 550,
    materials: { wood: 420, iron: 110, copper: 55 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
  telegraph_network: {
    id: 'telegraph_network', name: 'Electrical telegraph network', requiredTechId: 'electrical_telegraphy', unique: true,
    minPopulation: 5000,
    description: 'Telegraph offices, poles, wire and trained operators linking this region to adjacent wired regions. Damage or an unwired gap breaks the rapid route.',
    workRequired: 12500, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { wood: 900, iron: 180, copper: 35 }, wagePerWorkerWeek: 0.0032, maintenanceRate: 0.055,
  },
  natural_gas_field: {
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
  coal_power_station: {
    id: 'coal_power_station', name: 'Coal-fired power station', requiredTechId: 'electrical_generation', unique: false,
    minPopulation: 10000,
    description: 'Steam-driven dynamos, boilers and switchgear generating local electrical power. Output depends on a continuing coal supply.',
    workRequired: 22000, defaultWorkers: 280, minWorkers: 90, maxWorkers: 1100,
    materials: { stone: 900, iron: 220, steel: 140 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.07,
  },
  local_electric_grid: {
    id: 'local_electric_grid', name: 'Local electric distribution grid', requiredTechId: 'local_electric_distribution', unique: false,
    minPopulation: 8000,
    description: 'Local wires, substations and distribution equipment carrying generated electricity to homes, workshops and factories.',
    workRequired: 15000, defaultWorkers: 190, minWorkers: 60, maxWorkers: 800,
    materials: { wood: 700, iron: 120, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
  hydroelectric_station: {
    id: 'hydroelectric_station', name: 'Hydroelectric station', requiredTechId: 'hydroelectric_generation', unique: false,
    requiresInfrastructure: 'reservoir_dam', minPopulation: 7000,
    description: 'Turbines and generators converting controlled river flow into local electrical power.',
    workRequired: 26000, defaultWorkers: 300, minWorkers: 100, maxWorkers: 1200,
    materials: { stone: 1200, iron: 180, steel: 180 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.06,
  },
  nuclear_fuel_plant: {
    id: 'nuclear_fuel_plant', name: 'Nuclear fuel fabrication plant', requiredTechId: 'uranium_fuel_cycle', unique: false,
    requiresInfrastructure: 'factory', minPopulation: 25000,
    description: 'Shielded chemical and precision-engineering works concentrating uranium and fabricating controlled civilian reactor fuel. Imported uranium ore can feed the plant.',
    workRequired: 72000, defaultWorkers: 720, minWorkers: 220, maxWorkers: 2400,
    materials: { stone: 2400, steel: 950, copper: 180, aluminium: 80 }, wagePerWorkerWeek: 0.0055, maintenanceRate: 0.085,
  },
  nuclear_power_station: {
    id: 'nuclear_power_station', name: 'Nuclear power station', requiredTechId: 'nuclear_power_generation', unique: false,
    requiresInfrastructure: 'local_electric_grid', requiresCoolingWater: true, minPopulation: 50000,
    description: 'A large civilian reactor complex with containment, steam plant, shielding, cooling systems and grid switchyard. It requires fabricated reactor fuel and dependable cooling water.',
    workRequired: 450000, defaultWorkers: 1800, minWorkers: 550, maxWorkers: 5200,
    materials: { stone: 9000, steel: 3600, copper: 650, aluminium: 180 }, wagePerWorkerWeek: 0.0065, maintenanceRate: 0.095,
  },
  spent_fuel_storage: {
    id: 'spent_fuel_storage', name: 'Dedicated spent-fuel storage', requiredTechId: 'spent_fuel_management', unique: false,
    requiresInfrastructure: 'nuclear_power_station', minPopulation: 15000,
    description: 'Shielded pools, handling equipment and durable storage structures extending safe capacity for intensely radioactive spent reactor fuel.',
    workRequired: 90000, defaultWorkers: 700, minWorkers: 220, maxWorkers: 2600,
    materials: { stone: 4800, steel: 1200, copper: 100 }, wagePerWorkerWeek: 0.0055, maintenanceRate: 0.055,
  },
  uranium_enrichment_complex: {
    id: 'uranium_enrichment_complex', name: 'Uranium isotope-separation complex', requiredTechId: 'isotope_separation', unique: false,
    requiresInfrastructure: 'local_electric_grid', minPopulation: 50000,
    description: 'A large precision-industrial isotope-separation complex. It can support advanced civilian fuel production or, under a deliberate strategic programme, accumulate proliferation-significant material. Its electricity and procurement footprint is difficult to hide completely.',
    workRequired: 260000, defaultWorkers: 1500, minWorkers: 450, maxWorkers: 4800,
    materials: { stone: 5200, steel: 2600, copper: 900, aluminium: 260 }, wagePerWorkerWeek: 0.0062, maintenanceRate: 0.105,
  },
  nuclear_reprocessing_plant: {
    id: 'nuclear_reprocessing_plant', name: 'Nuclear reprocessing plant', requiredTechId: 'spent_fuel_reprocessing', unique: false,
    requiresInfrastructure: 'nuclear_power_station', minPopulation: 40000,
    description: 'A shielded chemical-industrial complex for recovering useful material from spent reactor fuel. It reduces waste pressure and extends fuel supply, while also creating strategically sensitive separation capability.',
    workRequired: 210000, defaultWorkers: 1300, minWorkers: 400, maxWorkers: 4200,
    materials: { stone: 6500, steel: 2300, copper: 520, aluminium: 130 }, wagePerWorkerWeek: 0.0060, maintenanceRate: 0.10,
  },
  nuclear_weapons_research_establishment: {
    id: 'nuclear_weapons_research_establishment', name: 'Strategic nuclear research establishment', requiredTechId: 'isotope_separation', unique: false,
    requiresInfrastructure: 'factory', minPopulation: 50000,
    description: 'A secure state research and engineering establishment able to pursue an experimental nuclear explosive programme. It creates a visible procurement and staffing footprint but contains no deployable weapon by itself.',
    workRequired: 180000, defaultWorkers: 1100, minWorkers: 320, maxWorkers: 3600,
    materials: { stone: 4200, steel: 1900, copper: 420, aluminium: 180 }, wagePerWorkerWeek: 0.0064, maintenanceRate: 0.095,
  },
  nuclear_test_range: {
    id: 'nuclear_test_range', name: 'Nuclear test range', requiredTechId: 'nuclear_test_validation', unique: true,
    minPopulation: 5000,
    description: 'A controlled remote test infrastructure used to instrument and contain an experimental nuclear demonstration. The simulation deliberately abstracts all device engineering and yield details.',
    workRequired: 120000, defaultWorkers: 700, minWorkers: 200, maxWorkers: 2400,
    materials: { stone: 3200, steel: 950, copper: 180 }, wagePerWorkerWeek: 0.0058, maintenanceRate: 0.055,
  },
  petroleum_refinery: {
    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,
    minPopulation: 8000,
    description: 'Distillation towers, tanks, furnaces and pipework processing crude oil into specialised fuels. It can operate on imported crude and does not require local petroleum deposits.',
    workRequired: 18000, defaultWorkers: 220, minWorkers: 70, maxWorkers: 900,
    materials: { stone: 900, iron: 180, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,
  },
  factory: {
    id: 'factory', name: 'Industrial factory', requiredTechId: 'steelmaking', unique: false,
    minPopulation: 8000,
    description: 'A powered industrial plant with machine halls, tooling and production-floor capacity. Vehicles and other complex mass-produced goods require real factory capacity rather than appearing directly from raw materials.',
    workRequired: 16500, defaultWorkers: 210, minWorkers: 65, maxWorkers: 900,
    materials: { stone: 700, iron: 160, steel: 120, wood: 350 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.06,
  },
  naval_base: {
    id: 'naval_base', name: 'Naval base and sheds', requiredTechId: 'naval_warfare', coastal: true, unique: true,
    requiresInfrastructure: 'harbour', minPopulation: 7000,
    description: 'Dedicated warship sheds, stores, repair space and naval administration supporting a fleet that exists to fight rather than merely transport soldiers.',
    workRequired: 10500, defaultWorkers: 135, minWorkers: 40, maxWorkers: 550,
    materials: { stone: 700, wood: 1200, bronze: 30 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.04,
  },
  coastal_fortifications: {
    id: 'coastal_fortifications', name: 'Coastal and strait fortifications', requiredTechId: 'hill_forts', coastal: true, unique: true,
    description: 'Fortified headlands, signal towers, protected anchorages and defended shore positions. On a narrow passage these works make persistent toll collection and naval interdiction far more credible.',
    workRequired: 11500, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { stone: 1250, wood: 650, bronze: 25 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.035,
  },
  monumental_tomb: {
    id: 'monumental_tomb', name: 'Monumental royal tomb', requiredTechId: null, monumental: true,
    minPopulation: 7000,
    description: 'A deliberately overwhelming royal burial complex. It creates no resources; its value is social: demonstrating that the ruler can command labour, stone and ritual on a scale ordinary households cannot.',
    workRequired: 32000, defaultWorkers: 420, minWorkers: 120, maxWorkers: 1800,
    materials: { stone: 4200, wood: 900, pottery: 350, bronze: 45 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.008,
    prestige: { authority: 0.22, religious: 0.08, foreign: 0.16, legacy: 0.95, tourismPotential: 0.9 },
  },
  great_temple: {
    id: 'great_temple', name: 'Great temple complex', requiredTechId: null, monumental: true,
    minPopulation: 8000,
    description: 'A major sanctuary, ceremonial precinct and storehouse complex. Its political effect comes from public ritual, priestly organisation and visible patronage rather than a magical yield bonus.',
    workRequired: 28000, defaultWorkers: 380, minWorkers: 110, maxWorkers: 1500,
    materials: { stone: 3000, wood: 1300, pottery: 650, bronze: 55 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.014,
    prestige: { authority: 0.14, religious: 0.24, foreign: 0.11, legacy: 0.8, tourismPotential: 0.75 },
  },
  ceremonial_complex: {
    id: 'ceremonial_complex', name: 'Ceremonial and assembly complex', requiredTechId: null, monumental: true,
    minPopulation: 6000,
    description: 'Processional spaces, courts, halls and monuments designed for assemblies and state ceremony. It can make distant rule feel more credible, but only while people continue to use and maintain it.',
    workRequired: 22000, defaultWorkers: 300, minWorkers: 90, maxWorkers: 1200,
    materials: { stone: 2200, wood: 1500, pottery: 450, bronze: 30 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.018,
    prestige: { authority: 0.18, religious: 0.07, foreign: 0.12, legacy: 0.6, tourismPotential: 0.55 },
  },
  monumental_statue: {
    id: 'monumental_statue', name: 'Colossal monument', requiredTechId: null, monumental: true,
    minPopulation: 5000,
    description: 'An exceptional statue, stele or commemorative monument whose main output is reputation: proof of skilled craft, surplus and political ambition. Other states remain free to imitate or surpass it.',
    workRequired: 17000, defaultWorkers: 240, minWorkers: 70, maxWorkers: 900,
    materials: { stone: 1700, wood: 500, pottery: 150, bronze: 90 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.01,
    prestige: { authority: 0.1, religious: 0.03, foreign: 0.2, legacy: 0.72, tourismPotential: 0.7 },
  },
  hill_fort: {
    id: 'hill_fort', name: 'Hill fort', requiredTechId: HILL_FORT_TECH_ID,
    description: 'A fortified refuge and defended seat of power on commanding ground.',
    workRequired: 5200, defaultWorkers: 100, minWorkers: 25, maxWorkers: 400,
    materials: { stone: 600, wood: 150 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.015,
  },
});

let nextProjectId = 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function projectScale(type, workers) {
  if (!type?.monumental) return 1;
  return clamp((Number(workers) || type.defaultWorkers) / type.defaultWorkers, 0.5, 4);
}

function scaledProjectSpec(type, workers) {
  const scale = projectScale(type, workers);
  const workScale = type.monumental ? Math.pow(scale, 1.15) : 1;
  const materialScale = type.monumental ? scale : 1;
  return {
    scale,
    workScale,
    workRequired: type.workRequired * workScale,
    materialsRequired: Object.fromEntries(Object.entries(type.materials)
      .map(([resource, amount]) => [resource, amount * materialScale])),
  };
}

export function ensureConstruction(region) {
  if (!region.construction) region.construction = { projects: [], completed: {}, workersReserved: 0, lastWeek: null };
  if (!Array.isArray(region.construction.projects)) region.construction.projects = [];
  if (!region.construction.completed) region.construction.completed = {};
  if (!Array.isArray(region.construction.assets)) {
    region.construction.assets = [];
    for (const [typeId, count] of Object.entries(region.construction.completed)) {
      for (let i = 0; i < (Number(count) || 0); i++) region.construction.assets.push({ id: `legacy-${typeId}-${i}`, typeId, condition: 1, scale: 1 });
    }
  }
  for (const asset of region.construction.assets) if (!Number.isFinite(asset.scale)) asset.scale = 1;
  if (!Number.isFinite(region.construction.maintenanceWorkersReserved)) region.construction.maintenanceWorkersReserved = 0;
  return region.construction;
}

export function syncNextProjectId(regions = []) {
  nextProjectId = Math.max(1, ...regions.flatMap((region) => ensureConstruction(region).projects)
    .map((project) => (Number(project.id) || 0) + 1));
}

export function availableConstructionTypes(region) {
  const state = ensureConstruction(region);
  return Object.values(CONSTRUCTION_TYPES).filter((type) =>
    (!type.requiredTechId || region.unlockedTechIds.has(type.requiredTechId)) &&
    (!type.coastal || region.isCoastal) &&
    (!type.requiresInfrastructure || operationalInfrastructure(region, type.requiresInfrastructure)) &&
    (!type.requiresDeposit || Boolean(region.deposits?.[type.requiresDeposit])) &&
    (!type.requiresRiver || (region.hydrology?.riverIds || []).length > 0) &&
    (!type.requiresCoolingWater || region.isCoastal || (region.hydrology?.riverIds || []).length > 0) &&
    (!type.minPopulation || (region.population || 0) >= type.minPopulation) &&
    (!type.unique || !state.assets.some((asset) => asset.typeId === type.id)) &&
    !state.projects.some((project) => project.typeId === type.id && project.status === 'active'));
}

export function startConstruction(region, typeId, requestedWorkers, currentTick) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!type || (type.requiredTechId && !region.unlockedTechIds.has(type.requiredTechId)) ||
      (type.coastal && !region.isCoastal) ||
      (type.requiresInfrastructure && !operationalInfrastructure(region, type.requiresInfrastructure)) ||
      (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) ||
      (type.requiresRiver && !(region.hydrology?.riverIds || []).length) ||
      (type.requiresCoolingWater && !region.isCoastal && !(region.hydrology?.riverIds || []).length) ||
      (type.minPopulation && (region.population || 0) < type.minPopulation)) return null;
  const state = ensureConstruction(region);
  if (type.unique && state.assets.some((asset) => asset.typeId === type.id)) return null;
  if (state.projects.some((project) => project.typeId === typeId && project.status === 'active')) return null;
  const workers = Math.round(clamp(Number(requestedWorkers) || type.defaultWorkers, type.minWorkers, type.maxWorkers));
  const spec = scaledProjectSpec(type, workers);
  const project = {
    id: nextProjectId++, typeId, status: 'active', startedTick: currentTick,
    targetWorkers: workers, workersThisWeek: 0, workDone: 0,
    scale: spec.scale, workRequired: spec.workRequired, materialsRequired: spec.materialsRequired, kind: 'build',
    dedicatedReligionId: type.monumental ? (region.religion?.stateReligionId || null) : null,
    materialsUsed: Object.fromEntries(Object.keys(spec.materialsRequired).map((key) => [key, 0])),
    wagesPaid: 0, suppliesPaid: 0, stalledReason: null, completedTick: null,
  };
  state.projects.push(project);
  return project;
}

export function setConstructionWorkers(region, projectId, workers) {
  const project = ensureConstruction(region).projects.find((item) => item.id === Number(projectId));
  const type = project && CONSTRUCTION_TYPES[project.typeId];
  if (!project || !type || project.status !== 'active') return false;
  project.targetWorkers = Math.round(clamp(Number(workers) || type.minWorkers, type.minWorkers, type.maxWorkers));
  return true;
}

export function cancelConstruction(region, projectId) {
  const project = ensureConstruction(region).projects.find((item) => item.id === Number(projectId));
  if (!project || project.status !== 'active') return false;
  project.status = 'cancelled';
  project.workersThisWeek = 0;
  return true;
}

// Called before ordinary production. Builders are a real claim on working-age
// labour, not a cosmetic progress number layered on top of a full economy.
export function prepareConstructionLabor(regions) {
  for (const region of regions) {
    const state = ensureConstruction(region);
    const project = state.projects.find((item) => item.status === 'active');
    const maintenanceNeed = state.assets.reduce((sum, asset) => {
      const type = CONSTRUCTION_TYPES[asset.typeId];
      const scale = Number(asset.scale) || 1;
      return sum + (type ? type.workRequired * scale * (type.maintenanceRate || 0.02) / 52 / 20 : 0);
    }, 0);
    state.maintenanceWorkersReserved = Math.min(Math.ceil(maintenanceNeed), Math.floor(Math.max(0, availableWorkers(region)) * 0.05));
    if (!project) { state.workersReserved = 0; continue; }
    const available = Math.max(0, availableWorkers(region) - state.maintenanceWorkersReserved);
    state.workersReserved = Math.min(project.targetWorkers, Math.floor(available * 0.35));
  }
}

export function constructionEstimate(region, typeId, workers) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!type) return null;
  const assigned = clamp(Number(workers) || type.defaultWorkers, type.minWorkers, type.maxWorkers);
  const spec = scaledProjectSpec(type, assigned);
  const productivity = constructionProductivity(region, typeId, assigned);
  const weeks = Math.ceil(spec.workRequired / Math.max(0.001, assigned * productivity));
  const wages = spec.workRequired / Math.max(0.001, productivity) * type.wagePerWorkerWeek;
  const supplies = Object.entries(spec.materialsRequired).reduce((sum, [resource, amount]) =>
    sum + amount * localPrice(region, resource), 0);
  return { workers: assigned, weeks, wages, supplies, totalCost: wages + supplies, productivity,
    materials: { ...spec.materialsRequired }, scale: spec.scale, monumental: Boolean(type.monumental) };
}

function completeProject(region, project, type, currentTick) {
  project.status = 'completed'; project.completedTick = currentTick; project.workersThisWeek = 0;
  const state = ensureConstruction(region);
  if (project.kind === 'repair') {
    const asset = state.assets.find((item) => item.id === project.repairAssetId);
    if (asset) asset.condition = 1;
    return { type: 'construction_completed', regionId: region.id, regionName: region.name, project,
      constructionType: { ...type, name: `${type.name} repairs` } };
  }
  state.completed[type.id] = (state.completed[type.id] || 0) + 1;
  state.assets.push({ id: `${project.id}-${type.id}`, typeId: type.id, condition: 1,
    completedTick: currentTick, scale: project.scale || 1, dedicatedReligionId: project.dedicatedReligionId || null });
  if (!region.infrastructure) region.infrastructure = {};
  if (type.id === 'hill_fort') region.infrastructure.hillForts = (region.infrastructure.hillForts || 0) + 1;
  if (type.id === 'public_granary') region.infrastructure.publicGranaries = (region.infrastructure.publicGranaries || 0) + 1;
  return { type: 'construction_completed', regionId: region.id, regionName: region.name, project, constructionType: type };
}

export function tickConstruction(regions, currentTick, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const events = [];
  for (const region of regions) {
    tickConstructionEquipment(region, elapsedDays);
    const state = ensureConstruction(region);
    const project = state.projects.find((item) => item.status === 'active');
    if (!project) { state.workersReserved = 0; state.lastWeek = null; continue; }
    const type = CONSTRUCTION_TYPES[project.typeId];
    const requiredWork = project.workRequired || type.workRequired;
    const requiredMaterials = project.materialsRequired || type.materials;
    const remainingWork = Math.max(0, requiredWork - project.workDone);
    const workers = Math.min(state.workersReserved || 0, remainingWork);
    const productivity = constructionProductivity(region, project.typeId, workers);
    const desiredWorkerWeeks = workers * weekScale;
    const desiredWork = desiredWorkerWeeks * productivity;
    const desiredFraction = desiredWork / requiredWork;
    let affordableFraction = desiredFraction;
    const fullWageCost = requiredWork / Math.max(0.001, productivity) * type.wagePerWorkerWeek;
    const fullSupplyCost = Object.entries(requiredMaterials).reduce((sum, [resource, total]) =>
      sum + total * localPrice(region, resource), 0);
    const fullCost = fullWageCost + fullSupplyCost;
    if (fullCost > 0) affordableFraction = Math.min(affordableFraction, Math.max(0, region.treasury || 0) / fullCost);
    for (const [resource, total] of Object.entries(requiredMaterials)) {
      affordableFraction = Math.min(affordableFraction, Math.max(0, region.stockpile?.[resource] || 0) / total);
    }
    const work = Math.min(remainingWork, requiredWork * Math.max(0, affordableFraction));
    const workerWeeksUsed = Math.min(desiredWorkerWeeks, work / Math.max(0.001, productivity));
    const actualWorkers = Math.min(workers, workerWeeksUsed / weekScale);
    const fraction = work / requiredWork;
    const wages = workerWeeksUsed * type.wagePerWorkerWeek;
    let supplies = 0;
    for (const [resource, total] of Object.entries(requiredMaterials)) {
      const used = Math.min(region.stockpile[resource] || 0, total * fraction);
      supplies += used * localPrice(region, resource);
      region.stockpile[resource] = Math.max(0, (region.stockpile[resource] || 0) - used);
      project.materialsUsed[resource] = (project.materialsUsed[resource] || 0) + used;
    }
    const publicSpend = Math.min(region.treasury || 0, wages + supplies);
    region.treasury = Math.max(0, (region.treasury || 0) - publicSpend);
    region.wallet = Math.max(0, (region.wallet || 0) + publicSpend);
    project.workDone += work; project.wagesPaid += wages; project.suppliesPaid += supplies; project.workersThisWeek = Math.round(actualWorkers);
    project.stalledReason = work > 0 ? null : workers <= 0 ? 'No labour is available'
      : (region.treasury || 0) <= 0 ? 'The treasury cannot meet wages' : 'Required materials are unavailable';
    state.lastWeek = { projectId: project.id, workers: project.workersThisWeek, localWorkers: Math.round(state.localWorkersReserved ?? project.workersThisWeek), importedWorkers: Math.round(state.importedWorkersReserved || 0), productivity, work, wages, supplies, stalledReason: project.stalledReason };
    if (project.workDone >= requiredWork - 0.001) events.push(completeProject(region, project, type, currentTick));
  }
  return events;
}

export function hillFortDefenceMultiplier(region) {
  const forts = effectiveInfrastructureCount(region, 'hill_fort');
  return 1 + Math.min(0.45, forts * 0.22);
}

// Centralised, condition-scaled bonuses keep every subsystem consistent: a
// half-ruined road, wall or canal cannot provide its full paper benefit.
export function infrastructureBonus(region, typeId, fullBonus) {
  return Math.min(fullBonus, effectiveInfrastructureCount(region, typeId) * fullBonus);
}

export function settlementDefenceMultiplier(region) {
  return 1 + infrastructureBonus(region, 'watchtowers', 0.12) +
    infrastructureBonus(region, 'settlement_walls', 0.38);
}

export function overlandInfrastructureMultiplier(region) {
  return 1 + infrastructureBonus(region, 'road_network', 0.3) +
    infrastructureBonus(region, 'canal', 0.12) +
    infrastructureBonus(region, 'relay_stations', 0.08);
}

function availableWorkers(region) {
  return Math.max(0, (region.demographics?.workingAge || 0) - (region.army?.personnel || 0) -
    (region.navy?.personnel || 0) - (region.emergencyMilitiaPersonnel || 0));
}

export function assetEffectiveness(asset) {
  const condition = Math.max(0, Math.min(1, Number(asset?.condition) || 0));
  return condition <= 0.2 ? 0 : Math.min(1, (condition - 0.2) / 0.6);
}

function monumentalAssetSignal(asset, type, key) {
  const effect = assetEffectiveness(asset);
  const scaleSignal = Math.pow(Math.max(0.5, Number(asset.scale) || 1), 0.7);
  return (type.prestige?.[key] || 0) * effect * scaleSignal;
}

// Monumental projects are not Civ-style global uniques. Their effects are
// entirely social and condition-scaled. Multiple tombs or temples can coexist;
// repeated examples of the same form have diminishing signalling value rather
// than being prohibited. Large projects remain more impressive, but prestige
// rises sub-linearly with physical scale so four times the material never means
// four times the political authority.
export function monumentalPrestige(region) {
  const assets = ensureConstruction(region).assets.filter((asset) => CONSTRUCTION_TYPES[asset.typeId]?.monumental);
  const profile = { authority: 0, religious: 0, foreign: 0, legacy: 0, tourismPotential: 0, count: assets.length };
  const seen = new Map();
  for (const asset of assets) {
    const type = CONSTRUCTION_TYPES[asset.typeId];
    const previous = seen.get(type.id) || 0;
    const repetition = 1 / Math.sqrt(1 + previous * 0.75);
    seen.set(type.id, previous + 1);
    for (const key of ['authority', 'religious', 'foreign', 'legacy', 'tourismPotential']) {
      profile[key] += monumentalAssetSignal(asset, type, key) * repetition;
    }
  }
  return profile;
}

export function religiousMonumentPrestige(region) {
  const byReligion = {};
  for (const asset of ensureConstruction(region).assets) {
    const type = CONSTRUCTION_TYPES[asset.typeId];
    if (!type?.monumental || !asset.dedicatedReligionId) continue;
    const value = monumentalAssetSignal(asset, type, 'religious');
    byReligion[asset.dedicatedReligionId] = (byReligion[asset.dedicatedReligionId] || 0) + value;
  }
  return byReligion;
}

export function effectiveInfrastructureCount(region, typeId) {
  return ensureConstruction(region).assets.filter((asset) => asset.typeId === typeId)
    .reduce((sum, asset) => sum + assetEffectiveness(asset), 0);
}

export function operationalInfrastructure(region, typeId) {
  return effectiveInfrastructureCount(region, typeId) >= 0.5;
}

export function startRepair(region, assetId, requestedWorkers, currentTick) {
  const state = ensureConstruction(region);
  const asset = state.assets.find((item) => item.id === assetId);
  const type = asset && CONSTRUCTION_TYPES[asset.typeId];
  if (!asset || !type || asset.condition >= 0.999 || state.projects.some((item) => item.status === 'active')) return null;
  const damage = 1 - asset.condition;
  const workers = Math.round(clamp(Number(requestedWorkers) || type.defaultWorkers, type.minWorkers, type.maxWorkers));
  const scale = Number(asset.scale) || 1;
  const project = {
    id: nextProjectId++, typeId: type.id, kind: 'repair', repairAssetId: asset.id, status: 'active',
    startedTick: currentTick, targetWorkers: workers, workersThisWeek: 0, workDone: 0,
    workRequired: Math.max(type.minWorkers, type.workRequired * scale * damage * 0.6),
    materialsRequired: Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * scale * damage * 0.7])),
    materialsUsed: Object.fromEntries(Object.keys(type.materials).map((key) => [key, 0])),
    wagesPaid: 0, suppliesPaid: 0, stalledReason: null, completedTick: null,
  };
  state.projects.push(project);
  return project;
}

export function tickInfrastructureMaintenance(regions, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  for (const region of regions) {
    const state = ensureConstruction(region);
    let workers = state.maintenanceWorkersReserved || 0;
    for (const asset of state.assets) {
      const type = CONSTRUCTION_TYPES[asset.typeId];
      if (!type) continue;
      const scale = Number(asset.scale) || 1;
      const rate = type.maintenanceRate || 0.02;
      const workerNeed = type.workRequired * scale * rate / 52 / 20;
      const workerRatio = Math.min(1, workers / Math.max(0.001, workerNeed));
      const materialNeeds = Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * scale * rate / 52 * weekScale]));
      let materialRatio = 1;
      let cost = workerNeed * type.wagePerWorkerWeek * weekScale;
      for (const [resource, amount] of Object.entries(materialNeeds)) {
        materialRatio = Math.min(materialRatio, (region.stockpile?.[resource] || 0) / Math.max(0.001, amount));
        cost += amount * localPrice(region, resource);
      }
      const moneyRatio = Math.min(1, (region.treasury || 0) / Math.max(0.001, cost));
      const ratio = Math.max(0, Math.min(workerRatio, materialRatio, moneyRatio));
      workers = Math.max(0, workers - workerNeed * ratio);
      for (const [resource, amount] of Object.entries(materialNeeds)) region.stockpile[resource] = Math.max(0, (region.stockpile[resource] || 0) - amount * ratio);
      const paid = cost * ratio; region.treasury = Math.max(0, region.treasury - paid); region.wallet = Math.max(0, (region.wallet || 0) + paid);
      asset.condition = clamp(asset.condition + ratio * 0.00015 * weekScale - (1 - ratio) * 0.002 * weekScale, 0, 1);
      asset.maintenanceRatio = ratio;
    }
    region.monumentalPrestige = monumentalPrestige(region);
    region.religiousMonumentPrestige = religiousMonumentPrestige(region);
  }
}

export function chooseAiConstruction(region, currentTick, rng = Math.random) {
  const state = ensureConstruction(region);
  if (state.projects.some((project) => project.status === 'active')) return null;
  const damaged = state.assets.filter((asset) => asset.condition < 0.75).sort((a, b) => a.condition - b.condition)[0];
  if (damaged && (region.treasury || 0) >= 5 && rng() < 0.01) {
    return startRepair(region, damaged.id, CONSTRUCTION_TYPES[damaged.typeId]?.defaultWorkers || 50, currentTick);
  }
  if (region.isCoastal && effectiveInfrastructureCount(region, 'harbour') < 0.5 &&
      Object.values(region.navalProcurement?.targets || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) + (region.targetFishingBoats || 0) >= 5 &&
      (region.stockpile?.stone || 0) >= 400 && (region.stockpile?.wood || 0) >= 300 && rng() < 0.002) {
    return startConstruction(region, 'harbour', 100, currentTick);
  }
  if (region.isCoastal && region.unlockedTechIds.has('advanced_boatbuilding') &&
      operationalInfrastructure(region, 'harbour') && !operationalInfrastructure(region, 'shipyard') &&
      (region.stockpile?.stone || 0) >= 175 && (region.stockpile?.wood || 0) >= 450 && rng() < 0.003) {
    return startConstruction(region, 'shipyard', 80, currentTick);
  }
  const granaries = Math.max(0, region.infrastructure?.publicGranaries || 0);
  const potteryCoverage = (region.stockpile?.pottery || 0) / Math.max(1, region.population * 0.6);
  const granaryReady = (region.stockpile?.stone || 0) >= 125 && (region.stockpile?.wood || 0) >= 150 &&
    (region.stockpile?.pottery || 0) >= 100 && (region.treasury || 0) >= 5;
  if (granaries < 3 && potteryCoverage >= 0.15 && granaryReady && rng() < 0.002) {
    const workers = Math.min(100, Math.max(15, Math.round((region.demographics?.workingAge || 0) * 0.01)));
    return startConstruction(region, 'public_granary', workers, currentTick);
  }
  const available = new Set(availableConstructionTypes(region).map((type) => type.id));
  if (rng() < 0.004 && (region.treasury || 0) >= 5) {
    const urbanPressure = (region.urbanisation?.urbanPopulation || 0) / Math.max(1, region.urbanisation?.urbanCapacity || 1);
    const candidates = [
      ['wells_cisterns', (region.weather?.yieldMultiplier || 1) < 0.9 ? 8 : 3],
      ['irrigation', (region.report?.foodPlan?.shortfall || 0) > 0 ? 9 : 4],
      ['aqueduct', urbanPressure > 0.82 ? 10 : 4],
      ['urban_drainage', urbanPressure > 0.88 ? 9 : 3],
      ['road_network', (region.tradeEconomy?.weeklyExports || 0) > 20 ? 7 : 2],
      ['relay_stations', (region.population || 0) > 18000 ? 7 : 3],
      ['market_customs', (region.tradeEconomy?.weeklyExports || 0) > 30 ? 8 : 2],
      ['mint', (region.stockpile?.silver || 0) > 10 ? 8 : 3],
      ['state_quarry', (region.stockpile?.stone || 0) < 800 ? 6 : 2],
      ['deep_mine', 4], ['mine_drainage', 3],
      ['watchtowers', (region.safetyRating || 1) < 0.75 ? 9 : 2],
      ['settlement_walls', (region.conflictPressure || 0) > 0 ? 10 : 3],
      ['royal_arsenal', (region.army?.personnel || 0) > 250 ? 6 : 2],
      ['drill_ground', (region.army?.personnel || 0) > 500 ? 7 : 3],
      ['naval_base', (region.navy?.boats || 0) > 8 ? 7 : 2],
      ['coastal_fortifications', region.isCoastal && (region.adjacentSeaIds || []).length >= 2 ? 8 : 1],
      ['administrative_centre', (region.population || 0) > 12000 ? 6 : 2],
      ['canal', (region.population || 0) > 20000 ? 5 : 1],
      ['monumental_tomb', (region.population || 0) > 25000 && (region.stability || 0) > 0.7 ? 3 : 0],
      ['great_temple', (region.population || 0) > 22000 && (region.religion?.stateReligionId || null) ? 4 : 1],
      ['ceremonial_complex', (region.population || 0) > 18000 && (region.stability || 0) > 0.65 ? 3 : 1],
      ['monumental_statue', (region.population || 0) > 15000 && (region.tradeEconomy?.weeklyExports || 0) > 80 ? 2 : 1],
    ].filter(([id, score]) => score > 0 && available.has(id)).sort((a, b) => b[1] - a[1]);
    const chosen = candidates.find(([id]) => Object.entries(CONSTRUCTION_TYPES[id].materials)
      .every(([resource, amount]) => (region.stockpile?.[resource] || 0) >= amount * 0.5));
    if (chosen) {
      const type = CONSTRUCTION_TYPES[chosen[0]];
      // Wealthier AI states occasionally commission unusually ambitious
      // monuments. Because scale also raises material and maintenance burdens,
      // this is a genuine long-run choice rather than a free prestige roll.
      const ambition = type.monumental && (region.treasury || 0) > 50
        ? 0.8 + Math.min(1.4, Math.log10((region.treasury || 0) + 1) * 0.35) * rng()
        : 1;
      return startConstruction(region, chosen[0], type.defaultWorkers * ambition, currentTick);
    }
  }
  if (!region.unlockedTechIds.has(HILL_FORT_TECH_ID) || rng() > 0.003) return null;
  const threatened = (region.safetyRating || 0) < 0.72 || (region.conflictPressure || 0) > 0;
  const materialsReady = (region.stockpile?.stone || 0) >= 300 && (region.stockpile?.wood || 0) >= 75;
  if (!threatened || !materialsReady || (region.treasury || 0) < 5) return null;
  const workers = Math.min(200, Math.max(25, Math.round((region.demographics?.workingAge || 0) * 0.02)));
  return startConstruction(region, 'hill_fort', workers, currentTick);
}
