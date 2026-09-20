import { operationalInfrastructure, effectiveInfrastructureCount, overlandInfrastructureMultiplier } from './construction.js?v=20260920-fuel-logistics1';
import { railwayConnection } from './railways.js?v=20260920-fuel-logistics1';
import { centroidDistanceKm } from '../world/distance.js?v=20260920-fuel-logistics1';
import { PETROLEUM_PRODUCTS } from './petroleumRefining.js?v=20260920-fuel-logistics1';
import { PETROLEUM_REFINING_TECH_ID } from '../technology/petroleum.js?v=20260920-fuel-logistics1';
import { NATURAL_GAS_EXTRACTION_TECH_ID } from '../technology/modernEnergy.js?v=20260920-fuel-logistics1';

const DAYS_PER_YEAR = 365.2425;
const LIQUID_FUELS = new Set(['oil', ...PETROLEUM_PRODUCTS]);
const PIPELINE_KINDS = Object.freeze({ GAS:'gas', CRUDE:'crude', PRODUCTS:'products' });
let nextAssetId = 1;
let nextPipelineId = 1;

const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export function ensureFuelLogistics(region) {
  region.fuelLogistics ||= {};
  const s = region.fuelLogistics;
  for (const key of ['petroleumTankers','roadTankers','railTankCars']) if (!Array.isArray(s[key])) s[key] = [];
  if (!s.pipelineConnections || typeof s.pipelineConnections !== 'object' || Array.isArray(s.pipelineConnections)) s.pipelineConnections = {};
  if (!Number.isFinite(s.lastProcurementYear)) s.lastProcurementYear = -1;
  return s;
}

export function syncNextFuelLogisticsIds(regions=[]) {
  let assetMax=0, pipeMax=0;
  for (const region of regions) {
    const s=ensureFuelLogistics(region);
    for (const key of ['petroleumTankers','roadTankers','railTankCars']) for (const a of s[key]) {
      const m=String(a.id||'').match(/fuel-asset-(\d+)$/); if(m) assetMax=Math.max(assetMax,Number(m[1])||0);
    }
    for (const links of Object.values(s.pipelineConnections)) for (const p of Object.values(links||{})) {
      const m=String(p?.id||'').match(/fuel-pipeline-(\d+)$/); if(m) pipeMax=Math.max(pipeMax,Number(m[1])||0);
    }
  }
  nextAssetId=Math.max(nextAssetId,assetMax+1); nextPipelineId=Math.max(nextPipelineId,pipeMax+1);
}

export function fuelClass(resource) {
  if (resource === 'natural_gas') return PIPELINE_KINDS.GAS;
  if (resource === 'oil') return PIPELINE_KINDS.CRUDE;
  if (PETROLEUM_PRODUCTS.includes(resource)) return PIPELINE_KINDS.PRODUCTS;
  return null;
}
export function isDedicatedFuel(resource) { return fuelClass(resource) !== null; }

function activeReservationIds(region) {
  return new Set((region.tradeEconomy?.ventures || []).map(v=>v?.fuelAssetId).filter(Boolean));
}
function idleAsset(region, key) {
  const busy=activeReservationIds(region);
  return ensureFuelLogistics(region)[key].find(a=>a.status!=='retired'&&(a.condition??1)>=.45&&!busy.has(a.id))||null;
}
export const idlePetroleumTanker = (region) => idleAsset(region,'petroleumTankers');
export const idleRoadTanker = (region) => idleAsset(region,'roadTankers');
export const idleRailTankCar = (region) => idleAsset(region,'railTankCars');

function spendIndustrialInputs(region, {steel=0,machine_components=0,rail_stock=0,motor_vehicle=0,diesel=0,cash=0}={}) {
  region.stockpile ||= {}; region.industrialSupply ||= {}; region.industrialSupply.inventory ||= {};
  const inv=region.industrialSupply.inventory;
  if (nonNegative(region.stockpile.steel)<steel || nonNegative(inv.machine_components)<machine_components || nonNegative(inv.rail_stock)<rail_stock || nonNegative(inv.motor_vehicle)<motor_vehicle || nonNegative(region.stockpile.diesel)<diesel || nonNegative(region.treasury)<cash) return false;
  region.stockpile.steel-=steel; inv.machine_components-=machine_components; inv.rail_stock-=rail_stock; inv.motor_vehicle-=motor_vehicle; region.stockpile.diesel-=diesel; region.treasury-=cash;
  return true;
}

