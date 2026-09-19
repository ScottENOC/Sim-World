const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const PERSONNEL_TYPES=Object.freeze({
  PILOT:'pilot',AIRCREW:'aircrew',SAILOR:'sailor',NAVAL_TECH:'naval_technical',NAVAL_OFFICER:'naval_officer',
});

const TRAINING_DAYS=Object.freeze({pilot:240,aircrew:120,sailor:90,naval_technical:180,naval_officer:270});
const INITIAL_EXPERIENCE=Object.freeze({pilot:.04,aircrew:.06,sailor:.08,naval_technical:.10,naval_officer:.12});

function emptyPool(){return{available:0,experienceMass:0};}
export function ensureQualifiedPersonnel(region){
  region.qualifiedMilitaryPersonnel ||= {version:1,pools:{},training:{},bootstrapComplete:false,lastTrainingCost:0,lastTrainingFuel:0};
  const s=region.qualifiedMilitaryPersonnel;s.pools ||= {};s.training ||= {};
  for(const type of Object.values(PERSONNEL_TYPES)){s.pools[type] ||= emptyPool();s.training[type] ||= {trainees:0};}
  return s;
}
function pool(region,type){return ensureQualifiedPersonnel(region).pools[type]||emptyPool();}
function averageExperience(p){return p.available>1e-9?clamp(p.experienceMass/p.available):0;}
function addToPool(region,type,count,experience=0){
  const p=pool(region,type),n=Math.max(0,Number(count)||0);if(n<=0)return;
  p.available+=n;p.experienceMass+=n*clamp(experience);
}
function takeFromPool(region,type,count){
  const p=pool(region,type),n=Math.min(Math.max(0,Number(count)||0),p.available),experience=averageExperience(p);
  p.available-=n;p.experienceMass=Math.max(0,p.experienceMass-n*experience);return{count:n,experience};
}
function returnAssignment(region,type,count,experience){addToPool(region,type,count,experience);}

export function aircraftCrewRequirements(aircraft){
  const role=aircraft?.role||'recon';
  if(aircraft?.ownerType!=='military')return{pilot:0,aircrew:0};
  if(role==='bomber')return{pilot:1,aircrew:4};
  if(role==='transport')return{pilot:2,aircrew:2};
  if(role==='recon')return{pilot:1,aircrew:1};
  return{pilot:1,aircrew:0};
}
export function shipCrewRequirements(ship){
  const total=Math.max(1,Math.round(ship?.crewRequired??ship?.designStats?.crew??({basic_war_boat:8,galley:18,ocean_sailing_warship:20,gunpowder_sailing_warship:24,frigate:30,ship_of_line:48,paddle_steam_warship:34,steam_frigate:36,ironclad:40,steel_warship:42,destroyer:30,fleet_tug:18,submarine:18,dreadnought:80}[ship?.designId]||12)));
  const industrial=['paddle_steam_warship','steam_frigate','ironclad','steel_warship','destroyer','fleet_tug','submarine','dreadnought'].includes(ship?.designId);
  const technical=industrial?Math.max(1,Math.round(total*(ship?.designId==='submarine'?.30:.22))):Math.max(0,Math.round(total*.05));
  const officers=Math.max(1,Math.round(total*(ship?.designId==='dreadnought'?.09:.06)));
  return{sailor:Math.max(0,total-technical-officers),naval_technical:technical,naval_officer:officers,total};
}

