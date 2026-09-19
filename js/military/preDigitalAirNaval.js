const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const roman=(n)=>{const t=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let x=Math.max(1,Math.floor(n)),o='';for(const[v,s]of t)while(x>=v){o+=s;x-=v;}return o;};

export const ANTI_AIRCRAFT_GUN_TECH_ID='anti_aircraft_guns';
export const ANALOGUE_AA_PREDICTOR_TECH_ID='analogue_aa_predictor';
export const NAVAL_RADAR_FIRE_CONTROL_TECH_ID='naval_radar_fire_control';
export const SONAR_TECH_ID='sonar_asdic';

function factoryCapacity(region){
  const publicFactories=(region.construction?.assets||[]).filter(a=>a.typeId==='factory'&&(a.condition??1)>.15).reduce((s,a)=>s+Math.max(.2,a.scale||1)*(a.condition??1),0);
  const corporateFactories=(region.corporateInfrastructure?.assets||[]).filter(a=>a.type==='factory'&&a.status==='operational'&&(a.condition??1)>.15).reduce((s,a)=>s+Math.max(.2,a.effectiveCapacity||a.baseCapacity||1)*(a.condition??1),0);
  return publicFactories+corporateFactories;
}
function hasShipyard(region){return (region.construction?.assets||[]).some(a=>['shipyard','naval_base'].includes(a.typeId)&&(a.condition??1)>.2);}
function components(region){return region.industrialPlants?.componentCapability||{};}
function precision(region){return clamp(region.industrialSupply?.capability?.precision_machining||0);}
function inventory(region){region.industrialSupply||={};region.industrialSupply.inventory||={};return region.industrialSupply.inventory;}

export function ensureAirDefenceIndustry(region){
  region.airDefenceIndustry||={designs:[],inventoryByDesign:{},nextSequence:1,experience:0,tooling:null};
  const s=region.airDefenceIndustry;s.designs||=[];s.inventoryByDesign||={};if(!Number.isFinite(s.nextSequence))s.nextSequence=(s.designs.at(-1)?.sequence||0)+1;if(!Number.isFinite(s.experience))s.experience=0;
  return s;
}

export function antiAircraftDesignFrontier(region){
  const c=components(region),gun=clamp(c.gun_system||0),optics=clamp(c.optics||0),electronics=Math.min(.72,clamp(c.electronics||0)),radar=has(region,'radar')?clamp(c.radar_set||0):0;
  const exp=clamp(ensureAirDefenceIndustry(region).experience),quick=has(region,'quick_firing_artillery')?1:0,breech=has(region,'breech_loading_artillery')?1:0;
  const predictor=has(region,ANALOGUE_AA_PREDICTOR_TECH_ID)?clamp(optics*.34+electronics*.36+precision(region)*.20+exp*.10):0;
  return {
    ceiling:clamp(.12+gun*.31+precision(region)*.17+breech*.10),
    traverse:clamp(.10+precision(region)*.24+electronics*.18+exp*.20+quick*.18),
    rateOfFire:clamp(.10+gun*.24+precision(region)*.12+quick*.38+exp*.08),
    fireControl:clamp(.08+optics*.36+predictor*.34+electronics*.12+exp*.10),
    radarDirection:clamp(radar*(has(region,NAVAL_RADAR_FIRE_CONTROL_TECH_ID)||has(region,'radar')?.75:.45)),
    lethality:clamp(.10+gun*.36+quick*.18+predictor*.12+precision(region)*.10),
    reliability:clamp(.42+precision(region)*.22+gun*.12+exp*.18+(has(region,'steelmaking')?.06:0)),
    mobility:clamp(.38+(c.wheeled_chassis||0)*.35+precision(region)*.10),
    predictor,
  };
}

export function currentAntiAircraftDesign(region){return ensureAirDefenceIndustry(region).designs.at(-1)||null;}
export function authoriseAntiAircraftMark(region,{authorisedBy='player',tick=0}={}){
  const s=ensureAirDefenceIndustry(region);if(!has(region,ANTI_AIRCRAFT_GUN_TECH_ID))return {authorised:false,reason:'aa_guns_not_understood'};
  if(factoryCapacity(region)<=0)return {authorised:false,reason:'no_factory'};
  if(s.tooling?.weeksRemaining>0)return {authorised:false,reason:'tooling_in_progress'};
  const seq=s.nextSequence,inv=inventory(region),steelNeed=9+seq*4,machineNeed=7+seq*4,cash=10+seq*7;
  region.stockpile||={};if((region.stockpile.steel||0)<steelNeed)return {authorised:false,reason:'insufficient_steel'};if((inv.machine_components||0)<machineNeed)return {authorised:false,reason:'insufficient_machine_components'};if((region.treasury||0)<cash)return {authorised:false,reason:'insufficient_treasury'};
  region.stockpile.steel-=steelNeed;inv.machine_components-=machineNeed;region.treasury-=cash;
  const design={id:`${region.id||'region'}:anti_aircraft:${seq}`,sequence:seq,name:`Anti-Aircraft Gun Mk ${roman(seq)}`,stats:antiAircraftDesignFrontier(region),authorisedBy,introducedTick:tick,toolingReady:false};
  s.designs.push(design);s.nextSequence=seq+1;s.tooling={designId:design.id,weeksRemaining:5+seq*2,totalWeeks:5+seq*2};return {authorised:true,design,downtimeWeeks:s.tooling.totalWeeks};
}

