import assert from 'node:assert/strict';
import { FOREIGN_INVESTMENT_POLICIES, setForeignInvestmentPolicy } from '../js/economy/infrastructureInvestment.js';
import { PROCUREMENT_POLICIES, applyDomesticSupplierExperience, chooseInfrastructureSupplier, ensureIndustrialSupply, setInfrastructureProcurementPolicy } from '../js/economy/industrialSupply.js';
import { reviewNpcGovernmentEconomicPolicies } from '../js/economy/governmentEconomicPolicy.js';
import { planRailway, tickRailwayConstruction } from '../js/economy/railways.js';

function supplierRegion(id, polityId, capability, outputScale=1) {
  const region={id,polityId,population:100000,stability:1,stockpile:{coal:1000,iron:1000},structuralTransformation:{capability:{manufacture:capability},scaleMultipliers:{manufacture:1}},corporateCapital:{firms:[{id:`${id}-firm`,status:'active',sector:'manufacture',capitalIndex:20}]},industrialSupply:{capability:{steelmaking:capability,precision_machining:capability,locomotive_engineering:capability,rail_vehicle_manufacture:capability,railway_engineering:capability},outputCapacity:{steel:300*outputScale,machine_components:30*outputScale,steam_locomotive:8*outputScale,rail_stock:30*outputScale},inventory:{},exposure:{}}};
  ensureIndustrialSupply(region); return region;
}

const requirements={steel:260,machine_components:12,steam_locomotive:3,rail_stock:18};
const host={id:'host'};
const domestic=supplierRegion('domestic','host',.45,.55);
const foreign=supplierRegion('foreign','foreign-state',.95,1.5);
setForeignInvestmentPolicy(host,{strategic:FOREIGN_INVESTMENT_POLICIES.SCREENED});
setInfrastructureProcurementPolicy(host,PROCUREMENT_POLICIES.BEST_AVAILABLE);
let chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[domestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.2}],requirements,strategic:true});
assert.equal(chosen.region.id,'foreign','best available should use a substantially stronger accessible foreign supplier');
chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[domestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.8,atWar:true}],requirements,strategic:true});
assert.equal(chosen.region.id,'domestic','enemy suppliers must be excluded from strategic procurement even under best-available policy');

setForeignInvestmentPolicy(host,{strategic:FOREIGN_INVESTMENT_POLICIES.PARTNERS});
chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[domestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.8,partner:false}],requirements,strategic:true});
assert.equal(chosen.region.id,'domestic','partners-only strategic access should exclude non-partner tenders');
chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[domestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.8,partner:true}],requirements,strategic:true});
assert.equal(chosen.region.id,'foreign','partners-only access should retain partner tenders');

setForeignInvestmentPolicy(host,{strategic:FOREIGN_INVESTMENT_POLICIES.OPEN});
setInfrastructureProcurementPolicy(host,PROCUREMENT_POLICIES.PREFER_DOMESTIC);
const nearDomestic=supplierRegion('near-domestic','host',.8,1.1);
chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[nearDomestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.3}],requirements,strategic:true});
assert.equal(chosen.region.id,'near-domestic','prefer-domestic should retain a reasonably competitive domestic tender');
setInfrastructureProcurementPolicy(host,PROCUREMENT_POLICIES.DOMESTIC_ONLY);
chosen=chooseInfrastructureSupplier({polity:host,domesticRegions:[domestic],foreignOffers:[{region:foreign,polityId:'foreign-state',relation:.3}],requirements,strategic:true});
assert.equal(chosen.region.id,'domestic');

const exposureBefore=domestic.industrialSupply.exposure.railway_engineering;
const capabilityBefore=domestic.industrialSupply.capability.railway_engineering;
applyDomesticSupplierExperience(domestic,domestic,1);
assert.ok(domestic.industrialSupply.exposure.railway_engineering>exposureBefore,'domestic procurement should create learn-by-doing exposure');
assert.equal(domestic.industrialSupply.capability.railway_engineering,capabilityBefore,'practice should not instantly grant capability');

const weakPolity={id:'weak-host'}; setInfrastructureProcurementPolicy(weakPolity,PROCUREMENT_POLICIES.DOMESTIC_ONLY);
const weak=supplierRegion('weak','weak-host',.2,.3), weakEnd={id:'weak-end',polityId:'weak-host',population:50000,industrialSupply:{capability:{},outputCapacity:{},inventory:{},exposure:{}}};
const strongPolity={id:'strong-host'}; setInfrastructureProcurementPolicy(strongPolity,PROCUREMENT_POLICIES.DOMESTIC_ONLY);
const strong=supplierRegion('strong','strong-host',.95,1.4), strongEnd={id:'strong-end',polityId:'strong-host',population:50000,industrialSupply:{capability:{},outputCapacity:{},inventory:{},exposure:{}}};
const weakPlan=planRailway({polity:weakPolity,fromRegion:weak,toRegion:weakEnd,lengthKm:100,domesticRegions:[weak],foreignOffers:[]});
const strongPlan=planRailway({polity:strongPolity,fromRegion:strong,toRegion:strongEnd,lengthKm:100,domesticRegions:[strong],foreignOffers:[]});
assert.equal(weakPlan.feasible,true); assert.equal(strongPlan.feasible,true);
tickRailwayConstruction(weakPlan.line,[weak,weakEnd],weak,365.2425);
tickRailwayConstruction(strongPlan.line,[strong,strongEnd],strong,365.2425);
assert.ok(strongPlan.line.progress>weakPlan.line.progress,'domestic-only projects should be slower when domestic engineering capability is weak rather than receiving a generic penalty');
assert.ok(weak.industrialSupply.exposure.railway_engineering>exposureBefore,'weak domestic construction should accumulate engineering practice while building');

const player={id:'player',procurementPolicy:{infrastructure:PROCUREMENT_POLICIES.DOMESTIC_ONLY},foreignInvestmentPolicy:{general:FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY,strategic:FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY}};
const playerRegion=supplierRegion('player-r','player',.2,.3); playerRegion.treasury=0;
const npc={id:'npc',atWarWith:['enemy']};
const npcRegion=supplierRegion('npc-r','npc',.25,.4); npcRegion.treasury=10;
reviewNpcGovernmentEconomicPolicies([playerRegion,npcRegion],[player,npc],'player');
assert.equal(player.procurementPolicy.infrastructure,PROCUREMENT_POLICIES.DOMESTIC_ONLY,'NPC review must never overwrite player procurement policy');
assert.equal(player.foreignInvestmentPolicy.strategic,FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY,'NPC review must never overwrite player investment policy');
assert.equal(npc.procurementPolicy.infrastructure,PROCUREMENT_POLICIES.DOMESTIC_ONLY,'a government at war should strongly favour domestic strategic procurement');
assert.equal(npc.foreignInvestmentPolicy.strategic,FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY,'a government at war should close strategic foreign investment');

console.log('Unified investment access, procurement, domestic learning and NPC policy regressions passed.');