export function assignAircraftCrew(region,aircraft,{bootstrap=false}={}){
  if(!aircraft||aircraft.ownerType!=='military')return null;const need=aircraftCrewRequirements(aircraft),a=aircraft.crewAssignment||{pilots:0,pilotExperience:0,aircrew:0,aircrewExperience:0};
  if(bootstrap&&!aircraft.crewAssignment){addToPool(region,PERSONNEL_TYPES.PILOT,need.pilot,.12);addToPool(region,PERSONNEL_TYPES.AIRCREW,need.aircrew,.10);}
  const pilotGap=Math.max(0,need.pilot-(a.pilots||0)),crewGap=Math.max(0,need.aircrew-(a.aircrew||0)),pilots=takeFromPool(region,PERSONNEL_TYPES.PILOT,pilotGap),crew=takeFromPool(region,PERSONNEL_TYPES.AIRCREW,crewGap);
  const oldPilots=a.pilots||0,oldCrew=a.aircrew||0;a.pilotExperience=(oldPilots*a.pilotExperience+pilots.count*pilots.experience)/Math.max(1e-9,oldPilots+pilots.count);a.aircrewExperience=(oldCrew*a.aircrewExperience+crew.count*crew.experience)/Math.max(1e-9,oldCrew+crew.count);a.pilots=oldPilots+pilots.count;a.aircrew=oldCrew+crew.count;
  aircraft.crewAssignment=a;aircraft.pilotExperience=Math.max(aircraft.pilotExperience||0,a.pilotExperience||0);return a;
}
export function assignShipCrew(region,ship,{bootstrap=false}={}){
  if(!ship)return null;const need=shipCrewRequirements(ship),a=ship.crewAssignment||{sailors:0,sailorExperience:0,technical:0,technicalExperience:0,officers:0,officerExperience:0};
  if(bootstrap&&!ship.crewAssignment){addToPool(region,PERSONNEL_TYPES.SAILOR,need.sailor,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer,.16);}
  for(const [key,type,required,expKey] of [['sailors',PERSONNEL_TYPES.SAILOR,need.sailor,'sailorExperience'],['technical',PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical,'technicalExperience'],['officers',PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer,'officerExperience']]){const old=a[key]||0,taken=takeFromPool(region,type,Math.max(0,required-old));a[expKey]=(old*(a[expKey]||0)+taken.count*taken.experience)/Math.max(1e-9,old+taken.count);a[key]=old+taken.count;}
  ship.crewRequired=need.total;ship.crewAssignment=a;return a;
}

export function aircraftCrewReadiness(aircraft){
  if(aircraft?.ownerType!=='military')return 1;const need=aircraftCrewRequirements(aircraft),a=aircraft?.crewAssignment||{};
  const pilotFill=need.pilot?clamp((a.pilots||0)/need.pilot):1,crewFill=need.aircrew?clamp((a.aircrew||0)/need.aircrew):1;
  const fill=pilotFill*(need.aircrew?(.72+.28*crewFill):1),experience=clamp((a.pilotExperience||aircraft?.pilotExperience||0)*.68+(a.aircrewExperience||0)*.32);
  return clamp(fill*(.72+.28*experience));
}
export function shipCrewReadiness(ship){
  const need=shipCrewRequirements(ship),a=ship?.crewAssignment||{};
  const sailorFill=need.sailor?clamp((a.sailors||0)/need.sailor):1,techFill=need.naval_technical?clamp((a.technical||0)/need.naval_technical):1,officerFill=need.naval_officer?clamp((a.officers||0)/need.naval_officer):1;
  const fill=sailorFill*.48+techFill*.30+officerFill*.22,experience=clamp((a.sailorExperience||0)*.42+(a.technicalExperience||0)*.30+(a.officerExperience||0)*.28);
  return clamp(fill*(.70+.30*experience));
}
export function shipTechnicalReadiness(ship){
  const need=shipCrewRequirements(ship),a=ship?.crewAssignment||{};if(!need.naval_technical)return 1;
  return clamp((a.technical||0)/need.naval_technical)*(.72+.28*clamp(a.technicalExperience||0));
}

export function recordAircraftCrewPractice(aircraft,intensity=1){
  const a=aircraft?.crewAssignment;if(!a)return;const gain=.004*Math.max(0,intensity);
  a.pilotExperience=clamp((a.pilotExperience||0)+gain);a.aircrewExperience=clamp((a.aircrewExperience||0)+gain*.72);aircraft.pilotExperience=a.pilotExperience;
}
export function recordShipCrewPractice(ship,weeks=1,{combat=false}={}){
  const a=ship?.crewAssignment;if(!a)return;const gain=Math.max(0,weeks)*(combat?.0018:.00045);
  a.sailorExperience=clamp((a.sailorExperience||0)+gain);a.technicalExperience=clamp((a.technicalExperience||0)+gain*.88);a.officerExperience=clamp((a.officerExperience||0)+gain*(combat?1.18:.82));
}

