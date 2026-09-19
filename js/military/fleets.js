import { effectiveInfrastructureCount, operationalInfrastructure } from '../economy/construction.js?v=20260905-projects1';
import { activeAgreementBetween, attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { localPrice } from '../economy/prices.js?v=20260904-weather1';
import { maritimeSkillLevel, maritimeSkillMultiplier, recordMaritimePractice, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';
import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';
import { navalGunCombatProfile } from './earlyModernWarfare.js?v=20260913-early-modern1';
import { ensureFleetProvisioning, provisioningCombatMultiplier, serviceProvisioningInPort, shouldReturnForProvisioning, tickProvisioningAtSea } from './oceanicProvisioning.js?v=20260913-provisioning1';
import { MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID } from '../technology/industrialMarine.js?v=20260916-steam1';
import { DREADNOUGHT_TECH_ID, SUBMARINE_TECH_ID, tickLateIndustrialNavalWarfare } from './lateIndustrialNavy.js?v=20260918-navy1';
import { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, shipSensorMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';

export const FLEET_MISSIONS = Object.freeze({
  PORT: 'port',
  PATROL: 'patrol',
  BLOCKADE: 'blockade',
  PORT_ASSAULT: 'port_assault',
  RAID_SHIPPING: 'raid_shipping',
  LAY_MINES: 'lay_mines',
  SWEEP_MINES: 'sweep_mines',
  SUBMARINE_PATROL: 'submarine_patrol',
  SUBMARINE_RAID_SHIPPING: 'submarine_raid_shipping',
  ESCORT: 'escort',
  INTERCEPT: 'intercept',
  HIDE: 'hide',
  RETURN_REFIT: 'return_refit',
  TRANSIT: 'transit',
});

export const FLAG_MODES = Object.freeze({ OWN: 'own', NONE: 'none', FALSE: 'false' });

// Persistent ship classes span the whole simulation. They are capability-gated,
// not date-gated: a region has to accumulate the boatbuilding, navigation,
// gunnery, steam and metallurgical capability needed to construct/refit them.
export const SHIP_DESIGNS = Object.freeze({
  basic_war_boat: {
    id: 'basic_war_boat', label: 'war boat', tier: 0, advanced: false, propulsion: 'oar_sail', crew: 8, speed: 1.0,
    combat: 1.0, durability: 1.0, pursuit: 1.0, captureResistance: 0.75, gunCapacity: 1, armour: 0,
  },
  galley: {
    id: 'galley', label: 'galley', tier: 1, advanced: true, propulsion: 'oar', crew: 18, speed: 1.24,
    combat: 1.55, durability: 1.22, pursuit: 1.18, captureResistance: 0.86, gunCapacity: 2, armour: 0,
    refitCost: { wood: 60, pitch: 4, textiles: 3, metal: 1 },
  },
  ocean_sailing_warship: {
    id: 'ocean_sailing_warship', label: 'ocean-going sailing warship', tier: 2, advanced: true, propulsion: 'sail', crew: 20, speed: 1.34,
    combat: 1.75, durability: 1.32, pursuit: 1.20, captureResistance: 0.90, gunCapacity: 3, armour: 0,
    refitCost: { wood: 100, pitch: 8, textiles: 8, metal: 2 },
  },
  gunpowder_sailing_warship: {
    id: 'gunpowder_sailing_warship', label: 'armed sailing warship', tier: 3, advanced: true, propulsion: 'sail', crew: 24, speed: 1.30,
    combat: 2.05, durability: 1.42, pursuit: 1.14, captureResistance: 0.93, gunCapacity: 6, armour: 0.05,
    refitCost: { wood: 120, pitch: 8, textiles: 10, metal: 4, gunpowder: 0.5 },
  },
  frigate: {
    id: 'frigate', label: 'frigate', tier: 4, advanced: true, propulsion: 'sail', crew: 30, speed: 1.52,
    combat: 2.45, durability: 1.52, pursuit: 1.42, captureResistance: 0.96, gunCapacity: 10, armour: 0.08,
    refitCost: { wood: 180, pitch: 12, textiles: 14, metal: 8, gunpowder: 1 },
  },
  ship_of_line: {
    id: 'ship_of_line', label: 'ship of the line', tier: 4, advanced: true, propulsion: 'sail', crew: 48, speed: 1.20,
    combat: 3.35, durability: 1.90, pursuit: 0.92, captureResistance: 1.05, gunCapacity: 18, armour: 0.12,
    refitCost: { wood: 280, pitch: 18, textiles: 18, metal: 16, gunpowder: 2 },
  },
  paddle_steam_warship: {
    id: 'paddle_steam_warship', label: 'paddle steam warship', tier: 5, advanced: true, propulsion: 'steam', crew: 34, speed: 1.62,
    fallbackSpeed: 0.82, combat: 2.75, durability: 1.62, pursuit: 1.48, captureResistance: 0.98, gunCapacity: 11, armour: 0.10,
    coalCapacity: 18, coalPerWeek: 1.5, refitCost: { wood: 160, iron: 12, coal: 10, machine: 4 },
  },
  steam_frigate: {
    id: 'steam_frigate', label: 'screw steam frigate', tier: 6, advanced: true, propulsion: 'steam', crew: 36, speed: 1.82,
    fallbackSpeed: 0.88, combat: 3.15, durability: 1.75, pursuit: 1.65, captureResistance: 1.0, gunCapacity: 13, armour: 0.14,
    coalCapacity: 24, coalPerWeek: 1.8, refitCost: { wood: 140, iron: 18, coal: 12, machine: 6 },
  },
  ironclad: {
    id: 'ironclad', label: 'ironclad', tier: 7, advanced: true, propulsion: 'steam', crew: 40, speed: 1.55,
    fallbackSpeed: 0.48, combat: 3.55, durability: 2.65, pursuit: 1.18, captureResistance: 1.18, gunCapacity: 14, armour: 1.0,
    coalCapacity: 30, coalPerWeek: 2.2, refitCost: { wood: 80, iron: 40, coal: 14, machine: 8 },
  },
  steel_warship: {
    id: 'steel_warship', label: 'steel steam warship', tier: 8, advanced: true, propulsion: 'steam', crew: 42, speed: 1.72,
    fallbackSpeed: 0.38, combat: 4.10, durability: 3.05, pursuit: 1.30, captureResistance: 1.24, gunCapacity: 16, armour: 1.25,
    coalCapacity: 36, coalPerWeek: 2.5, refitCost: { wood: 40, steel: 55, coal: 16, machine: 10 },
  },
  destroyer: {
    id: 'destroyer', label: 'destroyer', tier: 9, advanced: true, propulsion: 'steam', crew: 30, speed: 2.25,
    fallbackSpeed: 0.42, combat: 3.55, durability: 2.20, pursuit: 2.10, captureResistance: 1.12, gunCapacity: 9, armour: 0.55,
    coalCapacity: 28, coalPerWeek: 2.6, refitCost: { steel: 38, coal: 12, machine: 11, gunpowder: 1 },
  },
  fleet_tug: {
    id: 'fleet_tug', label: 'fleet salvage tug', tier: 6, advanced: true, support: true, propulsion: 'steam', crew: 18, speed: 1.48,
    fallbackSpeed: 0.34, combat: 0.18, durability: 1.65, pursuit: 0.70, captureResistance: 0.88, gunCapacity: 1, armour: 0.08,
    coalCapacity: 20, coalPerWeek: 1.45, salvageCapacity: 1.0, towPower: 1.0, refitCost: { wood: 35, iron: 18, coal: 8, machine: 9 },
  },
  submarine: {
    id: 'submarine', label: 'submarine', tier: 9, advanced: true, propulsion: 'submersible', crew: 18, speed: 1.08,
    combat: 0.62, durability: 0.78, pursuit: 0.72, captureResistance: 1.30, gunCapacity: 0, armour: 0.18, submersible: true,
    refitCost: { steel: 24, machine: 12, petrol: 8 },
  },
  dreadnought: {
    id: 'dreadnought', label: 'dreadnought', tier: 10, advanced: true, propulsion: 'steam', crew: 80, speed: 1.68,
    fallbackSpeed: 0.30, combat: 7.20, durability: 5.20, pursuit: 1.18, captureResistance: 1.55, gunCapacity: 30, armour: 2.45,
    coalCapacity: 70, coalPerWeek: 4.8, refitCost: { steel: 125, coal: 30, machine: 28, gunpowder: 4 },
  },
  // Save compatibility only. New construction no longer creates the old catch-all.
  advanced_warship: {
    id: 'advanced_warship', label: 'legacy advanced warship', tier: 1, advanced: true, propulsion: 'oar_sail', crew: 12, speed: 1.28,
    combat: 1.55, durability: 1.30, pursuit: 1.20, captureResistance: 0.90, gunCapacity: 2, armour: 0,
  },
});

const SEARCH_MISSIONS = new Set([
  FLEET_MISSIONS.PATROL, FLEET_MISSIONS.BLOCKADE, FLEET_MISSIONS.RAID_SHIPPING,
  FLEET_MISSIONS.ESCORT, FLEET_MISSIONS.INTERCEPT,
]);
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;
let nextFleetId = 1;
let nextShipId = 1;
let nextEncounterId = 1;

function romanMark(n){const t=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let x=Math.max(1,Math.floor(n)),o='';for(const[v,s]of t)while(x>=v){o+=s;x-=v;}return o;}
function navalFrontier(region,designId){
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
export function currentNavalDesign(region,designId){
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
function designOf(ship) { return ship?.designStats || SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }
function isSubmarineFleet(fleet) { return (fleet?.ships?.length || 0) > 0 && fleet.ships.every((ship) => ship.designId === 'submarine'); }
function fleetDestroyerCount(fleet) { return (fleet?.ships || []).filter((ship) => ship.designId === 'destroyer').length; }
function shipLabel(ship) { return ship?.classLabel || designOf(ship).label; }
function isAdvancedShip(ship) { return Boolean(designOf(ship).advanced); }
function shipTier(ship) { return designOf(ship).tier || 0; }

export function preferredWarshipDesign(region, serial = 0) {
  const tech = region?.unlockedTechIds;
  if (tech?.has(DREADNOUGHT_TECH_ID)) return 'dreadnought';
  if (tech?.has(STEEL_HULL_TECH_ID)) return 'steel_warship';
  if (tech?.has(IRON_HULL_TECH_ID)) return 'ironclad';
  if (tech?.has(SCREW_PROPULSION_TECH_ID)) return 'steam_frigate';
  if (tech?.has(MARINE_STEAM_TECH_ID)) return 'paddle_steam_warship';
  if (tech?.has('gunpowder') && tech?.has('ocean_sailing')) {
    const readiness = clamp(region.earlyModernMilitary?.naval?.readiness || 0);
    const heavyFleet = region.militaryPolicy?.navalPriority === 'war' && readiness >= 0.60 && operationalInfrastructure(region, 'naval_base');
    if (heavyFleet && serial % 3 === 0) return 'ship_of_line';
    if (readiness >= 0.30 && operationalInfrastructure(region, 'shipyard')) return 'frigate';
    return 'gunpowder_sailing_warship';
  }
  if (tech?.has('ocean_sailing')) return 'ocean_sailing_warship';
  if (tech?.has('advanced_boatbuilding')) return 'galley';
  return 'basic_war_boat';
}

export function desiredWarshipComposition(region, total = region?.targetNavySize || 0) {
  const count = Math.max(0, Math.round(total || 0));
  const targets = {};
  const late = region?.unlockedTechIds?.has(DREADNOUGHT_TECH_ID);
  const submarines = region?.unlockedTechIds?.has(SUBMARINE_TECH_ID);
  for (let i = 0; i < count; i++) {
    let id;
    if (late) {
      if (submarines && i % 5 === 4) id = 'submarine';
      else if (i % 3 === 2) id = 'destroyer';
      else if (i % 4 === 0) id = 'dreadnought';
      else id = 'steel_warship';
    } else id = preferredWarshipDesign(region, i);
    targets[id] = (targets[id] || 0) + 1;
  }
  if (region?.unlockedTechIds?.has(MARINE_STEAM_TECH_ID) && count >= 4) targets.fleet_tug = Math.max(targets.fleet_tug || 0, Math.ceil(count / 8));
  return targets;
}

export function ensureNavalProcurement(region) {
  region.navalProcurement ||= { targets: {}, built: {}, lastDecisionTick: null };
  region.navalProcurement.targets ||= {};
  region.navalProcurement.built ||= {};
  return region.navalProcurement;
}

export function refreshNavalProcurementTargets(region, currentTick = null) {
  const procurement = ensureNavalProcurement(region);
  procurement.targets = desiredWarshipComposition(region);
  procurement.lastDecisionTick = currentTick;
  return procurement.targets;
}

function targetCountForClass(region, designId) {
  return Math.max(0, Math.round(ensureNavalProcurement(region).targets?.[designId] || 0));
}

function actualClassCounts(fleets) {
  const counts = {};
  for (const fleet of fleets) for (const ship of fleet.ships || []) counts[ship.designId] = (counts[ship.designId] || 0) + 1;
  return counts;
}

function makeShip(designId, ownerRegionOrId, overrides = {}) {
  const region=typeof ownerRegionOrId==='object'?ownerRegionOrId:null,ownerRegionId=region?.id||ownerRegionOrId;
  const spec = SHIP_DESIGNS[designId] || SHIP_DESIGNS.basic_war_boat;
  const generation=region?ensureCurrentNavalDesign(region,spec.id):null;
  return initialiseShipDamage({
    id: `ship-${nextShipId++}`,
    designId: spec.id,
    navalDesignId:generation?.id||null,modelSequence:generation?.sequence||1,modelName:generation?.name||spec.label,designStats:generation?.stats?{...generation.stats}:null,
    classLabel: spec.label,
    condition: 1,
    prize: false,
    capturedFromActorId: null,
    ownerRegionId,
    gunCapacity: spec.gunCapacity || 1,
    propulsion: spec.propulsion || 'oar_sail',
    armour: spec.armour || 0,
    ...overrides,
  });
}

function fleetCoalCapacity(fleet) {
  return (fleet.ships || []).reduce((sum, ship) => sum + Math.max(0, designOf(ship).coalCapacity || 0), 0);
}

function consumeFleetCoal(fleet, weeks) {
  const need = (fleet.ships || []).reduce((sum, ship) => sum + Math.max(0, designOf(ship).coalPerWeek || 0), 0) * Math.max(0, weeks);
  if (need <= 0) { fleet.steamFuelFraction = 1; return 0; }
  const used = Math.min(Math.max(0, fleet.coalBunker || 0), need);
  fleet.coalBunker = Math.max(0, (fleet.coalBunker || 0) - used);
  fleet.steamFuelFraction = clamp(used / need);
  return used;
}

function effectiveShipSpeed(ship, fleet) {
  const spec = designOf(ship), damage=shipPropulsionMultiplier(ship);
  if (!spec.coalPerWeek) return spec.speed * damage;
  const fuel = clamp(fleet.steamFuelFraction ?? 1);
  const fallback = spec.fallbackSpeed ?? spec.speed * 0.45;
  return (fallback + (spec.speed - fallback) * fuel) * damage;
}

function takeRefitMetal(region, amount, preferred = null) {
  if (amount <= 0) return true;
  const keys = preferred ? [preferred] : ['steel', 'iron', 'bronze'];
  if (keys.reduce((sum, key) => sum + Math.max(0, region.stockpile?.[key] || 0), 0) < amount) return false;
  let left = amount;
  for (const key of keys) {
    const take = Math.min(left, Math.max(0, region.stockpile?.[key] || 0));
    if (take > 0) region.stockpile[key] -= take;
    left -= take;
  }
  return left <= 1e-9;
}

function payRefitCost(region, designId) {
  const cost = SHIP_DESIGNS[designId]?.refitCost || {};
  const stock = region.stockpile || {};
  const inventory = region.industrialSupply?.inventory || {};
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'metal') {
      if (Math.max(0, stock.steel || 0) + Math.max(0, stock.iron || 0) + Math.max(0, stock.bronze || 0) < amount) return false;
    } else if (key === 'machine') {
      if (Math.max(0, inventory.machine_components || 0) < amount) return false;
    } else if (Math.max(0, stock[key] || 0) < amount) return false;
  }
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'metal') takeRefitMetal(region, amount);
    else if (key === 'machine') inventory.machine_components -= amount;
    else stock[key] -= amount;
  }
  return true;
}

function serviceNavalModelDiversity(region,fleets,weeks){
  const ships=fleets.flatMap(f=>f.ships||[]),byClass=new Map();for(const ship of ships){if(!ship.navalDesignId)continue;const set=byClass.get(ship.designId)||new Set();set.add(ship.navalDesignId);byClass.set(ship.designId,set);}
  const extra=[...byClass.values()].reduce((sum,set)=>sum+Math.max(0,set.size-1),0),procurement=ensureNavalProcurement(region);if(extra<=0){procurement.modelSupportReadiness=1;return 1;}
  region.industrialSupply ||= {};region.industrialSupply.inventory ||= {};region.stockpile ||= {};const inv=region.industrialSupply.inventory,industrial=ships.some(s=>(SHIP_DESIGNS[s.designId]?.tier||0)>=5);
  const machineNeed=industrial*ships.length*.012*extra*Math.max(0,weeks),materialNeed=ships.length*.018*extra*Math.max(0,weeks);let fraction=1;
  if(machineNeed>0)fraction=Math.min(fraction,(inv.machine_components||0)/machineNeed);
  const materialKey=industrial?'steel':'wood';fraction=Math.min(fraction,(region.stockpile[materialKey]||0)/Math.max(.0001,materialNeed));fraction=clamp(fraction);
  inv.machine_components=Math.max(0,(inv.machine_components||0)-machineNeed*fraction);region.stockpile[materialKey]=Math.max(0,(region.stockpile[materialKey]||0)-materialNeed*fraction);procurement.modelSupportReadiness=clamp(.6+.4*fraction);procurement.lastModelSupport={extraModels:extra,machineComponents:machineNeed*fraction,[materialKey]:materialNeed*fraction,readiness:procurement.modelSupportReadiness};return procurement.modelSupportReadiness;
}

function moderniseOwnedFleet(region, fleets, weeks, events) {
  if (!operationalInfrastructure(region, 'shipyard') && !operationalInfrastructure(region, 'naval_base')) return;
  for (const fleet of fleets) {
    if (fleet.locationType !== 'port' || fleet.portRegionId !== region.id) continue;
    fleet.refitProgress = Math.max(0, fleet.refitProgress || 0) + Math.max(0, weeks) * (operationalInfrastructure(region, 'naval_base') ? 0.06 : 0.035);
    if (fleet.refitProgress < 1) continue;
    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:currentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1));
    if(markCandidate&&payRefitCost(region,markCandidate.ship.designId)){const oldLabel=markCandidate.ship.modelName||shipLabel(markCandidate.ship),replacement=makeShip(markCandidate.ship.designId,region,{id:markCandidate.ship.id,prize:false,capturedFromActorId:null});fleet.ships[markCandidate.index]=replacement;fleet.refitProgress-=1;if(events)events.push({type:'fleet_ship_mark_refit',ownerRegionId:region.id,fleetId:fleet.id,shipId:replacement.id,fromClassLabel:oldLabel,toClassLabel:replacement.modelName||replacement.classLabel});continue;}
    const candidates = fleet.ships.map((ship, index) => ({ ship, index, target: preferredWarshipDesign(region, index) }))
      .filter(({ ship, target }) => !designOf(ship).support && isAdvancedShip(ship) && (SHIP_DESIGNS[target]?.tier || 0) > shipTier(ship))
      .sort((a, b) => shipTier(a.ship) - shipTier(b.ship));
    const choice = candidates[0];
    if (!choice || !payRefitCost(region, choice.target)) continue;
    const oldLabel = shipLabel(choice.ship);
    const replacement = makeShip(choice.target, region, { id: choice.ship.id, prize: false, capturedFromActorId: null });
    fleet.ships[choice.index] = replacement;
    fleet.refitProgress -= 1;
    if (events) events.push({ type: 'fleet_ship_modernised', ownerRegionId: region.id, fleetId: fleet.id,
      shipId: replacement.id, fromClassLabel: oldLabel, toClassLabel: replacement.classLabel });
  }
}