export function buildFuelTransportAsset(region, type) {
  const s=ensureFuelLogistics(region), id=`fuel-asset-${nextAssetId++}`;
  if (type==='petroleum_tanker') {
    if (!region.isCoastal || !operationalInfrastructure(region,'harbour') || !operationalInfrastructure(region,'large_drydock')) return {built:false,reason:'specialised_shipyard_required'};
    if (!spendIndustrialInputs(region,{steel:220,machine_components:62,diesel:28,cash:105})) return {built:false,reason:'insufficient_inputs'};
    const asset={id,type,status:'serviceable',condition:1,capacityUnits:11500}; s.petroleumTankers.push(asset); return {built:true,asset};
  }
  if (type==='road_tanker') {
    if (!operationalInfrastructure(region,'road_network')) return {built:false,reason:'road_network_required'};
    if (!spendIndustrialInputs(region,{machine_components:1.5,motor_vehicle:1,diesel:2,cash:8})) return {built:false,reason:'insufficient_inputs'};
    const asset={id,type,status:'serviceable',condition:1,capacityUnits:520}; s.roadTankers.push(asset); return {built:true,asset};
  }
  if (type==='rail_tank_cars') {
    if (!Object.keys(region.railConnections||{}).length) return {built:false,reason:'rail_connection_required'};
    if (!spendIndustrialInputs(region,{steel:12,machine_components:2,rail_stock:4,cash:18})) return {built:false,reason:'insufficient_inputs'};
    const asset={id,type,status:'serviceable',condition:1,capacityUnits:2600}; s.railTankCars.push(asset); return {built:true,asset};
  }
  return {built:false,reason:'unknown_type'};
}

function pipelineReady(region, kind) {
  const c=region.industrialSupply?.capability||{};
  const industrial=(c.steelmaking||0)*.45+(c.precision_machining||0)*.35+(c.railway_engineering||0)*.2;
  const sector = kind===PIPELINE_KINDS.GAS ? region.unlockedTechIds?.has?.(NATURAL_GAS_EXTRACTION_TECH_ID) : region.unlockedTechIds?.has?.(PETROLEUM_REFINING_TECH_ID);
  return Boolean(sector && industrial>=.28);
}

function connectionSlot(region, otherId){ const s=ensureFuelLogistics(region); s.pipelineConnections[otherId] ||= {}; return s.pipelineConnections[otherId]; }
export function pipelineConnection(regionA, regionB, kind) {
  const p=ensureFuelLogistics(regionA).pipelineConnections?.[regionB?.id]?.[kind];
  if(!p||p.status!=='operational'||(p.condition??1)<.2)return null;
  return p;
}

export function buildPipelineLink(regionA, regionB, kind) {
  if(!Object.values(PIPELINE_KINDS).includes(kind))return {built:false,reason:'unknown_pipeline_kind'};
  if(!(regionA.neighbors||[]).includes(regionB.id))return {built:false,reason:'adjacent_regions_required'};
  if(!pipelineReady(regionA,kind))return {built:false,reason:'technology_or_industry_not_ready'};
  if(pipelineConnection(regionA,regionB,kind))return {built:false,reason:'already_exists'};
  const km=Math.max(20,centroidDistanceKm(regionA,regionB)||100), scale=Math.max(.35,km/150);
  const inputs={steel:95*scale,machine_components:11*scale,cash:58*scale};
  if(!spendIndustrialInputs(regionA,inputs))return {built:false,reason:'insufficient_inputs'};
  const id=`fuel-pipeline-${nextPipelineId++}`, capacity=kind===PIPELINE_KINDS.GAS?9000:7600;
  const record={id,kind,status:'operational',condition:1,lengthKm:km,capacityUnits:capacity/scale,ownerRegionId:regionA.id,otherRegionId:regionB.id};
  connectionSlot(regionA,regionB.id)[kind]={...record};
  connectionSlot(regionB,regionA.id)[kind]={...record,otherRegionId:regionA.id};
  return {built:true,pipeline:record};
}

function pipelinePath(pathIds, regionsById, kind) {
  if(!Array.isArray(pathIds)||pathIds.length<2)return null;
  let capacity=Infinity, condition=1, km=0;
  for(let i=0;i<pathIds.length-1;i++){
    const a=regionsById.get(pathIds[i]), b=regionsById.get(pathIds[i+1]); if(!a||!b)return null;
    const p=pipelineConnection(a,b,kind); if(!p)return null;
    capacity=Math.min(capacity,nonNegative(p.capacityUnits)); condition=Math.min(condition,clamp(p.condition)); km+=Math.max(1,p.lengthKm||0);
  }
  return {capacityUnits:capacity*condition,condition,lengthKm:km};
}

function railPath(pathIds, regionsById) {
  if(!Array.isArray(pathIds)||pathIds.length<2)return null;
  let capacity=Infinity;
  for(let i=0;i<pathIds.length-1;i++){
    const a=regionsById.get(pathIds[i]), b=regionsById.get(pathIds[i+1]), r=railwayConnection(a,b); if(!r)return null;
    capacity=Math.min(capacity,Math.max(.05,r.effectiveCapacity||0));
  }
  return {capacityMultiplier:capacity};
}
function roadPathAvailable(pathIds,regionsById){
  if(!Array.isArray(pathIds)||pathIds.length<2)return false;
  return pathIds.every(id=>{const r=regionsById.get(id);return r&&operationalInfrastructure(r,'road_network')&&overlandInfrastructureMultiplier(r)>=1;});
}

