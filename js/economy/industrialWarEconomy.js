import { ensureConstruction } from './construction.js?v=20260918-industrial-war1';
import { ensureIndustrialSupply } from './industrialSupply.js?v=20260918-industrial-war1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const modernInfantry=(r)=>has(r,'breech_loading_rifles')||has(r,'magazine_rifles')||has(r,'machine_guns');
const modernArtillery=(r)=>has(r,'breech_loading_artillery')||has(r,'heavy_howitzers')||has(r,'quick_firing_artillery')||has(r,'rocket_artillery');

export function ensureIndustrialWarEconomy(region){
 region.warEconomy ||= {};
 const s=region.warEconomy;
 for(const [k,v] of Object.entries({activeCampaigns:0,defendingCampaigns:0,tradeDisruption:0,reconstructionNeed:0,warExhaustion:0,weeklyLogisticsCost:0,munitionsOutputValue:0,casualtiesThisTick:0})) if(!Number.isFinite(s[k]))s[k]=v;
 return s;
}

function consumeMetal(region,amount){let left=Math.max(0,amount);for(const key of ['steel','iron']){const take=Math.min(left,Math.max(0,region.stockpile?.[key]||0));if(take){region.stockpile[key]-=take;left-=take;}}return amount-left;}
function damagedInfrastructureNeed(region,polities=[]){
 const assets=ensureConstruction(region).assets||[];
 const built=assets.reduce((sum,a)=>{const condition=Number.isFinite(Number(a.condition))?Number(a.condition):1;return sum+Math.max(0,1-condition)*Math.max(.5,Number(a.scale)||1);},0);
 const rail=(polities||[]).flatMap(p=>p.railways?.lines||[]).filter(line=>line.fromRegionId===region.id||line.toRegionId===region.id).reduce((sum,line)=>{const condition=Number.isFinite(Number(line.condition))?Number(line.condition):1;return sum+Math.max(0,1-condition)*Math.max(.5,(Number(line.lengthKm)||50)/100);},0);
 return built+rail;
}
function campaignExposure(region,campaigns){
 let count=0,casualties=0,defending=0;
 for(const c of campaigns||[]){if(c.completed)continue;if(c.attackerId===region.id||c.defenderId===region.id){count++;if(c.defenderId===region.id)defending++;const w=c.lastWeek;if(w){if(c.attackerId===region.id)casualties+=Math.max(0,w.attackerLosses||0);if(c.defenderId===region.id)casualties+=Math.max(0,(w.defenderLosses||0)+(w.militiaLosses||0));}}}
 return{count,casualties,defending};
}