export function syncNextFleetIds(fleets = []) {
  const fleetNums = fleets.map((fleet) => Number(String(fleet.id || '').replace(/\D+/g, '')) || 0);
  const shipNums = fleets.flatMap((fleet) => fleet.ships || []).map((ship) => Number(String(ship.id || '').replace(/\D+/g, '')) || 0);
  nextFleetId = Math.max(1, ...fleetNums.map((v) => v + 1));
  nextShipId = Math.max(1, ...shipNums.map((v) => v + 1));
}

function ensureFleetState(fleet) {
  fleet.ships ||= [];
  fleet.mission ||= FLEET_MISSIONS.PORT;
  fleet.flag ||= { mode: FLAG_MODES.OWN, actorId: fleet.ownerActorId };
  fleet.supply = clamp(fleet.supply ?? 1);
  fleet.fatigue = clamp(fleet.fatigue ?? 0);
  fleet.morale = clamp(fleet.morale ?? 1);
  fleet.condition = clamp(fleet.condition ?? 1);
  fleet.lastContactTickByFleet ||= {};
  fleet.history ||= [];
  fleet.coalBunker = Math.max(0, Number(fleet.coalBunker) || 0);
  fleet.steamFuelFraction = clamp(fleet.steamFuelFraction ?? 1);
  for (const ship of fleet.ships) {
    const spec = designOf(ship);
    ship.classLabel ||= spec.label;
    ship.gunCapacity ||= spec.gunCapacity || 1;
    ship.propulsion ||= spec.propulsion || 'oar_sail';
    if (!Number.isFinite(ship.armour)) ship.armour = spec.armour || 0;
  }
  ensureFleetProvisioning(fleet);
  return fleet;
}