export function tickAirDefenceIndustry(region,elapsedDays=7){
  const s=ensureAirDefenceIndustry(region),weeks=Math.max(0,elapsedDays)/7;
  if(s.tooling?.weeksRemaining>0){s.tooling.weeksRemaining=Math.max(0,s.tooling.weeksRemaining-weeks);if(s.tooling.weeksRemaining<=0){const d=s.designs.find(x=>x.id===s.tooling.designId);if(d)d.toolingReady=true;s.tooling=null;}}
  return s;
}

export function buildAntiAircraftGun(region,{designId=null}={}){
  const s=ensureAirDefenceIndustry(region);if(factoryCapacity(region)<=0)return null;
  const design=(designId?s.designs.find(d=>d.id===designId):[...s.designs].reverse().find(d=>d.toolingReady))||null;if(!design)return null;
  const inv=inventory(region);region.stockpile||={};const steel=3.4,machine=2.2,cash=2.6;if((region.stockpile.steel||0)<steel||(inv.machine_components||0)<machine||(region.treasury||0)<cash)return null;
  region.stockpile.steel-=steel;inv.machine_components-=machine;region.treasury-=cash;s.inventoryByDesign[design.id]=(s.inventoryByDesign[design.id]||0)+1;s.experience=clamp(s.experience+.0025*(1-s.experience));return design;
}

export function landAirDefenceProfile(region){
  const s=ensureAirDefenceIndustry(region),rows=[];let total=0,weighted={ceiling:0,traverse:0,rateOfFire:0,fireControl:0,radarDirection:0,lethality:0,reliability:0};
  for(const [id,raw] of Object.entries(s.inventoryByDesign)){const count=Math.max(0,Number(raw)||0),d=s.designs.find(x=>x.id===id);if(!d||count<=0)continue;total+=count;rows.push({design:d,count});for(const k of Object.keys(weighted))weighted[k]+=count*(d.stats[k]||0);}
  if(total)for(const k of Object.keys(weighted))weighted[k]/=total;
  const coverage=clamp(Math.log1p(total)/3.4),coordination=clamp(region.telephone?.militaryCoordination||region.telephone?.service||0),radar=weighted.radarDirection||0;
  const effectiveness=total?clamp(coverage*(weighted.lethality*.30+weighted.rateOfFire*.18+weighted.traverse*.15+weighted.fireControl*.20+weighted.ceiling*.08+weighted.reliability*.09)*(1+coordination*.14+radar*.18)):0;
  return {total,coverage,effectiveness,...weighted,models:rows};
}

export function airDefenceEngagementRisk(region,aircraft=null){
  const aa=landAirDefenceProfile(region),legacyMg=has(region,'machine_guns')?.07:0,legacyImprovised=!aa.total?(has(region,'quick_firing_artillery')?.035:has(region,'breech_loading_artillery')?.015:0):0;
  const signature=clamp(aircraft?.designStats?.radarSignature??.58,.18,1),speed=clamp(aircraft?.designStats?.speed||.25),manoeuvre=clamp(aircraft?.designStats?.manoeuvrability||0);
  const radarCue=aa.radarDirection*signature*.11,trackingPenalty=speed*.045+manoeuvre*.025;
  return clamp(.01+legacyMg+legacyImprovised+aa.effectiveness*.31+radarCue-trackingPenalty,0,.62);
}

export function tickAntiAircraftBreakthrough(region,rng=Math.random,elapsedDays=7){
  region.unlockedTechIds||=new Set();const years=Math.max(.0001,elapsedDays/365.2425),c=components(region),events=[];
  if(!has(region,ANTI_AIRCRAFT_GUN_TECH_ID)&&has(region,'military_aviation')&&has(region,'breech_loading_artillery')&&factoryCapacity(region)>0){const pressure=clamp((region.aviation?.flightExperience||0)/300),annual=.006+pressure*.04+clamp(c.gun_system||0)*.025+precision(region)*.018;if(rng()<1-Math.pow(1-clamp(annual,0,.18),years)){region.unlockedTechIds.add(ANTI_AIRCRAFT_GUN_TECH_ID);events.push({type:'military_breakthrough',techId:ANTI_AIRCRAFT_GUN_TECH_ID,title:'Purpose-built anti-aircraft guns'});}}
  if(has(region,ANTI_AIRCRAFT_GUN_TECH_ID)&&!has(region,ANALOGUE_AA_PREDICTOR_TECH_ID)&&(c.optics||0)>.35&&(c.electronics||0)>.24){const annual=.004+clamp(c.optics||0)*.025+clamp(c.electronics||0)*.018;if(rng()<1-Math.pow(1-clamp(annual,0,.14),years)){region.unlockedTechIds.add(ANALOGUE_AA_PREDICTOR_TECH_ID);events.push({type:'military_breakthrough',techId:ANALOGUE_AA_PREDICTOR_TECH_ID,title:'Analogue anti-aircraft predictors'});}}
  return events;
}

