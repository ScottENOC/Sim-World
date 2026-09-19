import assert from 'node:assert/strict';
import {
  ensureDeployedBase, deployedBaseElectricalDemand, deployedBaseCapabilityProfile, inferDeployedBaseServices,
  installFieldDieselGenerators, tickDeployedBasePower,
} from '../js/military/militaryElectronics.js';
import { ensureIndustrialPlantState, addProductionLine, tickIndustrialPlants } from '../js/economy/industrialPlant.js';

function industrialRegion(id='industrial'){
  return {
    id,population:500000,treasury:1000,
    unlockedTechIds:new Set(['steelmaking','advanced_factories','electrical_generation','industrial_electrification','petroleum_refining','radar']),
    stockpile:{steel:1000,diesel:10,copper:100,electronic_components:100,industrial_polymers:100,packaged_chips:100},
    construction:{assets:[{typeId:'factory',condition:1,scale:1}]},
    industrialProduction:{factorySophistication:.75},
    industrialSupply:{capability:{precision_machining:.84},inventory:{machine_components:1000}},
    electricity:{industrialService:.86,reliability:.92},telephone:{service:.7,militaryCoordination:.8},
    industrialPlants:{lines:[],componentInventory:{},componentCapability:{engine:.84,transmission:.82,tracked_running_gear:.82,wheeled_chassis:.75,gun_system:.82,armour_plate:.8,optics:.82,electronics:.84,hull_fabrication:.82,aircraft_engine:.8,airframe:.78,wing_design:.78,aircraft_weapon:.76,radio_navigation:.76,radar_set:.74},productExperience:{tank:.68,fighter:.6},nextLineId:1},
    computingIndustry:{design:{bestNodeNm:45,complexity:.78},experience:{chip_design:.72,packaging_test:.66,computer_assembly:.62}},
  };
}

// A headquarters predates electricity by millennia. It should not acquire a hidden power dependency.
const bronzeBase={id:'bronze-hq'};ensureDeployedBase(bronzeBase);
assert.equal(deployedBaseElectricalDemand(bronzeBase),0,'headquarters alone should require no electricity');
const bronze=tickDeployedBasePower(bronzeBase,{stockpile:{}},{weeks:1});
assert.equal(bronze.fieldPower.status,'no_power_required');
assert.equal(bronze.capability.commandMultiplier,1,'unpowered historical headquarters should retain baseline command capability');
assert.equal(bronze.capability.logisticsMultiplier,1,'pre-electric logistics should not be penalised for lacking electricity');

const modern=industrialRegion();
const base={id:'occupied-forward-base',services:inferDeployedBaseServices(modern)};
assert(deployedBaseElectricalDemand(base)>0,'modern attached services should create a real electrical load');
const unpowered=tickDeployedBasePower(base,modern,{gridAvailable:true,gridTrusted:false,weeks:1});
assert.equal(unpowered.fieldPower.status,'unpowered','an enemy grid should not automatically power an occupied base');
assert.equal(unpowered.capability.commandMultiplier,1,'powered-service bonuses should disappear gracefully rather than disabling the headquarters');
const built=installFieldDieselGenerators(base,modern,2);assert.equal(built.installed,2);
const dieselBefore=modern.stockpile.diesel;
const generated=tickDeployedBasePower(base,modern,{gridAvailable:true,gridTrusted:false,weeks:1});
assert(generated.capability.commandMultiplier>1,'generator power should activate available command-service benefits');
assert(generated.capability.maintenanceMultiplier>1,'powered workshops should improve maintenance');
assert(modern.stockpile.diesel<dieselBefore,'those benefits must consume the shared army diesel pool');
const trusted=tickDeployedBasePower(base,modern,{gridAvailable:true,gridTrusted:true,weeks:1});
assert.equal(trusted.fieldPower.status,'trusted_grid');

// Advanced military production must physically consume its embedded electronics/chips.
const plant=ensureIndustrialPlantState(modern);for(const key of Object.keys(plant.componentInventory))plant.componentInventory[key]=1000;
const line=addProductionLine(modern,{productId:'tank',capacityShare:1});modern.industrialOrders={tank:2};
modern.stockpile.packaged_chips=0;
tickIndustrialPlants(modern,7);
assert.equal(line.lastOutput,0,'a digitally equipped tank design should be blocked by a real chip shortage');
modern.stockpile.packaged_chips=10;modern.industrialOrders.tank=2;
const chipsBefore=modern.stockpile.packaged_chips,electronicsBefore=modern.stockpile.electronic_components;
tickIndustrialPlants(modern,7);
assert(line.lastOutput>0,'restoring chip supply should restore advanced tank production');
assert(modern.stockpile.packaged_chips<chipsBefore,'advanced tank production should consume packaged chips');
assert(modern.stockpile.electronic_components<electronicsBefore,'advanced tank production should consume electronic components');

console.log('deployed-base optional power and military electronics BOM regressions: ok');