function createHomeFleet(region) {
  const total = Math.max(0, Math.round(region.navy?.boats || 0));
  if (total <= 0 || !(region.adjacentSeaIds || []).length) return null;
  const advanced = Math.min(total, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));
  const ships = [];
  for (let i = 0; i < advanced; i++) ships.push(makeShip(preferredWarshipDesign(region, i), region));
  for (let i = advanced; i < total; i++) ships.push(makeShip('basic_war_boat', region));
  const ownerActorId = actorId(region);
  return ensureFleetState({
    id: `fleet-${nextFleetId++}`,
    name: `${region.name} Fleet`,
    ownerRegionId: region.id,
    ownerActorId,
    homePortRegionId: region.id,
    locationType: 'port',
    portRegionId: region.id,
    seaRegionId: null,
    mission: FLEET_MISSIONS.PORT,
    missionTargetId: null,
    flag: { mode: FLAG_MODES.OWN, actorId: ownerActorId },
    ships,
    supply: 1,
    fatigue: 0,
    morale: 1,
    condition: 1,
    weeksAtSea: 0,
    createdFromLegacyNavy: true,
  });
}

export function initialiseFleets(regions, existing = []) {
  if (existing.length) {
    for (const fleet of existing) ensureFleetState(fleet);
    syncNextFleetIds(existing);
    return existing;
  }
  const fleets = [];
  for (const region of regions) {
    const fleet = createHomeFleet(region);
    if (fleet) fleets.push(fleet);
  }
  syncRegionalNavyLedger(regions, fleets);
  return fleets;
}

function fleetForNewShips(fleets, region) {
  return fleets.find((fleet) => fleet.ownerRegionId === region.id && fleet.locationType === 'port' && fleet.portRegionId === region.id)
    || fleets.find((fleet) => fleet.ownerRegionId === region.id)
    || null;
}

// Existing economy code still constructs vessels by changing region.navy.boats.
// Reconcile those newly built boats into persistent ship objects before fleet
// operations, then write the authoritative discrete fleet inventory back after.
export function reconcileFleetLedger(regions, fleets, events = null, weeks = 1) {
  const byOwner = new Map();
  for (const fleet of fleets) {
    ensureFleetState(fleet);
    if (!byOwner.has(fleet.ownerRegionId)) byOwner.set(fleet.ownerRegionId, []);
    byOwner.get(fleet.ownerRegionId).push(fleet);
  }
  for (const region of regions) {
    if (!(region.adjacentSeaIds || []).length) continue;
    const owned = byOwner.get(region.id) || [];
    tickNavalDesignPrograms(region,weeks);considerNpcNavalDesignReview(region,weeks);
    serviceNavalModelDiversity(region,owned,weeks);
    const procurement = ensureNavalProcurement(region);
    const explicitTargets = Object.values(procurement.targets || {}).reduce((sum, value) => sum + Math.max(0, Math.round(value || 0)), 0);
    const wantedTotal = explicitTargets > 0 ? explicitTargets : Math.max(0, Math.round(region.navy?.boats || 0));
    const wantedAdvanced = explicitTargets > 0
      ? Object.entries(procurement.targets).reduce((sum, [id, value]) => sum + (SHIP_DESIGNS[id]?.advanced ? Math.max(0, Math.round(value || 0)) : 0), 0)
      : Math.min(wantedTotal, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));

    // The old economy models wear fractionally. Once that fractional ledger
    // crosses an integer boundary, retire a real persistent ship and report
    // exactly which class was lost. Prefer already-damaged vessels.
    const all = () => owned.flatMap((fleet) => fleet.ships.map((ship) => ({ fleet, ship })));
    const retireOne = (predicate) => {
      const candidates = all().filter(({ ship }) => predicate(ship))
        .sort((a, b) => (a.ship.condition ?? 1) - (b.ship.condition ?? 1));
      const chosen = candidates[0];
      if (!chosen) return false;
      const index = chosen.fleet.ships.indexOf(chosen.ship);
      if (index >= 0) chosen.fleet.ships.splice(index, 1);
      if (events) events.push({ type: 'fleet_ship_worn_out', ownerRegionId: region.id,
        ownerActorId: actorId(region), fleetId: chosen.fleet.id, shipId: chosen.ship.id,
        shipClassLabel: shipLabel(chosen.ship) });
      return true;
    };

    let current = all();
    let actualAdvanced = current.filter(({ ship }) => isAdvancedShip(ship)).length;
    while (actualAdvanced > wantedAdvanced && retireOne((ship) => isAdvancedShip(ship))) actualAdvanced--;
    current = all();
    while (current.length > wantedTotal && retireOne(() => true)) current = all();

    current = all();
    const actualTotal = current.length;
    actualAdvanced = current.filter(({ ship }) => isAdvancedShip(ship)).length;
    let target = fleetForNewShips(fleets, region);
    if (!target && wantedTotal > 0) {
      target = createHomeFleet({ ...region, navy: { ...region.navy, boats: 0, advancedBoats: 0 } });
      if (target) { fleets.push(target); owned.push(target); }
    }
    if (!target) continue;
    if (explicitTargets > 0) {
      const classCounts = actualClassCounts(owned);
      for (const [designId, wanted] of Object.entries(procurement.targets)) {
        if (!SHIP_DESIGNS[designId]) continue;
        const actual = classCounts[designId] || 0;
        for (let i = actual; i < Math.max(0, Math.round(wanted || 0)); i++) target.ships.push(makeShip(designId, region));
      }
    } else {
      for (let i = actualAdvanced; i < wantedAdvanced; i++) target.ships.push(makeShip(preferredWarshipDesign(region, i), region.id));
      const basicActual = actualTotal - actualAdvanced;
      const basicWanted = wantedTotal - wantedAdvanced;
      for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
    }
    moderniseOwnedFleet(region, owned, weeks, events);
  }
  return fleets;
}

