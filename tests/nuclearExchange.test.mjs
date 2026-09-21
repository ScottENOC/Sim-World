import assert from 'node:assert/strict';
import { resolveNuclearExchange, tickNuclearAftermath, tickNuclearExchange } from '../js/military/nuclearExchange.js';

function region(id, polity, opts={}) {
  return {
    id, name:id.toUpperCase(), polityId:polity, governance:{sovereignPolityId:polity},
    demographics:{children:200000,workingAge:600000,elderly:200000}, population:1000000,
    stability:.8, stockpile:{food:100000}, urbanisation:{share:opts.urban ?? .5}, infrastructure:{development:.6}, report:{},
    nuclearRisk: opts.nuclear === false ? {nuclearPower:false,destructiveCapacity:0,secureSecondStrike:0,annualCatastrophicExchangeRisk:0,periodExchangeProbability:0} : {
      nuclearPower:true, destructiveCapacity:opts.capacity ?? .75, secureSecondStrike:opts.secondStrike ?? .7,
      annualCatastrophicExchangeRisk:opts.risk ?? .12, periodExchangeProbability:opts.periodRisk ?? 1,
    },
    nuclearForces:{operationalWarheads:200,reserveWarheads:80}, nuclearWeapons:{operationalWarheads:200},
  };
}

{
  const a=region('a','a'), b=region('b','b',{nuclear:false});
  const result=resolveNuclearExchange([a,b],{attackerPolityId:'a',defenderPolityId:'b'},1,()=>0);
  assert.equal(result,null,'a nuclear exchange requires nuclear capability on both sides of the war');
}

{
  const a=region('a','a',{secondStrike:.8}), b=region('b','b',{secondStrike:.75});
  const beforeA=a.population,beforeB=b.population;
  const event=resolveNuclearExchange([a,b],{attackerPolityId:'a',defenderPolityId:'b'},10,()=>0);
  assert.ok(event,'extreme deterministic risk draw should resolve an exchange');
  assert.ok(['limited','regional','major'].includes(event.scale));
  assert.ok(a.population<beforeA&&b.population<beforeB,'both sides should suffer direct losses when retaliation survives');
  assert.ok(a.nuclearAftermath.fallout>0&&b.nuclearAftermath.infrastructureDamage>0,'exchange should create persistent physical aftermath');
  assert.ok(a.nuclearForces.operationalWarheads<200&&b.nuclearForces.operationalWarheads<200,'used arsenals should be depleted');
  assert.ok(event.retaliationFraction>0,'secure second strike should preserve retaliatory capability');
}

{
  const secure=region('secure','s',{secondStrike:.9});
  const fragile=region('fragile','f',{secondStrike:.05});
  const event=resolveNuclearExchange([secure,fragile],{attackerPolityId:'s',defenderPolityId:'f'},20,()=>0);
  assert.ok(event.retaliationFraction<event.initialForceFraction*.5,'fragile second strike should sharply constrain retaliation');
}

{
  const a=region('a','a'), b=region('b','b');
  const war={attackerPolityId:'a',defenderPolityId:'b'};
  const events=tickNuclearExchange([a,b],[war],30,7,()=>0);
  assert.equal(events.length,1);
  assert.equal(war.nuclearExchangeResolved,true,'a war should not repeatedly roll a fresh first exchange every economy tick');
  assert.equal(tickNuclearExchange([a,b],[war],31,7,()=>0).length,0);
}

{
  const a=region('a','a');
  a.nuclearAftermath={fallout:.5,sootExposure:.4,globalSootShock:.3,foodSystemShock:.4,infrastructureDamage:.5};
  const before=a.population,food=a.stockpile.food,fallout=a.nuclearAftermath.fallout;
  tickNuclearAftermath([a],365.2425);
  assert.ok(a.population<before,'fallout and soot should cause continuing post-exchange mortality');
  assert.equal(a.stockpile.food,food,'nuclear winter should reduce food production rather than directly delete existing reserves');
  assert.ok(a.nuclearAftermath.fallout<fallout,'fallout burden should decay rather than remain permanent');
  assert.ok(a.report.nuclearAftermath,'aftermath should remain visible to advisor/reporting systems');
}

console.log('nuclearExchange tests passed');
