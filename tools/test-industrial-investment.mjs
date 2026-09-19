import assert from 'node:assert/strict';
import { tickIndustrialInvestment, setIndustrialSubsidy } from '../js/economy/industrialInvestment.js';
import { setTradeRestriction } from '../js/economy/tradePolicy.js';

function baseRegion(id='r'){
  return {id,name:id,population:120000,wallet:1800,treasury:120,unlockedTechIds:new Set(['automobile','assembly_line_production','advanced_factories','steelmaking']),construction:{assets:[{id:'f1',typeId:'factory',condition:1,scale:1},{id:'road',typeId:'road_network',condition:1,scale:1}]},industrialProduction:{factorySophistication:.55},industrialSupply:{capability:{precision_machining:.72},inventory:{machine_components:120}},structuralTransformation:{urbanShare:.45},stockpile:{steel:500,petrol:120,diesel:80},corporateCapital:{financialDepth:.55,creditorTrust:.7,firms:[{id:'maker',status:'active',sector:'manufacture',capitalIndex:4,profitability:.03}]},army:{personnel:10000,away:0},warEconomy:{activeCampaigns:0},industrialPlants:{lines:[],componentInventory:{},componentCapability:{engine:.45,transmission:.42,tracked_running_gear:.38,wheeled_chassis:.48,gun_system:.4,armour_plate:.36,optics:.3,electronics:.18,hull_fabrication:.44},productExperience:{motor_vehicle:.25,self_propelled_gun:.14,tank:.08},nextLineId:1}};
}

const noFactory=baseRegion('no-factory');
noFactory.construction.assets=noFactory.construction.assets.filter(a=>a.typeId!=='factory');
for(let i=0;i<8;i++)tickIndustrialInvestment(noFactory,90);
assert((noFactory.industrialInvestment.factoryInvestmentSignal||0)>.2,'profitable industrial demand should create a private factory investment signal even before capacity exists');

const privateFactory=baseRegion('private-factory');
privateFactory.construction.assets=privateFactory.construction.assets.filter(a=>a.typeId!=='factory');
privateFactory.corporateInfrastructure={assets:[{id:'corp-f1',type:'factory',status:'operational',condition:1,baseCapacity:1,effectiveCapacity:1}]};
for(let i=0;i<4;i++)tickIndustrialInvestment(privateFactory,90);
assert((privateFactory.industrialInvestment.last.factoryCapacity||0)>0,'an operational privately-owned corporate factory must count as real industrial capacity');
assert(privateFactory.industrialPlants.lines.length>0,'private factory capacity should be usable by the component and assembly-line economy');

const unprotected=baseRegion('free');
tickIndustrialInvestment(unprotected,90);
const freeCars=unprotected.industrialPlants.lines.find(l=>l.productId==='motor_vehicle');

const protectedRegion=baseRegion('protected');
setTradeRestriction(protectedRegion,{direction:'import',goods:['motor_vehicle'],allowed:true,tariffRate:.8,enforcement:'immediate'},[protectedRegion],0);
tickIndustrialInvestment(protectedRegion,90);
const protectedCars=protectedRegion.industrialPlants.lines.find(l=>l.productId==='motor_vehicle');
assert(protectedCars,'a strong car tariff should make a marginal domestic vehicle line investible');
assert((protectedRegion.industrialInvestment.last.tariffSupport||0)>=.79,'tariff support must come from real trade policy');
assert(!freeCars || protectedRegion.industrialInvestment.marginEma.motor_vehicle>unprotected.industrialInvestment.marginEma.motor_vehicle,'protection should improve expected vehicle margins');

const subsidised=baseRegion('subsidised');
setIndustrialSubsidy(subsidised,'motor_vehicle',.4);
tickIndustrialInvestment(subsidised,180);
assert(subsidised.industrialPlants.lines.some(l=>l.productId==='motor_vehicle'),'an output subsidy should be able to sustain domestic vehicle production');
assert((subsidised.industrialInvestment.last.subsidySpend||0)>=0,'subsidy accounting should be present');

const wartime=baseRegion('war');
wartime.warEconomy.activeCampaigns=2;
wartime.industrialPlants.lines.push({id:'line-1',productId:'motor_vehicle',status:'idle',capacityShare:.5,toolingFit:1,idleWeeks:12,retoolWeeksRemaining:0,lastOutput:0});
wartime.industrialPlants.nextLineId=2;
const treasuryBefore=wartime.treasury;
for(let i=0;i<8;i++)tickIndustrialInvestment(wartime,90);
assert((wartime.industrialInvestment.procurement.tank||0)>0 || (wartime.industrialInvestment.procurement.self_propelled_gun||0)>0,'war should create military vehicle procurement demand');
assert(wartime.industrialPlants.lines.some(l=>['tank','self_propelled_gun'].includes(l.productId)||l.previousProductId==='motor_vehicle'),'civilian vehicle capacity should be retoolable toward military production');
assert(wartime.treasury<=treasuryBefore,'delivered procurement must not create treasury money');

const collapsing=baseRegion('collapse');
collapsing.population=0;collapsing.wallet=0;collapsing.army={personnel:0,away:0};collapsing.stockpile.petrol=0;collapsing.stockpile.diesel=0;
collapsing.industrialPlants.lines=[{id:'line-1',productId:'motor_vehicle',status:'active',capacityShare:1,toolingFit:1,idleWeeks:0,retoolWeeksRemaining:0,lastOutput:0}];
for(let i=0;i<12;i++)tickIndustrialInvestment(collapsing,90);
const deadLine=collapsing.industrialPlants.lines[0];
assert(['mothballed','idle'].includes(deadLine.status)||deadLine.productId===null,'a line with no viable demand should not remain permanently active');

console.log('industrial investment and procurement regressions passed');