export function syncRegionalNavyLedger(regions, fleets) {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const counts = new Map();
  for (const fleet of fleets) {
    const entry = counts.get(fleet.ownerRegionId) || { total: 0, advanced: 0 };
    entry.total += fleet.ships.length;
    entry.advanced += fleet.ships.filter((ship) => isAdvancedShip(ship)).length;
    counts.set(fleet.ownerRegionId, entry);
  }
  for (const [regionId, entry] of counts.entries()) {
    const region = regionById.get(regionId);
    if (!region?.navy) continue;
    region.navy.boats = entry.total;
    region.navy.advancedBoats = entry.advanced;
  }
}

export function fleetShipCounts(fleet) {
  const counts = {};
  for (const ship of fleet?.ships || []) counts[shipLabel(ship)] = (counts[shipLabel(ship)] || 0) + 1;
  return counts;
}

export function setFleetMission(fleet, mission, options = {}) {
  if (!Object.values(FLEET_MISSIONS).includes(mission)) return false;
  ensureFleetState(fleet);
  fleet.mission = mission;
  fleet.missionTargetId = options.targetId || null;
  if (options.seaRegionId) {
    fleet.locationType = 'sea';
    fleet.seaRegionId = options.seaRegionId;
    fleet.portRegionId = null;
  }
  return true;
}

function knowsActor(region, actor, regionsById) {
  if (!region || !actor) return false;
  if (actorId(region) === actor) return true;
  if (region.knowledge?.knownSubjectIds?.has(actor) || region.knowledge?.directContactIds?.has(actor)) return true;
  for (const other of regionsById.values()) {
    if (actorId(other) === actor && (region.knowledge?.knownSubjectIds?.has(other.id) || region.knowledge?.directContactIds?.has(other.id))) return true;
  }
  return false;
}

export function setFleetFlag(fleet, mode, falseActorId, regionsById) {
  ensureFleetState(fleet);
  if (!Object.values(FLAG_MODES).includes(mode)) return { changed: false, reason: 'invalid_mode' };
  const owner = regionsById.get(fleet.ownerRegionId);
  if (mode === FLAG_MODES.FALSE) {
    if (!falseActorId || falseActorId === fleet.ownerActorId) return { changed: false, reason: 'invalid_false_flag' };
    if (!knowsActor(owner, falseActorId, regionsById)) return { changed: false, reason: 'unknown_flag' };
    fleet.flag = { mode, actorId: falseActorId };
  } else {
    fleet.flag = { mode, actorId: mode === FLAG_MODES.OWN ? fleet.ownerActorId : null };
  }
  return { changed: true, flag: { ...fleet.flag } };
}

function sameActor(a, b) { return a && b && a === b; }
export function portAccessLevel(fleet, portRegion, regionsById, agreements = []) {
  const owner = regionsById.get(fleet.ownerRegionId);
  if (!owner || !portRegion) return 'denied';
  const ownerActor = fleet.ownerActorId || actorId(owner);
  const portActor = actorId(portRegion);
  if (sameActor(ownerActor, portActor)) return portRegion.id === fleet.homePortRegionId ? 'home' : 'domestic';
  if (activeAgreementBetween(agreements, owner.id, portRegion.id, 'military_support')) return 'ally';
  return 'denied';
}

function payForAlliedFood(owner, port, amount) {
  const available = Math.max(0, port.stockpile?.food || 0);
  const quantity = Math.min(available, Math.max(0, amount));
  if (quantity <= 0) return 0;
  const price = Math.max(0.01, localPrice(port, 'food'));
  const cost = quantity * price;
  const treasury = Math.min(Math.max(0, owner.treasury || 0), cost);
  const wallet = Math.min(Math.max(0, owner.wallet || 0), cost - treasury);
  const paid = treasury + wallet;
  const purchased = quantity * (paid / Math.max(cost, 1e-9));
  owner.treasury -= treasury;
  owner.wallet -= wallet;
  port.treasury = Math.max(0, port.treasury || 0) + paid;
  port.stockpile.food = Math.max(0, available - purchased);
  return purchased;
}

function fleetCrewCount(fleet) {
  return (fleet.ships || []).reduce((sum, ship) => sum + designOf(ship).crew, 0);
}

function serviceInPort(fleet, regionsById, agreements, weeks) {
  const port = regionsById.get(fleet.portRegionId);
  const owner = regionsById.get(fleet.ownerRegionId);
  const access = portAccessLevel(fleet, port, regionsById, agreements);
  if (!port || !owner || access === 'denied') return { access, supplied: 0, repaired: 0 };
  const need = (1 - fleet.supply) * fleet.ships.length * 1.5;
  let supplied = 0;
  if (access === 'ally') supplied = payForAlliedFood(owner, port, need);
  else {
    supplied = Math.min(need, Math.max(0, owner.stockpile?.food || 0));
    owner.stockpile.food = Math.max(0, (owner.stockpile.food || 0) - supplied);
  }
  fleet.supply = clamp(fleet.supply + supplied / Math.max(1, fleet.ships.length * 1.5));
  fleet.fatigue = clamp(fleet.fatigue - weeks * (access === 'ally' ? 0.16 : 0.24));
  fleet.morale = clamp(fleet.morale + weeks * 0.06);

  let repairRate = 0;
  if (access !== 'ally') {
    repairRate = 0.006;
    if (operationalInfrastructure(port, 'harbour')) repairRate += 0.012;
    if (operationalInfrastructure(port, 'shipyard')) repairRate += 0.025;
    if (operationalInfrastructure(port, 'naval_base')) repairRate += 0.035;
  } else {
    // Allied docks provide anchorage, victuals, fresh water and shore leave,
    // but do not casually rebuild a foreign warship. Minor maintenance only.
    repairRate = 0.0015;
  }
  const before = fleet.condition;
  fleet.condition = clamp(fleet.condition + repairRate * weeks);
  for (const ship of fleet.ships) repairShipDamage(ship, repairRate * weeks, { dockyard: access !== 'ally' && (operationalInfrastructure(port, 'shipyard') || operationalInfrastructure(port, 'naval_base')) });
  const coalCapacity = fleetCoalCapacity(fleet);
  let coalLoaded = 0;
  if (coalCapacity > 0) {
    const coalNeed = Math.max(0, coalCapacity - (fleet.coalBunker || 0));
    const coalSource = access === 'ally' ? port : owner;
    coalLoaded = Math.min(coalNeed, Math.max(0, coalSource.stockpile?.coal || 0));
    if (coalLoaded > 0) {
      coalSource.stockpile.coal -= coalLoaded;
      fleet.coalBunker += coalLoaded;
      if (access === 'ally') {
        const price = Math.max(0.01, localPrice(port, 'coal'));
        const cost = coalLoaded * price;
        const treasury = Math.min(Math.max(0, owner.treasury || 0), cost);
        const wallet = Math.min(Math.max(0, owner.wallet || 0), cost - treasury);
        const paid = treasury + wallet;
        if (paid < cost) {
          const unpaid = coalLoaded * (1 - paid / Math.max(cost, 1e-9));
          coalSource.stockpile.coal += unpaid;
          fleet.coalBunker -= unpaid;
          coalLoaded -= unpaid;
        }
        owner.treasury -= treasury; owner.wallet -= wallet; port.treasury = Math.max(0, port.treasury || 0) + paid;
      }
    }
    fleet.steamFuelFraction = coalCapacity > 0 ? clamp(fleet.coalBunker / Math.max(1, coalCapacity)) : 1;
  }
  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));
  return { access, supplied, repaired: fleet.condition - before, provisioning, coalLoaded };
}