export function resolveAircraftCrewLoss(region,aircraft,{rng=Math.random,enemyTerritory=false}={}){
  const a=aircraft?.crewAssignment;if(!a)return{survivors:0,lost:0};
  const escape=clamp(.34+(aircraft?.condition||0)*.22-(enemyTerritory?.10:0)),pilotSurvive=rng()<escape?1:0,crewSurvive=Math.round((a.aircrew||0)*clamp(escape*.82));
  if(pilotSurvive)returnAssignment(region,PERSONNEL_TYPES.PILOT,pilotSurvive,a.pilotExperience||0);
  if(crewSurvive)returnAssignment(region,PERSONNEL_TYPES.AIRCREW,crewSurvive,a.aircrewExperience||0);
  const total=(a.pilots||0)+(a.aircrew||0),survivors=pilotSurvive+crewSurvive;aircraft.crewAssignment=null;return{survivors,lost:Math.max(0,total-survivors)};
}
export function applyShipCrewCasualties(ship,severity,{rng=Math.random}={}){
  const a=ship?.crewAssignment;if(!a)return 0;const rate=clamp(Math.max(0,severity)*(.08+rng()*.16),0,.65);let lost=0;
  for(const key of ['sailors','technical','officers']){const n=Math.max(0,a[key]||0),cas=Math.min(n,Math.floor(n*rate+rng()*.75));a[key]=n-cas;lost+=cas;}
  return lost;
}

function literacy(region){return clamp(region?.massEducation?.literacy??region?.education?.literacy??region?.literacy??.15);}
export function civilianPilotBase(region){
  const aircraft=(region?.aviation?.aircraft||[]).filter(a=>a.ownerType==='civilian'&&a.status!=='destroyed').length,flights=Math.max(0,Number(region?.aviation?.flightExperience)||0);
  const powered=Boolean(region?.unlockedTechIds?.has?.('powered_flight')||aircraft>0||flights>0);if(!powered)return 0;
  // Civilian flying creates a much broader basic airmanship/instructor base than the combat-qualified military pool.
  return Math.max(2,aircraft*1.7+Math.sqrt(flights)*.55);
}
function pilotTrainingDays(region){
  const civilian=civilianPilotBase(region);return TRAINING_DAYS.pilot/(1+Math.min(.48,civilian/80));
}
function trainingCapacity(region,type){
  const pop=Math.max(0,Number(region?.population)||0),lit=literacy(region),military=Math.max(0,Number(region?.militaryStrategy?.spendingPriority)||0);
  if(type==='pilot'||type==='aircrew'){
    const airfields=(region?.construction?.assets||[]).filter(a=>a.typeId==='airfield'&&(a.condition??1)>.45).reduce((s,a)=>s+Math.max(.5,a.scale||1),0);if(!airfields)return 0;
    const civilian=type==='pilot'?civilianPilotBase(region):0;
    // Civilian instructors expand access to flight 101; military infrastructure still limits combat conversion throughput.
    const base=type==='pilot'?10+Math.min(34,civilian*.55):28;
    return airfields*base*(.45+lit*.55)*(1+military*.35);
  }
  const maritime=Math.max(.2,Math.min(1.5,Math.log10(10+pop)/5));const ports=(region?.construction?.assets||[]).filter(a=>['harbour','naval_base','shipyard'].includes(a.typeId)&&(a.condition??1)>.45).reduce((s,a)=>s+Math.max(.4,a.scale||1),0);if(!ports)return 0;
  const base=type==='sailor'?90:type==='naval_technical'?24:10;return ports*base*maritime*(.45+lit*.55)*(1+military*.30);
}
function demandFromPlatforms(aircraft=[],ships=[]){
  const d={pilot:0,aircrew:0,sailor:0,naval_technical:0,naval_officer:0};
  for(const a of aircraft){if(a.status==='destroyed'||a.ownerType!=='military')continue;const n=aircraftCrewRequirements(a);d.pilot+=n.pilot;d.aircrew+=n.aircrew;}
  for(const s of ships){const n=shipCrewRequirements(s);d.sailor+=n.sailor;d.naval_technical+=n.naval_technical;d.naval_officer+=n.naval_officer;}
  return d;
}
function assignedCounts(aircraft=[],ships=[]){const a={pilot:0,aircrew:0,sailor:0,naval_technical:0,naval_officer:0};for(const x of aircraft){a.pilot+=x.crewAssignment?.pilots||0;a.aircrew+=x.crewAssignment?.aircrew||0;}for(const s of ships){a.sailor+=s.crewAssignment?.sailors||0;a.naval_technical+=s.crewAssignment?.technical||0;a.naval_officer+=s.crewAssignment?.officers||0;}return a;}

