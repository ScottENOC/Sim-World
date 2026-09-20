import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';
import {
  ensureFuelLogistics, buildFuelTransportAsset, buildPipelineLink, pipelineConnection,
  fuelTransportProfile, tickFuelLogistics, PIPELINE_KINDS,
} from '../js/economy/fuelLogistics.js';
import { PETROLEUM_REFINING_TECH_ID } from '../js/technology/petroleum.js';
import { NATURAL_GAS_EXTRACTION_TECH_ID } from '../js/technology/modernEnergy.js';

const asset=(typeId)=>({id:`a-${typeId}`,typeId,condition:1,scale:1});
function region(id, overrides={}){
  return {
    id,name:id,population:100000,isCoastal:false,centroid:[0,0],neighbors:[],
    stockpile:{steel:5000,diesel:500,oil:0,natural_gas:0,lamp_fuel:0,petrol:0,heavy_fuel_oil:0,aviation_fuel:0},treasury:5000,
    industrialSupply:{capability:{steelmaking:.8,precision_machining:.8,railway_engineering:.7},inventory:{machine_components:500,rail_stock:100,motor_vehicle:20}},
    construction:{projects:[],completed:{},assets:[],workersReserved:0}, railConnections:{}, tradeEconomy:{ventures:[]},
    unlockedTechIds:new Set([PETROLEUM_REFINING_TECH_ID,NATURAL_GAS_EXTRACTION_TECH_ID]),
    ...overrides,
  };
}
function addInfra(r,...types){for(const t of types){r.construction.assets.push(asset(t));r.construction.completed[t]=(r.construction.completed[t]||0)+1;}return r;}

assert(TRADE_GOODS.natural_gas,'pipeline natural gas should be a priced market commodity after integration');

const a=addInfra(region('a',{centroid:[0,0]}),'road_network','harbour','large_drydock');
const b=addInfra(region('b',{centroid:[1,0]}),'road_network','harbour');
a.neighbors=['b'];b.neighbors=['a'];
a.stockpile.natural_gas=5000;a.stockpile.oil=5000;a.stockpile.petrol=2500;

const gasPipe=buildPipelineLink(a,b,PIPELINE_KINDS.GAS);
assert(gasPipe.built,'industrial gas producers should be able to build an adjacent gas pipeline');
assert(pipelineConnection(a,b,PIPELINE_KINDS.GAS) && pipelineConnection(b,a,PIPELINE_KINDS.GAS),'pipeline links should be visible from both endpoints');
const byId=new Map([['a',a],['b',b]]);
const gasTransport=fuelTransportProfile(a,b,'natural_gas',{mode:'land',pathIds:['a','b']},byId);
assert.equal(gasTransport?.mode,'pipeline','ordinary natural gas trade should require and use a physical gas pipeline');

const noPipeA=addInfra(region('np-a'),'road_network'); const noPipeB=addInfra(region('np-b'),'road_network');
noPipeA.neighbors=['np-b'];noPipeB.neighbors=['np-a'];
assert.equal(fuelTransportProfile(noPipeA,noPipeB,'natural_gas',{mode:'land',pathIds:['np-a','np-b']},new Map([['np-a',noPipeA],['np-b',noPipeB]])),null,'natural gas must not move in generic road cargo without a pipeline');

const road=buildFuelTransportAsset(a,'road_tanker');
assert(road.built && road.asset.type==='road_tanker','road tankers should be persistent dedicated liquid-fuel assets');
const c=addInfra(region('c'),'road_network');a.neighbors.push('c');c.neighbors=['a'];
const roadProfile=fuelTransportProfile(a,c,'petrol',{mode:'land',pathIds:['a','c']},new Map([['a',a],['c',c]]));
assert.equal(roadProfile?.mode,'road_tanker','refined fuel should use road tanker capacity when no pipeline or railway is available');
a.tradeEconomy.ventures=[{fuelAssetId:road.asset.id}];
assert.equal(fuelTransportProfile(a,c,'petrol',{mode:'land',pathIds:['a','c']},new Map([['a',a],['c',c]])),null,'a road tanker already committed to a venture must not be double-booked');
a.tradeEconomy.ventures=[];

const railA=region('rail-a'), railB=region('rail-b');railA.neighbors=['rail-b'];railB.neighbors=['rail-a'];
railA.stockpile.diesel=100;railA.railConnections['rail-b']={lineId:'r1',status:'operational',effectiveCapacity:.9,lengthKm:120};
railB.railConnections['rail-a']={lineId:'r1',status:'operational',effectiveCapacity:.9,lengthKm:120};
const railAsset=buildFuelTransportAsset(railA,'rail_tank_cars');
assert(railAsset.built,'rail tank-car sets should require and use an operational railway connection');
const railProfile=fuelTransportProfile(railA,railB,'diesel',{mode:'land',pathIds:['rail-a','rail-b']},new Map([['rail-a',railA],['rail-b',railB]]));
assert.equal(railProfile?.mode,'rail_tank_cars','bulk refined fuel should move in dedicated rail tank cars when rail is available');

const seaA=addInfra(region('sea-a',{isCoastal:true}),'harbour','large_drydock'); const seaB=addInfra(region('sea-b',{isCoastal:true}),'harbour');
const tanker=buildFuelTransportAsset(seaA,'petroleum_tanker');
assert(tanker.built,'coastal industrial regions with a large drydock should be able to commission petroleum tankers');
const seaProfile=fuelTransportProfile(seaA,seaB,'oil',{mode:'sea',pathIds:null},new Map([['sea-a',seaA],['sea-b',seaB]]));
assert.equal(seaProfile?.mode,'petroleum_tanker','crude oil moved by sea should require a dedicated petroleum tanker');

const pipeA=region('pipe-a',{centroid:[0,0]}), pipeB=region('pipe-b',{centroid:[.8,0]});pipeA.neighbors=['pipe-b'];pipeB.neighbors=['pipe-a'];pipeA.stockpile.petrol=3000;
assert(buildPipelineLink(pipeA,pipeB,PIPELINE_KINDS.PRODUCTS).built,'refined-product pipelines should be buildable separately from crude and gas pipelines');
const productPipe=fuelTransportProfile(pipeA,pipeB,'petrol',{mode:'land',pathIds:['pipe-a','pipe-b']},new Map([['pipe-a',pipeA],['pipe-b',pipeB]]));
assert.equal(productPipe?.mode,'pipeline','a continuous product pipeline should be preferred over truck or rail carriage');

const beforeA=pipelineConnection(a,b,PIPELINE_KINDS.GAS).condition, beforeB=pipelineConnection(b,a,PIPELINE_KINDS.GAS).condition;
tickFuelLogistics([a,b],52,365.2425);
const afterA=pipelineConnection(a,b,PIPELINE_KINDS.GAS).condition, afterB=pipelineConnection(b,a,PIPELINE_KINDS.GAS).condition;
assert(afterA<beforeA && afterB<beforeB && Math.abs(afterA-afterB)<1e-9,'mirrored pipeline endpoint records should age symmetrically');

const tradeSrc=fs.readFileSync(new URL('../js/economy/trade.js',import.meta.url),'utf8');
assert(tradeSrc.includes('fuelTransportProfile')&&tradeSrc.includes('fuelAssetId')&&tradeSrc.includes('tickFuelLogistics'),'trade runtime should enforce and reserve dedicated fuel transport');
assert(tradeSrc.includes("isDedicatedFuel(opp.resource)"),'generic merchants must not silently carry dedicated liquid/gaseous fuels');

console.log('gas pipelines, crude/product pipelines, petroleum tankers, road tankers and rail tank-car logistics regressions passed');