function wearAtSea(fleet, weeks) {
  const missionUse = fleet.mission === FLEET_MISSIONS.HIDE ? 0.7
    : fleet.mission === FLEET_MISSIONS.BLOCKADE || fleet.mission === FLEET_MISSIONS.PATROL ? 1.2 : 1;
  fleet.weeksAtSea = (fleet.weeksAtSea || 0) + weeks;
  fleet.supply = clamp(fleet.supply - 0.025 * weeks * missionUse);
  fleet.fatigue = clamp(fleet.fatigue + 0.018 * weeks * missionUse);
  fleet.condition = clamp(fleet.condition - 0.0015 * weeks * missionUse);
  fleet.morale = clamp(fleet.morale - Math.max(0, 0.55 - fleet.supply) * 0.015 * weeks);
  for (const ship of fleet.ships) tickShipDamageAtSea(ship, weeks);
}


function fleetAverageSpeed(fleet) {
  if (!fleet.ships.length) return 0;
  const harmonic = fleet.ships.length / fleet.ships.reduce((sum, ship) => sum + 1 / Math.max(0.2, effectiveShipSpeed(ship, fleet)), 0);
  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet) * fleetTowSpeedMultiplier(fleet);
}

function fleetCombatPower(fleet, regionsById, { inPort = false } = {}) {
  const origin = regionsById.get(fleet.ownerRegionId);
  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1) * shipCombatMultiplier(ship), 0);
  const skill = origin ? maritimeSkillMultiplier(origin, MARITIME_SKILLS.COMBAT) : 1;
  const readiness = (0.55 + fleet.supply * 0.25 + (1 - fleet.fatigue) * 0.12 + fleet.morale * 0.08);
  const modelSupport=clamp(origin?.navalProcurement?.modelSupportReadiness??1,.6,1);
  let power = shipPower * skill * readiness * provisioningCombatMultiplier(fleet) * modelSupport;
  if (inPort && fleet.portRegionId) {
    const port = regionsById.get(fleet.portRegionId);
    if (port) {
      power *= 1.75 + Math.min(1.6,
        effectiveInfrastructureCount(port, 'harbour') * 0.25 +
        effectiveInfrastructureCount(port, 'naval_base') * 0.35 +
        effectiveInfrastructureCount(port, 'coastal_fortifications') * 0.55 +
        effectiveInfrastructureCount(port, 'settlement_walls') * 0.25);
    }
  }
  return power;
}

function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const submarineBonus = isSubmarineFleet(fleet) ? 0.40 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  const signature=fleet.ships.length?fleet.ships.reduce((s,ship)=>s+clamp(designOf(ship).signature??.72,.18,1),0)/fleet.ships.length:.72;
  return clamp(0.42 + hideBonus + submarineBonus + (1-signature)*.14 - sizePenalty - activePenalty, 0.05, 0.97);
}

function visibleFlagActor(fleet) {
  if (fleet.flag?.mode === FLAG_MODES.NONE) return null;
  return fleet.flag?.actorId || fleet.ownerActorId;
}

function representativeRegionForActor(actor, regionsById) {
  for (const region of regionsById.values()) if (actorId(region) === actor) return region;
  return null;
}

function advancedShareForActor(actor, regionsById) {
  const regions = [...regionsById.values()].filter((region) => actorId(region) === actor);
  const total = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.boats || 0), 0);
  const advanced = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.advancedBoats || 0), 0);
  return total > 0 ? advanced / total : 0;
}

function fleetAdvancedShare(fleet) {
  return fleet.ships.length ? fleet.ships.filter((ship) => isAdvancedShip(ship)).length / fleet.ships.length : 0;
}

export function identifyFleet(observerFleet, targetFleet, regionsById, rng = Math.random) {
  const observerRegion = regionsById.get(observerFleet.ownerRegionId);
  const presentedActorId = visibleFlagActor(targetFleet);
  const ownActor = observerFleet.ownerActorId;
  const actualActor = targetFleet.ownerActorId;

  // A faction has a perfect registry of its own fleets. An outsider can fly
  // Essex's flag, but Essex immediately knows that the ships are impostors.
  const impersonatingObserver = presentedActorId && presentedActorId === ownActor && actualActor !== ownActor;
  if (actualActor === ownActor) {
    return { certainty: 1, actualActorId: ownActor, presentedActorId: ownActor, isOwnFleet: true,
      falseFlagDetected: targetFleet.flag?.mode === FLAG_MODES.FALSE, designMismatch: false };
  }

  const scouting = observerRegion ? maritimeSkillLevel(observerRegion, MARITIME_SKILLS.SCOUTING) : 0;
  const combat = observerRegion ? maritimeSkillLevel(observerRegion, MARITIME_SKILLS.COMBAT) : 0;
  let designMismatch = false;
  if (presentedActorId) {
    const expected = advancedShareForActor(presentedActorId, regionsById);
    designMismatch = Math.abs(expected - fleetAdvancedShare(targetFleet)) > (0.38 - scouting * 0.18);
  }

  if (impersonatingObserver) {
    return { certainty: 1, actualActorId: null, presentedActorId, isOwnFleet: false,
      falseFlagDetected: true, imposterOfObserver: true, designMismatch: true };
  }

  const recognitionChance = clamp(0.08 + scouting * 0.42 + combat * 0.16 + (designMismatch ? 0.18 : 0));
  const actualKnown = rng() < recognitionChance;
  return {
    certainty: actualKnown ? clamp(0.65 + scouting * 0.3) : presentedActorId ? 0.48 : 0.18,
    actualActorId: actualKnown ? actualActor : null,
    presentedActorId,
    isOwnFleet: false,
    falseFlagDetected: Boolean(actualKnown && targetFleet.flag?.mode === FLAG_MODES.FALSE) || designMismatch,
    imposterOfObserver: false,
    designMismatch,
  };
}

function detectionChance(observer, target, regionsById, weeks) {
  const origin = regionsById.get(observer.ownerRegionId);
  const scouting = origin ? maritimeSkillLevel(origin, MARITIME_SKILLS.SCOUTING) : 0;
  const searchMission = observer.mission === FLEET_MISSIONS.INTERCEPT ? 0.22
    : observer.mission === FLEET_MISSIONS.PATROL ? 0.16
      : observer.mission === FLEET_MISSIONS.BLOCKADE ? 0.13 : 0.08;
  const searchSize = Math.min(0.22, Math.log2(1 + observer.ships.length) * 0.045);
  const radarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).radarSearch||0)*shipSensorMultiplier(ship,'radar'),0)/observer.ships.length:0;
  const sonarSearch=observer.ships.length?observer.ships.reduce((s,ship)=>s+clamp(designOf(ship).sonar||0)*shipSensorMultiplier(ship,'sonar'),0)/observer.ships.length:0;
  const antiSubmarineSearch = isSubmarineFleet(target) ? fleetDestroyerCount(observer) * (0.055+sonarSearch*.085) : 0;
  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize + radarSearch*.18 + antiSubmarineSearch - targetConcealment(target) * 0.22, 0.01, 0.82);
  return 1 - Math.pow(1 - perWeek, Math.max(0.1, weeks));
}

function canSearch(fleet) {
  return fleet.locationType === 'sea' && !fleet.routeSeaIds?.length && SEARCH_MISSIONS.has(fleet.mission) && fleet.ships.length > 0;
}

export function orderFleetToSea(fleet, destinationSeaId, regionsById, seaRegionsById, postTransitMission = null) {
  if (!fleet?.ships?.length || !seaRegionsById.has(destinationSeaId)) return { ordered: false, reason: 'invalid_destination' };
  let starts = [];
  if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];
  else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];
  if (!starts.length) return { ordered: false, reason: 'no_sea_access' };
  const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [destinationSeaId] });
  if (!route?.seaIds?.length) return { ordered: false, reason: 'no_route' };
  fleet.locationType = 'sea';
  fleet.portRegionId = null;
  fleet.seaRegionId = route.seaIds[0];
  fleet.routeSeaIds = route.seaIds;
  fleet.routeIndex = 0;
  fleet.routeDestinationSeaId = destinationSeaId;
  fleet.transitProgressWeeks = 0;
  fleet.postTransitMission = postTransitMission || (fleet.mission === FLEET_MISSIONS.PORT ? FLEET_MISSIONS.PATROL : fleet.mission);
  fleet.mission = route.seaIds.length > 1 ? FLEET_MISSIONS.TRANSIT : fleet.postTransitMission;
  if (route.seaIds.length <= 1) { fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; }
  return { ordered: true, route: [...route.seaIds], passageIds: [...(route.passageIds || [])] };
}