function produceMunitions(region,elapsedDays){
 region.stockpile ||= {}; region.marketDemand ||= {};
 const industrial=ensureIndustrialSupply(region);
 const years=Math.max(0,elapsedDays)/DAYS_PER_YEAR;
 const precision=clamp(industrial.capability?.precision_machining||0);
 const steel=clamp(industrial.capability?.steelmaking||0);
 const firearmPractice=clamp(region.firearms?.readiness||0);
 const labourMultiplier=clamp(region.labourRelations?.munitionsMultiplier??1,.35,1);
 const base=clamp(precision*.42+steel*.28+firearmPractice*.30)*labourMultiplier;
 let smallArms=0,shells=0,rockets=0,spending=0;
 const personnel=Math.max(0,(region.army?.personnel||0)+(region.army?.away||0)+(region.emergencyMilitiaPersonnel||0));
 if(modernInfantry(region)){
  const target=personnel*(region.warEconomy?.activeCampaigns?0.34:0.10);
  const gap=Math.max(0,target-(region.stockpile.small_arms_ammunition||0));
  const capacity=Math.max(0,base*personnel*.9*years);
  const powderNeedPer=.035,metalNeedPer=.012,cashNeedPer=.004;
  smallArms=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer,Math.max(0,region.treasury||0)/cashNeedPer);
  if(smallArms>0){const cash=smallArms*cashNeedPer;region.stockpile.gunpowder-=smallArms*powderNeedPer;consumeMetal(region,smallArms*metalNeedPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.small_arms_ammunition=(region.stockpile.small_arms_ammunition||0)+smallArms;}
  region.marketDemand.small_arms_ammunition=Math.max(region.marketDemand.small_arms_ammunition||0,gap/Math.max(1,elapsedDays/7));
 }
 if(modernArtillery(region)){
  const guns=Math.max(0,(region.earlyModernMilitary?.artillery?.inventory?.length||0)+(region.earlyModernMilitary?.artillery?.away?.length||0));
  const target=guns*(region.warEconomy?.activeCampaigns?18:5);
  const gap=Math.max(0,target-(region.stockpile.artillery_shells||0));
  const capacity=Math.max(0,base*(2+guns*9)*years);
  const powderNeedPer=.16,metalNeedPer=.09,cashNeedPer=.025;
  shells=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer,Math.max(0,region.treasury||0)/cashNeedPer);
  if(shells>0){const cash=shells*cashNeedPer;region.stockpile.gunpowder-=shells*powderNeedPer;consumeMetal(region,shells*metalNeedPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.artillery_shells=(region.stockpile.artillery_shells||0)+shells;}
  region.marketDemand.artillery_shells=Math.max(region.marketDemand.artillery_shells||0,gap/Math.max(1,elapsedDays/7));
 }
 if(has(region,'rocket_artillery')){
  const launchers=[...(region.earlyModernMilitary?.artillery?.inventory||[]),...(region.earlyModernMilitary?.artillery?.away||[])].filter(x=>x?.kind==='rocket_artillery').length;
  const target=launchers*(region.warEconomy?.activeCampaigns?32:9);
  const gap=Math.max(0,target-(region.stockpile.artillery_rockets||0));
  const capacity=Math.max(0,base*(2+launchers*12)*years);
  const powderPer=.22,metalPer=.055,cashPer=.032;
  rockets=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalPer,Math.max(0,region.treasury||0)/cashPer);
  if(rockets>0){const cash=rockets*cashPer;region.stockpile.gunpowder-=rockets*powderPer;consumeMetal(region,rockets*metalPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.artillery_rockets=(region.stockpile.artillery_rockets||0)+rockets;}
  region.marketDemand.artillery_rockets=Math.max(region.marketDemand.artillery_rockets||0,gap/Math.max(1,elapsedDays/7));
 }
 let torpedoes=0,navalMines=0;
 if(has(region,'self_propelled_torpedo')){
  const gap=Math.max(0,12-(region.stockpile.torpedoes||0)),cashPer=.08,steelPer=.12,powderPer=.08;
  torpedoes=Math.min(gap,base*18*years,(region.stockpile.steel||0)/steelPer,(region.stockpile.gunpowder||0)/powderPer,Math.max(0,region.treasury||0)/cashPer);
  if(torpedoes>0){const cash=torpedoes*cashPer;region.stockpile.steel-=torpedoes*steelPer;region.stockpile.gunpowder-=torpedoes*powderPer;region.treasury-=cash;region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.torpedoes=(region.stockpile.torpedoes||0)+torpedoes;}
  region.marketDemand.torpedoes=Math.max(region.marketDemand.torpedoes||0,gap/Math.max(1,elapsedDays/7));
 }
 if(has(region,'naval_mines')){
  const gap=Math.max(0,24-(region.stockpile.naval_mines||0)),cashPer=.035,steelPer=.07,powderPer=.06;
  navalMines=Math.min(gap,base*36*years,(region.stockpile.steel||0)/steelPer,(region.stockpile.gunpowder||0)/powderPer,Math.max(0,region.treasury||0)/cashPer);
  if(navalMines>0){const cash=navalMines*cashPer;region.stockpile.steel-=navalMines*steelPer;region.stockpile.gunpowder-=navalMines*powderPer;region.treasury-=cash;region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.naval_mines=(region.stockpile.naval_mines||0)+navalMines;}
  region.marketDemand.naval_mines=Math.max(region.marketDemand.naval_mines||0,gap/Math.max(1,elapsedDays/7));
 }
 return{smallArms,shells,rockets,torpedoes,navalMines,spending,value:smallArms*12+shells*38+rockets*46+torpedoes*85+navalMines*44};
}

export function warTradeDisruptionMultiplier(region){return Math.max(.35,1-clamp(region?.warEconomy?.tradeDisruption||0)*.65);}

export function tickIndustrialWarEconomy(regions,campaigns=[],elapsedDays=7,polities=[]){
 const weekScale=Math.max(.01,elapsedDays/7),years=Math.max(.0001,elapsedDays/DAYS_PER_YEAR);
 for(const region of regions){
  const s=ensureIndustrialWarEconomy(region);const exposure=campaignExposure(region,campaigns);
  s.activeCampaigns=exposure.count;s.defendingCampaigns=exposure.defending;s.casualtiesThisTick=exposure.casualties;
  const away=Math.max(0,region.army?.away||0),militia=Math.max(0,region.emergencyMilitiaPersonnel||0);
  const modernLoad=(modernInfantry(region)?1.35:1)*(modernArtillery(region)?1.25:1);
  s.weeklyLogisticsCost=(away*.0012+militia*.00075)*modernLoad;
  const reconstruction=damagedInfrastructureNeed(region,polities);
  s.reconstructionNeed=reconstruction;
  const targetDisruption=clamp((region.conflictPressure||0)*.5+(exposure.defending?0.18:exposure.count?0.07:0)+Math.min(.35,reconstruction*.025));
  s.tradeDisruption+=(targetDisruption-s.tradeDisruption)*clamp(exposure.count?weekScale*.18:weekScale*.04);
  const casualtyShare=exposure.casualties/Math.max(1,region.population||1);
  if(exposure.count){s.warExhaustion=clamp(s.warExhaustion+weekScale*(.0015+casualtyShare*18+s.tradeDisruption*.0015));}
  else s.warExhaustion=Math.max(0,s.warExhaustion-years*.045);
  if(s.warExhaustion>.15)region.stability=Math.max(0,(region.stability??1)-weekScale*(s.warExhaustion-.15)*.00025);
  const output=produceMunitions(region,elapsedDays);s.munitionsOutputValue=output.value;
  region.report ||= {};region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,artilleryRocketsMade:output.rockets,torpedoesMade:output.torpedoes,navalMinesMade:output.navalMines,munitionsSpending:output.spending};
 }
}