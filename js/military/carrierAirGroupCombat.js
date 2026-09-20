import { carrierLaunchAssessment } from './carrierAviation.js?v=20260920-carrier-combat1';
import { airborneEarlyWarningSupport } from './airborneEarlyWarning.js?v=20260920-carrier-combat1';
import { applyShipHit } from './navalDamage.js?v=20260919-damage1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function embarked(region,fleet){return(region?.aviation?.aircraft||[]).filter(a=>a.status!=='destroyed'&&a.baseType==='carrier'&&a.baseFleetId===fleet?.id&&(a.condition??1)>=.42&&(a.fuel??1)>.08);}
function carrierShip(fleet,aircraft){return(fleet?.ships||[]).find(s=>s.id===aircraft.carrierShipId&&s.carrierFacilities)||null;}
function launchReady(region,fleet,aircraft){const ship=carrierShip(fleet,aircraft);if(!ship)return null;const a=carrierLaunchAssessment(region,aircraft,fleet,ship);return a.possible?{aircraft,ship,assessment:a}:null;}
function combatStats(a){const s=a.designStats||{};return{firepower:clamp(s.firepower||.18),manoeuvrability:clamp(s.manoeuvrability||.18),payload:clamp(s.payload||0),range:clamp(s.range||.25),radar:clamp(s.radarCapability||0),reliability:clamp(s.reliability||.5)};}
function readiness(row){const a=row.aircraft,s=combatStats(a);return clamp((a.condition??1)*.34+(a.fuel??1)*.12+row.assessment.sortieReadiness*.30+s.reliability*.14+Math.min(.1,(a.pilotExperience||0)*.002));}

export function carrierAirGroupSummary(region,fleet){
  const rows=embarked(region,fleet).map(a=>launchReady(region,fleet,a)).filter(Boolean),aew=airborneEarlyWarningSupport(region,fleet?.id);
  let cap=0,strike=0,recon=0,ready=0;
  for(const row of rows){const a=row.aircraft,s=combatStats(a),r=readiness(row);ready+=r;
    if(['fighter','interceptor'].includes(a.role))cap+=r*(s.firepower*.42+s.manoeuvrability*.34+s.radar*.16+.08);
    if(a.role==='bomber')strike+=r*(s.payload*.58+s.firepower*.18+s.range*.14+.10);
    if(a.role==='fighter')strike+=r*(s.payload*.18+s.firepower*.12);
    if(['recon','airborne_early_warning'].includes(a.role))recon+=r*(s.range*.28+s.radar*.42+.14);
  }
  const detectionBonus=clamp(recon*.045+aew.radarCoverage*.24+aew.tracking*.13,0,.34);
  const commandBonus=clamp(aew.commandAndControl*.20,0,.20);
  return{aircraft:rows.length,capStrength:cap,strikeStrength:strike,reconStrength:recon,detectionBonus,commandBonus,aew,sortieReadiness:rows.length?ready/rows.length:0};
}

export function carrierDetectionBonus(region,fleet){return carrierAirGroupSummary(region,fleet).detectionBonus;}

function loseAircraft(region,fleet,roleFilter,rng){
  const candidates=embarked(region,fleet).filter(a=>roleFilter(a));if(!candidates.length)return null;
  const a=candidates[Math.min(candidates.length-1,Math.floor(rng()*candidates.length))];a.status='destroyed';a.condition=0;return a;
}
function damageShip(fleet,power,rng){
  const ships=(fleet?.ships||[]).filter(s=>(s.condition??1)>.05);if(!ships.length)return null;
  // Carriers are high-value, conspicuous targets once an air strike reaches the fleet.
  const carriers=ships.filter(s=>s.carrierFacilities),pool=carriers.length&&rng()<.34?carriers:ships;
  const ship=pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))];
  const damage=clamp(.07+power*.16+rng()*.09,.05,.34);applyShipHit(ship,damage,{rng});return{shipId:ship.id,classLabel:ship.classLabel,damage,carrier:Boolean(ship.carrierFacilities)};
}
function consumeSortie(a){a.fuel=clamp((a.fuel??1)-.10);a.totalFlights=(a.totalFlights||0)+1;a.pilotExperience=(a.pilotExperience||0)+.4;}

export function resolveCarrierAirExchange(attacker,defender,regionsById,rng=Math.random){
  const ar=regionsById.get(attacker?.ownerRegionId),dr=regionsById.get(defender?.ownerRegionId);
  if(!ar||!dr)return{attacker:null,defender:null};
  const a=carrierAirGroupSummary(ar,attacker),d=carrierAirGroupSummary(dr,defender);
  const result={attacker:{summary:a,aircraftLost:[],shipHits:[]},defender:{summary:d,aircraftLost:[],shipHits:[]}};
  const exchange=(origin,fleet,own,enemyRegion,enemyFleet,enemy,ownResult,enemyResult)=>{
    if(own.strikeStrength<=.02)return;
    const capScreen=enemy.capStrength*(1+enemy.commandBonus),strikeEscort=own.capStrength*.36*(1+own.commandBonus);
    const penetration=clamp(.18+own.strikeStrength*.28+strikeEscort*.16-capScreen*.20,0,.86);
    for(const aircraft of embarked(origin,fleet))if(['fighter','bomber'].includes(aircraft.role))consumeSortie(aircraft);
    const airLossChance=clamp(.04+capScreen*.10-strikeEscort*.04,0,.42);
    if(rng()<airLossChance){const lost=loseAircraft(origin,fleet,x=>['fighter','bomber'].includes(x.role),rng);if(lost)ownResult.aircraftLost.push(lost.id);}
    if(rng()<penetration){const hit=damageShip(enemyFleet,own.strikeStrength*(.7+own.commandBonus),rng);if(hit)enemyResult.shipHits.push(hit);}
  };
  exchange(ar,attacker,a,dr,defender,d,result.attacker,result.defender);
  exchange(dr,defender,d,ar,attacker,a,result.defender,result.attacker);
  return result;
}

export function carrierCombatPowerMultiplier(region,fleet){const s=carrierAirGroupSummary(region,fleet);return 1+clamp(s.capStrength*.045+s.strikeStrength*.075+s.commandBonus,0,.36);}