function advanceFleetRoute(fleet, weeks) {
  if (fleet.locationType !== 'sea' || !fleet.routeSeaIds?.length || fleet.routeSeaIds.length <= 1) return false;
  fleet.transitProgressWeeks = (fleet.transitProgressWeeks || 0) + weeks;
  let moved = false;
  while (fleet.routeIndex < fleet.routeSeaIds.length - 1) {
    const hopWeeks = Math.max(0.45, 1.35 / Math.max(0.35, fleetAverageSpeed(fleet)));
    if (fleet.transitProgressWeeks < hopWeeks) break;
    fleet.transitProgressWeeks -= hopWeeks;
    fleet.routeIndex += 1;
    fleet.seaRegionId = fleet.routeSeaIds[fleet.routeIndex];
    moved = true;
  }
  if (fleet.routeIndex >= fleet.routeSeaIds.length - 1) {
    fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.transitProgressWeeks = 0;
    fleet.mission = fleet.postTransitMission || FLEET_MISSIONS.PATROL;
    fleet.postTransitMission = null;
  }
  return moved;
}

export function orderFleetHome(fleet, regionsById, seaRegionsById) {
  const home = regionsById.get(fleet.homePortRegionId);
  if (!home || !(home.adjacentSeaIds || []).length) return { ordered: false, reason: 'no_home_sea_access' };
  if (fleet.locationType === 'sea' && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) {
    fleet.mission = FLEET_MISSIONS.RETURN_REFIT;
    fleet.missionTargetId = null;
    return { ordered: true, alreadyAdjacent: true, route: [fleet.seaRegionId] };
  }
  let best = null;
  for (const seaId of home.adjacentSeaIds) {
    if (!seaRegionsById.has(seaId)) continue;
    let starts = [];
    if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];
    else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];
    const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [seaId] });
    if (!route?.seaIds?.length) continue;
    if (!best || route.seaIds.length < best.route.seaIds.length) best = { seaId, route };
  }
  if (!best) return { ordered: false, reason: 'no_route_home' };
  const result = orderFleetToSea(fleet, best.seaId, regionsById, seaRegionsById, FLEET_MISSIONS.RETURN_REFIT);
  if (result.ordered) fleet.missionTargetId = null;
  return result;
}

function pursuitScore(fleet, regionsById, rng) {
  const region = regionsById.get(fleet.ownerRegionId);
  const skill = region ? maritimeSkillMultiplier(region, MARITIME_SKILLS.SCOUTING) : 1;
  const combatSkill = region ? maritimeSkillMultiplier(region, MARITIME_SKILLS.COMBAT) : 1;
  const shipPursuit = fleet.ships.length
    ? fleet.ships.reduce((sum, ship) => sum + designOf(ship).pursuit, 0) / fleet.ships.length : 0;
  return fleetAverageSpeed(fleet) * shipPursuit * Math.sqrt(skill * combatSkill) * (0.82 + rng() * 0.36);
}

export function attemptPursuit(attacker, target, regionsById, rng = Math.random) {
  const attackerScore = pursuitScore(attacker, regionsById, rng);
  let targetScore = pursuitScore(target, regionsById, rng);
  if (target.mission === FLEET_MISSIONS.HIDE) targetScore *= 1.15;
  if (target.mission === FLEET_MISSIONS.BLOCKADE) targetScore *= 0.95;
  return { caught: attackerScore >= targetScore, attackerScore, targetScore };
}

function removeRandomShip(fleet, rng) {
  if (!fleet.ships.length) return null;
  const index = Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length));
  return fleet.ships.splice(index, 1)[0];
}

function damageRandomShip(fleet, amount, rng) {
  if (!fleet.ships.length) return null;
  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];
  applyShipHit(ship, amount, { rng });
  return ship;
}

function lossesForSide(fleet, enemyShare, rng, portProtected = false) {
  const results = { sunk: [], capturedCandidates: [], damaged: [], salvaged: [] };
  const durability = fleet.ships.length ? fleet.ships.reduce((sum, ship) => sum + Math.max(0.5, designOf(ship).durability || 1), 0) / fleet.ships.length : 1;
  const exposure = clamp(enemyShare * (portProtected ? 0.55 : 1) / Math.sqrt(durability), 0, 1);
  const attempts = Math.min(fleet.ships.length, Math.max(0, Math.floor(fleet.ships.length * exposure * (0.12 + rng() * 0.18) + rng())));
  for (let i = 0; i < attempts; i++) {
    const roll = rng();
    if (roll < 0.38) {
      const ship = removeRandomShip(fleet, rng);
      if (ship) {
        applyShipHit(ship, 0.48 + rng() * 0.42, { rng, catastrophic: true });
        const recovery = portProtected ? { recovered: true, tugId: null } : attemptFleetSalvage(fleet, ship, { rng, hostilePressure: enemyShare });
        if (recovery.recovered) { fleet.ships.push(ship); results.salvaged.push({ ship, tugId: recovery.tugId }); results.damaged.push(ship); }
        else results.sunk.push(ship);
      }
    } else if (roll < 0.72) {
      const ship = removeRandomShip(fleet, rng);
      if (ship) results.capturedCandidates.push(ship);
    } else {
      const ship = damageRandomShip(fleet, 0.15 + rng() * 0.35, rng);
      if (ship) results.damaged.push(ship);
    }
  }
  return results;
}

function captureCandidates(winner, loser, candidates, winnerShare, rng) {
  const captured = [];
  const escaped = [];
  for (const ship of candidates) {
    const spec = designOf(ship);
    const chance = clamp(0.18 + winnerShare * 0.42 - spec.captureResistance * 0.12);
    if (rng() < chance) {
      ship.ownerRegionId = winner.ownerRegionId;
      ship.capturedFromActorId = loser.ownerActorId;
      ship.prize = true;
      ship.condition = Math.min(ship.condition ?? 0.5, 0.55);
      winner.ships.push(ship);
      captured.push(ship);
    } else {
      ship.condition = Math.min(ship.condition ?? 0.5, 0.5);
      loser.ships.push(ship);
      escaped.push(ship);
    }
  }
  return { captured, escaped };
}

function aggregateShipList(ships) {
  const counts = {};
  for (const ship of ships) counts[shipLabel(ship)] = (counts[shipLabel(ship)] || 0) + 1;
  return counts;
}

function damagePortInfrastructure(port, severity, rng) {
  if (!port?.construction?.assets) return [];
  const targets = port.construction.assets.filter((asset) => ['harbour', 'shipyard', 'naval_base', 'coastal_fortifications'].includes(asset.typeId));
  const damaged = [];
  for (const asset of targets) {
    if (rng() > severity) continue;
    const amount = 0.08 + severity * (0.18 + rng() * 0.25);
    asset.condition = clamp((asset.condition ?? 1) - amount);
    damaged.push({ typeId: asset.typeId, damage: amount, condition: asset.condition });
  }
  return damaged;
}

function armourResistance(fleet, enemyGunnery) {
  if (!fleet.ships.length) return 1;
  const armour = fleet.ships.reduce((sum, ship) => sum + Math.max(0, designOf(ship).armour || ship.armour || 0), 0) / fleet.ships.length;
  if (armour <= 0) return 1;
  const penetration = 0.10 + clamp(enemyGunnery?.rifledShare || 0) * 0.34 + clamp(enemyGunnery?.breechShare || 0) * 0.48 + clamp(enemyGunnery?.steelShare || 0) * 0.10;
  return 1 + armour * Math.max(0.12, 0.64 - penetration * 0.48);
}