export function fuelTransportProfile(origin,dest,resource,route,regionsById) {
  const kind=fuelClass(resource); if(!kind)return null;
  const pipe=route.mode==='land'?pipelinePath(route.pathIds,regionsById,kind):null;
  if(pipe) return {mode:'pipeline',assetId:null,capacityUnits:pipe.capacityUnits,costMultiplier:.18,timeMultiplier:.32,reliabilityMultiplier:.97};
  if(resource==='natural_gas') return null;
  if(route.mode==='sea'){
    if(!operationalInfrastructure(origin,'harbour')||!operationalInfrastructure(dest,'harbour'))return null;
    const tanker=idlePetroleumTanker(origin); if(!tanker)return null;
    return {mode:'petroleum_tanker',assetId:tanker.id,capacityUnits:tanker.capacityUnits*(tanker.condition??1),costMultiplier:.52,timeMultiplier:.92,reliabilityMultiplier:clamp(.82+(tanker.condition??1)*.18)};
  }
  const rail=railPath(route.pathIds,regionsById), railAsset=rail?idleRailTankCar(origin):null;
  if(rail&&railAsset)return {mode:'rail_tank_cars',assetId:railAsset.id,capacityUnits:railAsset.capacityUnits*Math.max(.2,rail.capacityMultiplier),costMultiplier:.48,timeMultiplier:.62,reliabilityMultiplier:clamp(.78+(railAsset.condition??1)*.2)};
  const roadAsset=roadPathAvailable(route.pathIds,regionsById)?idleRoadTanker(origin):null;
  if(roadAsset)return {mode:'road_tanker',assetId:roadAsset.id,capacityUnits:roadAsset.capacityUnits*(roadAsset.condition??1),costMultiplier:.78,timeMultiplier:.78,reliabilityMultiplier:clamp(.72+(roadAsset.condition??1)*.25)};
  return null;
}

function refinedStock(region){return PETROLEUM_PRODUCTS.reduce((s,k)=>s+nonNegative(region.stockpile?.[k]),0);}
function maybeBuildPipeline(region, neighbour) {
  const cases=[
    [PIPELINE_KINDS.GAS, nonNegative(region.stockpile?.natural_gas)>1600 && nonNegative(neighbour.stockpile?.natural_gas)<500],
    [PIPELINE_KINDS.CRUDE, nonNegative(region.stockpile?.oil)>1600 && effectiveInfrastructureCount(neighbour,'petroleum_refinery')>0 && nonNegative(neighbour.stockpile?.oil)<500],
    [PIPELINE_KINDS.PRODUCTS, refinedStock(region)>1400 && refinedStock(neighbour)<400],
  ];
  for(const [kind,useful] of cases) if(useful&&!pipelineConnection(region,neighbour,kind)){const r=buildPipelineLink(region,neighbour,kind);if(r.built)return r;}
  return null;
}

function maintainAssets(region, elapsedDays){
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR, s=ensureFuelLogistics(region);
  for(const key of ['petroleumTankers','roadTankers','railTankCars'])for(const a of s[key]){
    if(a.status==='retired')continue;
    a.condition=clamp((a.condition??1)-years*(key==='petroleumTankers'?.025:.04));
    if(a.condition<.25)a.status='retired';
  }
  for(const links of Object.values(s.pipelineConnections))for(const p of Object.values(links||{}))if(p.ownerRegionId===region.id){p.condition=clamp((p.condition??1)-years*.018);}
}

export function tickFuelLogistics(regions,currentTick=null,elapsedDays=7){
  syncNextFuelLogisticsIds(regions); const byId=new Map(regions.map(r=>[r.id,r]));
  for(const r of regions)maintainAssets(r,elapsedDays);
  const year=Number.isFinite(currentTick)?Math.floor(currentTick/52):null;
  for(const region of regions){
    const s=ensureFuelLogistics(region); if(year!==null&&s.lastProcurementYear===year)continue; if(year!==null)s.lastProcurementYear=year;
    const hasLiquid=nonNegative(region.stockpile?.oil)+refinedStock(region)>600;
    if(hasLiquid&&region.isCoastal&&operationalInfrastructure(region,'harbour')&&operationalInfrastructure(region,'large_drydock')&&s.petroleumTankers.filter(a=>a.status!=='retired').length<2)buildFuelTransportAsset(region,'petroleum_tanker');
    if(hasLiquid&&operationalInfrastructure(region,'road_network')&&s.roadTankers.filter(a=>a.status!=='retired').length<4)buildFuelTransportAsset(region,'road_tanker');
    if(hasLiquid&&Object.keys(region.railConnections||{}).length&&s.railTankCars.filter(a=>a.status!=='retired').length<3)buildFuelTransportAsset(region,'rail_tank_cars');
    for(const id of region.neighbors||[]){const n=byId.get(id);if(!n)continue;const result=maybeBuildPipeline(region,n);if(result?.built)break;}
  }
}

export { PIPELINE_KINDS, LIQUID_FUELS };
