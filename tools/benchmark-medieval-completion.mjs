import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { tickMedievalCompletion } from '../js/politics/medievalCompletion.js';

function makeRegion(i) {
  const urban = i % 5 === 0 ? 14000 : i % 3 === 0 ? 6500 : 1800;
  const trade = i % 7 === 0 ? 90 : 18;
  const polityId = `p${i % 120}`;
  return {
    id:`r${i}`, name:`Region ${i}`, population:30000 + (i%9)*5000, wallet:400+(i%11)*80, treasury:60+(i%6)*20,
    isCoastal:i%4===0, stability:0.68,
    governance:{sovereignPolityId:polityId,administrativeControl:0.45+(i%4)*0.1,autonomy:0.15+(i%5)*0.08},
    urbanisation:{urbanPopulation:urban},
    tradeEconomy:{weeklyImports:trade,weeklyExports:trade*1.1,exportIncomeEma:trade*0.6,importSpendEma:trade*0.5,creditLimit:80,debt:10,routeReliabilityEma:0.7},
    medievalCommerce:{finance:{merchantCredit:0.45,depositBanking:0.35,billsOfExchange:0.28,stateCredit:0.42,riskSharing:0.35,creditCrisis:0.03},trade:{caravanNetwork:0.4,merchantDiaspora:0.35,convoying:0.2,commercialLaw:0.42,protectedMarkets:0.45},labour:{mortalityShock:0,labourScarcity:0.08,wagePressure:0.05,bargainingPower:0.12,estateWeakening:0.05},previousPopulation:30000},
    medievalSociety:{paths:{bureaucraticService:0.45,landedRetinues:0.58,revenueAssignments:0.4,clanRetinues:0.35,urbanCivic:urban>6000?0.58:0.2},urban:{guilds:urban>6000?0.58:0.18,council:urban>6000?0.5:0.12,militia:0.3,charterAutonomy:0.2,industrialSpecialisation:0.35},estates:{eliteLandShare:0.42,taxExemption:0.4,hereditaryPower:0.52,privateRetinues:0.5},education:{religiousSchools:0.4,courtSchools:0.38,examinationService:0.28,urbanAcademies:urban>6000?0.45:0.15,technicalSchools:0.25,knowledgeCapacity:urban>6000?0.52:0.3},demographic:{labourScarcity:0.08,wagePressure:0.05,bargainingPower:0.1,lastPopulation:30000}},
    disease:{quarantinePolicy:0.1,effectiveQuarantine:0.05,pathogens:{smallpox:{prevalence:0.001,resistance:0.1,lastDeaths:0},plague:{prevalence:i%97===0?0.04:0,resistance:0.05,lastDeaths:i%97===0?120:0},enteric:{prevalence:0.001,resistance:0.08,lastDeaths:0},respiratory:{prevalence:0.002,resistance:0.1,lastDeaths:0}}},
    religion:{shares:{faith:0.8,folk:0.2},stateReligionId:'faith'}, religiousSeatInfluence:0.25,
    corporateCapital:{financialDepth:0.35,creditorTrust:0.6,investibleWealth:120,nonPerformingShare:0.02,failedFirmPressure:0.01,firms:[]},
    militaryFinance:{weeklyTaxRevenue:8}, army:{personnel:900,permanence:0.28}, breakthroughs:new Set(['writing',...(i%8===0?['gunpowder']:[])]),
  };
}

const regions = Array.from({length:2300},(_,i)=>makeRegion(i));
const polities = Array.from({length:120},(_,i)=>({id:`p${i}`,administration:{accounting:0.5,recordKeeping:0.5,officialdom:0.48,legitimacy:0.62,experience:{recordKeeping:0,accounting:0,officialdom:0}},stateAdministration:{court:{centralisationDrive:0.5}},institutionalPaths:{bureaucraticService:0.45,landedRetinues:0.55}}));
const world={religions:[{id:'faith',name:'Organised Faith',authority:0.55},{id:'folk',name:'Folk Religion',authority:0.05}]};

// Warm-up.
tickMedievalCompletion(regions,polities,world,0,365.2425,()=>0.5);
const timings=[];
for(let y=1;y<=10;y++){
  const t0=performance.now();
  tickMedievalCompletion(regions,polities,world,y*52,365.2425,()=>0.5);
  timings.push(performance.now()-t0);
}
const avg=timings.reduce((a,b)=>a+b,0)/timings.length;
const max=Math.max(...timings);

const urbanRegions=regions.filter(r=>r.urbanisation.urbanPopulation>=6500);
const chartered=urbanRegions.filter(r=>(r.medievalCompletion?.city?.charter||0)>0.2).length;
const autonomousActors=regions.reduce((n,r)=>n+(r.medievalCompletion?.actors?.length||0),0);
const paidTransition=regions.filter(r=>(r.medievalCompletion?.military?.paidForceShare||0)>0.05).length;
const epidemicResponses=regions.filter(r=>(r.medievalCompletion?.epidemic?.cumulativeSocialShock||0)>0).length;

assert.ok(autonomousActors>=regions.length*2,'most regions should develop several autonomous social actors');
assert.ok(chartered>urbanRegions.length*0.2,'commercial cities should develop charter institutions');
assert.ok(paidTransition>regions.length*0.2,'finance-capable states should show a paid-force transition');
assert.ok(epidemicResponses>0,'epidemic shocks should leave social traces');
assert.ok(avg<150,`2300-region medieval completion tick averaged ${avg.toFixed(1)} ms, above the 150 ms world-tick budget by itself`);

console.log(JSON.stringify({regions:regions.length,averageMs:Number(avg.toFixed(2)),maxMs:Number(max.toFixed(2)),actors:autonomousActors,charteredUrbanRegions:chartered,paidTransitionRegions:paidTransition,epidemicResponseRegions:epidemicResponses},null,2));