export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {
  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');
  const attackerOrigin = regionsById.get(attacker.ownerRegionId);
  const defenderOrigin = regionsById.get(defender.ownerRegionId);
  const attackerGunnery = attackerOrigin ? navalGunCombatProfile(attackerOrigin, attacker.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const defenderGunnery = defenderOrigin ? navalGunCombatProfile(defenderOrigin, defender.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const attackerPower = fleetCombatPower(attacker, regionsById) * attackerGunnery.multiplier * armourResistance(attacker, defenderGunnery);
  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort }) * defenderGunnery.multiplier * armourResistance(defender, attackerGunnery);
  const total = Math.max(0.001, attackerPower + defenderPower);
  const attackerShare = attackerPower / total;
  const defenderShare = 1 - attackerShare;

  const attackerLoss = lossesForSide(attacker, defenderShare, rng, false);
  const defenderLoss = lossesForSide(defender, attackerShare, rng, defenderInPort);
  const attackerCapture = captureCandidates(defender, attacker, attackerLoss.capturedCandidates, defenderShare, rng);
  const defenderCapture = captureCandidates(attacker, defender, defenderLoss.capturedCandidates, attackerShare, rng);

  const intensity = (attackerLoss.sunk.length + defenderLoss.sunk.length + attackerCapture.captured.length + defenderCapture.captured.length +
    attackerLoss.damaged.length + defenderLoss.damaged.length + 1) * 6;
  if (attackerOrigin) recordMaritimePractice(attackerOrigin, MARITIME_SKILLS.COMBAT, intensity);
  if (defenderOrigin) recordMaritimePractice(defenderOrigin, MARITIME_SKILLS.COMBAT, intensity);

  attacker.morale = clamp(attacker.morale + (attackerShare - 0.5) * 0.12);
  defender.morale = clamp(defender.morale + (defenderShare - 0.5) * 0.12);
  attacker.condition = clamp(attacker.condition - (attackerLoss.damaged.length + attackerLoss.sunk.length) * 0.015);
  defender.condition = clamp(defender.condition - (defenderLoss.damaged.length + defenderLoss.sunk.length) * 0.015);

  let portDamage = [];
  if (defenderInPort && attackerShare > 0.58 && options.allowPortDamage !== false) {
    const port = regionsById.get(defender.portRegionId);
    portDamage = damagePortInfrastructure(port, clamp((attackerShare - 0.5) * 1.4), rng);
  }

  return {
    attackerShare,
    defenderShare,
    attackerLost: aggregateShipList(attackerLoss.sunk),
    defenderLost: aggregateShipList(defenderLoss.sunk),
    attackerCapturedByDefender: aggregateShipList(attackerCapture.captured),
    defenderCapturedByAttacker: aggregateShipList(defenderCapture.captured),
    attackerDamaged: aggregateShipList(attackerLoss.damaged),
    defenderDamaged: aggregateShipList(defenderLoss.damaged),
    portDamage,
    attackerGunnery, defenderGunnery,
    attackerWon: attackerShare > 0.5,
  };
}