export function preDigitalNavalSystemsFrontier(region,shipOrClass={}){
  const ship=typeof shipOrClass==='object'?shipOrClass:{designId:shipOrClass},base=ship.designStats||ship.stats||{},c=components(region),p=precision(region);
  const hull=clamp(c.hull_fabrication||p*.4),engine=clamp(c.engine||p*.3),trans=clamp(c.transmission||p*.25),gun=clamp(c.gun_system||p*.3),armour=clamp(c.armour_plate||0),optics=clamp(c.optics||0),electronics=Math.min(.72,clamp(c.electronics||0)),radar=has(region,'radar')?clamp(c.radar_set||0):0;
  const aa=antiAircraftDesignFrontier(region),sub=ship.designId==='submarine'||base.submersible;
  const torpedo=clamp(gun*.22+p*.23+engine*.12+electronics*.14+(sub?.16:.06));
  const sonar=has(region,SONAR_TECH_ID)?clamp(optics*.08+electronics*.42+p*.18+(region.earlyModernMilitary?.naval?.readiness||0)*.16):0;
  const analogueFireControl=clamp(optics*.44+electronics*.26+p*.18+(region.earlyModernMilitary?.naval?.readiness||0)*.12);
  const radarFireControl=has(region,NAVAL_RADAR_FIRE_CONTROL_TECH_ID)?clamp(radar*.56+analogueFireControl*.30+electronics*.14):0;
  const dualPurpose=clamp(aa.rateOfFire*.20+aa.traverse*.26+aa.fireControl*.24+gun*.18+electronics*.12);
  return {
    propulsionEfficiency:clamp(engine*.47+trans*.27+hull*.10+p*.16),
    hullStrength:clamp(hull*.48+armour*.24+p*.18),
    armourScheme:clamp(armour*.58+hull*.20+p*.12),
    mainBattery:clamp(gun*.55+optics*.16+p*.14+analogueFireControl*.15),
    secondaryBattery:clamp(gun*.38+aa.rateOfFire*.26+optics*.16+p*.12),
    dualPurposeBattery:dualPurpose,
    aa:clamp(aa.lethality*.22+aa.rateOfFire*.18+aa.traverse*.17+aa.fireControl*.18+dualPurpose*.15+radarFireControl*.10),
    analogueFireControl,radar:radarFireControl,sonar,torpedo,
    damageControl:clamp(hull*.20+electronics*.12+p*.16+(region.massEducation?.literacy||0)*.16+(region.earlyModernMilitary?.naval?.readiness||0)*.24),
    submarineStealth:sub?clamp(hull*.14+engine*.16+p*.22+electronics*.12+(region.earlyModernMilitary?.naval?.readiness||0)*.18):0,
  };
}

export function navalAirDefenceProfile(region,ship){
  const s=ship?.preDigitalSystems||preDigitalNavalSystemsFrontier(region,ship||{}),guns=Math.max(0,Number(ship?.gunCapacity||ship?.designStats?.gunCapacity)||0),scale=clamp(Math.log1p(guns)/3.2);
  return {effectiveness:clamp(s.aa*scale),dualPurpose:s.dualPurposeBattery||0,radar:s.radar||0,fireControl:s.analogueFireControl||0};
}

export function authoriseNavalSystemsRefit(region,ship,{authorisedBy='player'}={}){
  if(!ship)return {authorised:false,reason:'no_ship'};if(!hasShipyard(region))return {authorised:false,reason:'no_shipyard'};if(ship.pendingPreDigitalRefit)return {authorised:false,reason:'refit_in_progress'};
  const inv=inventory(region);region.stockpile||={};const tier=Math.max(1,Number(ship.designStats?.tier)||Number(ship.tier)||5),steel=4+tier*1.5,machine=3+tier*.9,cash=5+tier*1.2;
  if((region.stockpile.steel||0)<steel||(inv.machine_components||0)<machine||(region.treasury||0)<cash)return {authorised:false,reason:'insufficient_resources'};
  region.stockpile.steel-=steel;inv.machine_components-=machine;region.treasury-=cash;ship.pendingPreDigitalRefit={snapshot:preDigitalNavalSystemsFrontier(region,ship),weeksRemaining:3+tier*.8,totalWeeks:3+tier*.8,authorisedBy};return {authorised:true,weeks:ship.pendingPreDigitalRefit.totalWeeks};
}

export function tickNavalSystemsRefit(ship,elapsedDays=7){
  if(!ship?.pendingPreDigitalRefit)return false;ship.pendingPreDigitalRefit.weeksRemaining=Math.max(0,ship.pendingPreDigitalRefit.weeksRemaining-Math.max(0,elapsedDays)/7);if(ship.pendingPreDigitalRefit.weeksRemaining>0)return false;ship.preDigitalSystems={...ship.pendingPreDigitalRefit.snapshot};ship.preDigitalRefitGeneration=(ship.preDigitalRefitGeneration||0)+1;ship.pendingPreDigitalRefit=null;return true;
}
