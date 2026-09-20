import assert from 'node:assert/strict';
import { carrierAirGroupSummary, resolveCarrierAirExchange } from '../js/military/carrierAirGroupCombat.js';
import { tickLateIndustrialNavalWarfare } from '../js/military/lateIndustrialNavy.js';

function region(id){return{id,name:id,isCoastal:true,relations:new Map(),aviation:{aircraft:[]},industrialPlants:{componentCapability:{}},industrialSupply:{capability:{}},unlockedTechIds:new Set(),stockpile:{torpedoes:0,naval_mines:0}};}
function carrierShip(id){return{id,designId:'dreadnought',classLabel:'supercarrier',condition:1,gunCapacity:4,propulsion:'steam',designStats:{tier:10,combat:1.5,durability:4,fireControl:.7,damageControl:.6,gunCapacity:4,propulsion:'steam'},carrierFacilities:{hullClass:'supercarrier',capacity:76,deckSpace:1,sortieRate:.76,maxAircraftSize:1,launchSystem:'electromagnetic_launch',recoverySystem:'advanced_arresting'}};}
function escort(id){return{id,designId:'destroyer',classLabel:'destroyer',condition:1,gunCapacity:8,propulsion:'steam',designStats:{tier:9,combat:3,durability:2,fireControl:.6,damageControl:.55,gunCapacity:8,propulsion:'steam'}};}
function aircraft(id,role,fleetId,shipId,extra={}){return{id,role,ownerType:'military',status:'serviceable',condition:1,fuel:1,baseType:'carrier',baseFleetId:fleetId,carrierShipId:shipId,carrierAdaptation:{tailhook:true,reinforcedLandingGear:true},pilotExperience:20,designStats:{reliability:.8,firepower:.72,manoeuvrability:.72,payload:role==='bomber'?.75:.28,range:.72,radarCapability:role==='airborne_early_warning'?.9:.45,enginePower:.65,propulsion:'jet'},...extra};}

const a=region('a'),b=region('b');a.relations.set('b',{attitude:-.8});b.relations.set('a',{attitude:-.8});
const fa={id:'fa',ownerRegionId:'a',ownerActorId:'a',locationType:'sea',seaRegionId:'s',mission:'patrol',ships:[carrierShip('ca'),escort('ea')]};
const fb={id:'fb',ownerRegionId:'b',ownerActorId:'b',locationType:'sea',seaRegionId:'s',mission:'patrol',ships:[carrierShip('cb'),escort('eb')]};
a.aviation.aircraft.push(aircraft('af','fighter','fa','ca'),aircraft('ab','bomber','fa','ca'),aircraft('aw','airborne_early_warning','fa','ca',{aewSystems:{radarRange:.9,tracking:.85,commandAndControl:.82}}));
b.aviation.aircraft.push(aircraft('bf','fighter','fb','cb'),aircraft('bb','bomber','fb','cb'));

const sa=carrierAirGroupSummary(a,fa),sb=carrierAirGroupSummary(b,fb);
assert.equal(sa.aew.available,true);assert.ok(sa.detectionBonus>sb.detectionBonus,'AEW should materially improve fleet search');assert.ok(sa.capStrength>0&&sa.strikeStrength>0);

let rolls=[.1,.1,.1,.1,.1,.1,.1,.1,.1,.1,.1,.1],i=0;const rng=()=>rolls[i++%rolls.length];
const before=fb.ships.map(s=>s.condition);
const exchange=resolveCarrierAirExchange(fa,fb,new Map([['a',a],['b',b]]),rng);
assert.ok(exchange.attacker.summary.aew.available);assert.ok(fb.ships.some((s,j)=>s.condition<before[j]),'carrier strike should cause real ship damage when it penetrates CAP');

const events=tickLateIndustrialNavalWarfare([fa,fb],[a,b],[{id:'s',minefields:[]}],100,7,()=>.05);
assert.ok(events.some(e=>e.type==='carrier_air_engagement'),'hostile carrier groups should generate standoff air engagements');
console.log('carrier air combat regressions passed');