function contactDescription(observer, target, identification, regionsById) {
  const presented = identification.presentedActorId ? representativeRegionForActor(identification.presentedActorId, regionsById) : null;
  const counts = fleetShipCounts(target);
  const composition = Object.entries(counts).map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`).join(', ');
  if (identification.imposterOfObserver) {
    return `Lookouts report ${composition || 'a fleet'} flying our own flag. The ships are not ours. These impostors dared to falsely imitate us.`;
  }
  if (!identification.presentedActorId) {
    return `Lookouts report ${composition || 'a fleet'} carrying no recognised flag.`;
  }
  const mismatch = identification.designMismatch ? ' Its design appears inconsistent with what we know of that fleet.' : '';
  if (identification.actualActorId && identification.actualActorId !== identification.presentedActorId) {
    return `Lookouts report ${composition || 'a fleet'} flying the flag of ${presented?.name || 'another polity'}, but experienced observers believe the flag is false.${mismatch}`;
  }
  return `Lookouts report ${composition || 'a fleet'} flying the flag of ${presented?.name || 'another polity'}.${mismatch}`;
}

function createContact(observer, target, currentTick, regionsById, rng) {
  const identification = identifyFleet(observer, target, regionsById, rng);
  return {
    id: `encounter-${nextEncounterId++}`,
    type: 'fleet_contact',
    tick: currentTick,
    observerFleetId: observer.id,
    targetFleetId: target.id,
    seaRegionId: observer.seaRegionId,
    identification,
    description: contactDescription(observer, target, identification, regionsById),
    choices: ['hail', 'attack', 'leave'],
    resolved: false,
  };
}

function perceivedActor(contact) {
  return contact.identification.actualActorId || contact.identification.presentedActorId || null;
}

function aiContactChoice(observer, target, contact, regionsById) {
  const observerRegion = regionsById.get(observer.ownerRegionId);
  const perceived = perceivedActor(contact);
  if (contact.identification.imposterOfObserver) return 'attack';
  if (!perceived || !observerRegion) return observer.mission === FLEET_MISSIONS.INTERCEPT ? 'hail' : 'leave';
  const representative = representativeRegionForActor(perceived, regionsById);
  const attitude = representative ? attitudeToward(observerRegion, representative.id) : 0;
  if ((observer.mission === FLEET_MISSIONS.INTERCEPT || observer.mission === FLEET_MISSIONS.BLOCKADE) && attitude <= -0.35) return 'attack';
  if (observer.mission === FLEET_MISSIONS.PATROL && attitude <= -0.6) return 'attack';
  return contact.identification.falseFlagDetected ? 'hail' : 'leave';
}

function battleEvent(attacker, defender, result, contact = null) {
  return {
    type: 'fleet_battle',
    attackerName: attacker.name, defenderName: defender.name,
    attackerFleetId: attacker.id,
    defenderFleetId: defender.id,
    attackerOwnerRegionId: attacker.ownerRegionId,
    defenderOwnerRegionId: defender.ownerRegionId,
    attackerOwnerActorId: attacker.ownerActorId,
    defenderOwnerActorId: defender.ownerActorId,
    result,
    contact,
  };
}

export function resolveFleetContact(contact, choice, fleets, regionsById, currentTick, rng = Math.random) {
  if (!contact || contact.resolved) return [];
  const observer = fleets.find((fleet) => fleet.id === contact.observerFleetId);
  const target = fleets.find((fleet) => fleet.id === contact.targetFleetId);
  if (!observer || !target) { contact.resolved = true; return []; }
  contact.resolved = true;
  if (choice === 'leave') return [{ type: 'fleet_contact_ended', contact, outcome: 'left_alone' }];
  if (choice === 'hail') {
    // Hailing improves identification but also tells the other fleet it has
    // been found. False flags are not automatically pierced unless the
    // observer has evidence; own-flag impostors remain perfectly obvious.
    const identification = identifyFleet(observer, target, regionsById, rng);
    identification.certainty = clamp(identification.certainty + 0.18);
    contact.identification = identification;
    return [{ type: 'fleet_hail', contact, targetResponded: rng() < 0.75 }];
  }
  if (choice !== 'attack') return [];

  const targetPower = fleetCombatPower(target, regionsById);
  const observerPower = fleetCombatPower(observer, regionsById);
  const targetChoosesFlight = target.mission === FLEET_MISSIONS.HIDE || targetPower < observerPower * 0.82;
  if (targetChoosesFlight) {
    const pursuit = attemptPursuit(observer, target, regionsById, rng);
    if (!pursuit.caught) return [{ type: 'fleet_escaped', contact, attackerFleetId: observer.id, targetFleetId: target.id, pursuit }];
  }
  const result = resolveFleetBattle(observer, target, regionsById, rng);
  return [battleEvent(observer, target, result, contact)];
}

function applyBlockades(fleets, regionsById) {
  for (const region of regionsById.values()) {
    region.navalBlockadePressure = 0;
    region.fleetPatrolCoverage = 0;
    region.navalDeployedBoats = 0;
  }
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || !fleet.ships.length) continue;
    const owner = regionsById.get(fleet.ownerRegionId);
    if (!owner) continue;
    regionPresence(owner, fleet);
  }
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || fleet.mission !== FLEET_MISSIONS.BLOCKADE || !fleet.missionTargetId) continue;
    const target = regionsById.get(fleet.missionTargetId);
    if (!target || !(target.adjacentSeaIds || []).includes(fleet.seaRegionId)) continue;
    const blockader = fleetCombatPower(fleet, regionsById);
    const harbour = operationalInfrastructure(target, 'harbour') ? 1.15 : 1;
    target.navalBlockadePressure = clamp(Math.max(target.navalBlockadePressure || 0,
      (1 - Math.exp(-blockader / 18)) / harbour));
  }
}

function regionPresence(owner, fleet) {
  owner.navalDeployedBoats = (owner.navalDeployedBoats || 0) + fleet.ships.length;
  if (fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT || fleet.mission === FLEET_MISSIONS.ESCORT) {
    const total = Math.max(1, owner.navy?.boats || fleet.ships.length);
    owner.fleetPatrolCoverage = clamp((owner.fleetPatrolCoverage || 0) + fleet.ships.length / total);
  }
}

function chooseAiFleetOrders(fleets, regionsById, seaRegionsById, playerActorId, rng, weeks) {
  for (const fleet of fleets) {
    if (!fleet.ships.length || fleet.ownerActorId === playerActorId) continue;
    const owner = regionsById.get(fleet.ownerRegionId);
    if (!owner) continue;
    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72 || shouldReturnForProvisioning(fleet))) {
      orderFleetHome(fleet, regionsById, seaRegionsById);
      continue;
    }
    if (fleet.locationType !== 'port' || fleet.supply < 0.88 || fleet.condition < 0.82 || fleet.fatigue > 0.2) continue;
    const chance = 1 - Math.pow(1 - 0.035, Math.max(0.25, weeks));
    if (rng() > chance) continue;
    const port = regionsById.get(fleet.portRegionId);
    const seas = (port?.adjacentSeaIds || []).filter((id) => seaRegionsById.has(id));
    if (!seas.length) continue;
    const seaId = seas[Math.floor(rng() * seas.length)];
    const sea = seaRegionsById.get(seaId);
    const hostile = (sea?.adjacentLand || []).map((id) => regionsById.get(id)).filter((r) => r && actorId(r) !== fleet.ownerActorId && attitudeToward(owner, r.id) <= -0.55);
    const priority = owner.militaryPolicy?.navalPriority || 'trade';
    let mission = priority === 'war' ? FLEET_MISSIONS.INTERCEPT : FLEET_MISSIONS.PATROL;
    let targetId = null;
    if (priority === 'war' && hostile.length && fleet.ships.length >= 3) {
      const target = hostile[Math.floor(rng() * hostile.length)];
      targetId = target.id;
      mission = fleet.ships.length >= 6 && rng() < 0.08 ? FLEET_MISSIONS.PORT_ASSAULT : FLEET_MISSIONS.BLOCKADE;
    }
    deployFleet(fleet, seaId, regionsById, seaRegionsById);
    fleet.mission = mission; fleet.missionTargetId = targetId;
  }
}

function portAssaults(fleets, regionsById, currentTick, rng) {
  const events = [];
  for (const attacker of fleets) {
    if (attacker.locationType !== 'sea' || attacker.mission !== FLEET_MISSIONS.PORT_ASSAULT || !attacker.missionTargetId) continue;
    const targetPort = regionsById.get(attacker.missionTargetId);
    if (!targetPort || !(targetPort.adjacentSeaIds || []).includes(attacker.seaRegionId)) continue;
    const defenders = fleets.filter((fleet) => fleet.locationType === 'port' && fleet.portRegionId === targetPort.id &&
      fleet.ownerActorId !== attacker.ownerActorId && fleet.ships.length > 0);
    for (const defender of defenders) {
      const result = resolveFleetBattle(attacker, defender, regionsById, rng, { defenderInPort: true, allowPortDamage: true });
      events.push({ ...battleEvent(attacker, defender, result), type: 'fleet_port_assault', portRegionId: targetPort.id, tick: currentTick });
      if (!attacker.ships.length) break;
    }
  }
  return events;
}

export function dockFleet(fleet, portRegionId, regionsById, agreements = []) {
  const port = regionsById.get(portRegionId);
  if (!port) return { docked: false, reason: 'missing_port' };
  if (fleet.locationType === 'sea' && !(port.adjacentSeaIds || []).includes(fleet.seaRegionId)) return { docked: false, reason: 'port_not_on_this_sea' };
  const access = portAccessLevel(fleet, port, regionsById, agreements);
  if (access === 'denied') return { docked: false, reason: 'no_access' };
  fleet.locationType = 'port';
  fleet.portRegionId = portRegionId;
  fleet.seaRegionId = null;
  fleet.mission = FLEET_MISSIONS.PORT;
  fleet.missionTargetId = null;
  fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.postTransitMission = null;
  return { docked: true, access };
}

export function deployFleet(fleet, seaRegionId, regionsById, seaRegionsById) {
  if (!seaRegionsById.has(seaRegionId)) return false;
  const fromPort = fleet.locationType === 'port' ? fleet.portRegionId : null;
  const portRegion = fromPort ? regionsById.get(fromPort) : null;
  if (fromPort && !(portRegion?.adjacentSeaIds || []).includes(seaRegionId)) return false;
  fleet.locationType = 'sea';
  fleet.portRegionId = null;
  fleet.seaRegionId = seaRegionId;
  if (fleet.mission === FLEET_MISSIONS.PORT) fleet.mission = FLEET_MISSIONS.PATROL;
  return true;
}

export function tickFleets(fleets, regions, seaRegions, agreements, currentTick, elapsedDays = 7, rng = Math.random, options = {}) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const seaRegionsById = new Map(seaRegions.map((sea) => [sea.id, sea]));
  const weeks = Math.max(0.01, elapsedDays / 7);
  const events = [];
  reconcileFleetLedger(regions, fleets, events, weeks);
  events.push(...tickLateIndustrialNavalWarfare(fleets, regions, seaRegions, currentTick, elapsedDays, rng));

  for (const fleet of fleets) {
    ensureFleetState(fleet);
    if (!fleet.ships.length) continue;
    if (fleet.locationType === 'port') serviceInPort(fleet, regionsById, agreements, weeks);
    else {
      consumeFleetCoal(fleet, weeks);
      wearAtSea(fleet, weeks);
      advanceFleetRoute(fleet, weeks);
      const origin = regionsById.get(fleet.ownerRegionId);
      const provisioning = tickProvisioningAtSea(fleet, origin, weeks);
      if (provisioning.event) { provisioning.event.tick = currentTick; events.push(provisioning.event); }
      if (origin) {
        const practice = fleet.ships.length * weeks * (fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT ? 2 : 0.8);
        recordMaritimePractice(origin, fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT
          ? MARITIME_SKILLS.SCOUTING : MARITIME_SKILLS.COMBAT, practice);
      }
    }
  }

  // A player or AI may set return_refit while far from home. Turn that order
  // into a real routed voyage rather than teleporting to harbour.
  for (const fleet of fleets) {
    if (fleet.locationType === 'sea' && fleet.mission === FLEET_MISSIONS.RETURN_REFIT && !fleet.routeSeaIds?.length) {
      orderFleetHome(fleet, regionsById, seaRegionsById);
    }
  }
  chooseAiFleetOrders(fleets, regionsById, seaRegionsById, options.playerActorId || null, rng, weeks);
  applyBlockades(fleets, regionsById);

  // A return/refit order docks automatically once the fleet reaches a sea
  // touching its home port; fleets farther away keep transiting normally.
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || fleet.mission !== FLEET_MISSIONS.RETURN_REFIT) continue;
    const home = regionsById.get(fleet.homePortRegionId);
    if (home && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) dockFleet(fleet, home.id, regionsById, agreements);
  }

  const bySea = new Map();
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || !fleet.seaRegionId || !fleet.ships.length) continue;
    if (!bySea.has(fleet.seaRegionId)) bySea.set(fleet.seaRegionId, []);
    bySea.get(fleet.seaRegionId).push(fleet);
  }

  for (const seaFleets of bySea.values()) {
    for (const observer of seaFleets) {
      if (!canSearch(observer)) continue;
      for (const target of seaFleets) {
        if (target === observer || target.ownerActorId === observer.ownerActorId) continue;
        const last = Number(observer.lastContactTickByFleet[target.id]) || -Infinity;
        if (currentTick - last < 4) continue;
        if (rng() >= detectionChance(observer, target, regionsById, weeks)) continue;
        observer.lastContactTickByFleet[target.id] = currentTick;
        const contact = createContact(observer, target, currentTick, regionsById, rng);
        const playerActorId = options.playerActorId || null;
        if (playerActorId && observer.ownerActorId === playerActorId) {
          events.push(contact);
        } else {
          const choice = aiContactChoice(observer, target, contact, regionsById);
          events.push(...resolveFleetContact(contact, choice, fleets, regionsById, currentTick, rng));
        }
      }
    }
  }

  events.push(...portAssaults(fleets, regionsById, currentTick, rng));
  for (let i = fleets.length - 1; i >= 0; i--) if (!fleets[i].ships.length) fleets.splice(i, 1);
  syncRegionalNavyLedger(regions, fleets);
  return { fleets, events, regionsById, seaRegionsById };
}

export function fleetEventInvolvesActor(event, actor, fleets) {
  if (!actor || !event) return false;
  if (event.ownerActorId === actor || event.attackerOwnerActorId === actor || event.defenderOwnerActorId === actor) return true;
  const ids = [event.observerFleetId, event.targetFleetId, event.attackerFleetId, event.defenderFleetId].filter(Boolean);
  return ids.some((id) => fleets.find((fleet) => fleet.id === id)?.ownerActorId === actor) ||
    Boolean(event.attackerOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.attackerOwnerRegionId && fleet.ownerActorId === actor)) ||
    Boolean(event.defenderOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.defenderOwnerRegionId && fleet.ownerActorId === actor));
}

export function formatShipOutcome(counts = {}) {
  const parts = Object.entries(counts).filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'none';
}