function tickTraining(region,aircraft,ships,elapsedDays){
  const state=ensureQualifiedPersonnel(region),demand=demandFromPlatforms(aircraft,ships),assigned=assignedCounts(aircraft,ships),years=Math.max(0,elapsedDays)/DAYS_PER_YEAR;let cost=0,fuel=0;
  for(const type of Object.values(PERSONNEL_TYPES)){
    const p=pool(region,type),t=state.training[type],reserveTarget=demand[type]*.18+({pilot:2,aircrew:4,sailor:8,naval_technical:3,naval_officer:2}[type]||0),shortage=Math.max(0,demand[type]+reserveTarget-assigned[type]-p.available-t.trainees),annualCap=trainingCapacity(region,type);
    const entrants=Math.min(shortage,annualCap*years);t.trainees+=entrants;
    const trainingDays=type==='pilot'?pilotTrainingDays(region):TRAINING_DAYS[type];
    const graduate=Math.min(t.trainees,t.trainees*Math.max(0,elapsedDays)/trainingDays);if(graduate>0){t.trainees-=graduate;addToPool(region,type,graduate,INITIAL_EXPERIENCE[type]);}
    cost+=(entrants+graduate)*({pilot:8,aircrew:3,sailor:.5,naval_technical:2,naval_officer:3.5}[type]||1);if(type==='pilot')fuel+=(entrants+graduate)*.16;
  }
  const treasury=Math.max(0,region.treasury||0),fuelStock=Math.max(0,region.stockpile?.aviation_fuel||0),cashFraction=cost?Math.min(1,treasury/cost):1,fuelFraction=fuel?Math.min(1,fuelStock/fuel):1,fraction=Math.min(cashFraction,fuelFraction);
  if(fraction<1){for(const t of Object.values(state.training))t.trainees*=.985+.015*fraction;cost*=fraction;fuel*=fraction;}
  region.treasury=Math.max(0,treasury-cost);if(region.stockpile)region.stockpile.aviation_fuel=Math.max(0,fuelStock-fuel);state.lastTrainingCost=cost;state.lastTrainingFuel=fuel;
}

export function tickAirPersonnel(region,aircraft=[],elapsedDays=7){
  const state=ensureQualifiedPersonnel(region),military=aircraft.filter(a=>a.ownerType==='military'&&a.status!=='destroyed');
  if(!state.bootstrapComplete){for(const a of military)assignAircraftCrew(region,a,{bootstrap:true});state.airBootstrapComplete=true;}
  for(const a of military)if(!a.crewAssignment||aircraftCrewReadiness(a)<.99)assignAircraftCrew(region,a);
  tickTraining(region,military,[],elapsedDays);return state;
}
export function tickNavalPersonnel(region,fleets=[],weeks=1){
  const state=ensureQualifiedPersonnel(region),ships=fleets.flatMap(f=>f.ships||[]);
  if(!state.navalBootstrapComplete){for(const s of ships)assignShipCrew(region,s,{bootstrap:true});state.navalBootstrapComplete=true;}
  for(const s of ships){if(!s.crewAssignment||shipCrewReadiness(s)<.99)assignShipCrew(region,s);}
  tickTraining(region,[],ships,Math.max(0,weeks)*7);state.bootstrapComplete=Boolean(state.airBootstrapComplete&&state.navalBootstrapComplete);return state;
}

export function qualifiedPersonnelSummary(region,aircraft=[],ships=[]){
  const s=ensureQualifiedPersonnel(region),demand=demandFromPlatforms(aircraft,ships),assigned=assignedCounts(aircraft,ships);const pools={};
  for(const type of Object.values(PERSONNEL_TYPES)){const p=pool(region,type);pools[type]={available:p.available,averageExperience:averageExperience(p),trainees:s.training[type]?.trainees||0,required:demand[type]||0,assigned:assigned[type]||0};}
  return{pools,civilianPilotBase:civilianPilotBase(region),lastTrainingCost:s.lastTrainingCost||0,lastTrainingFuel:s.lastTrainingFuel||0};
}
