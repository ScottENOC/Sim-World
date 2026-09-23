import assert from 'node:assert/strict';
import {
  RESOURCE_BOSS_STATES,
  assessRegionalResourceDepletion,
  assessResourceDepletionScope,
  advanceResourceDepletionProof,
  tickResourceDepletionFinalBoss,
} from '../js/core/resourceDepletionBoss.js';

function region(id,polity,{controlled=true,population=1_000_000,alternatives=false}={}){
  const good=controlled;
  return {
    id,name:id,population,governance:{sovereignPolityId:polity},
    circularEconomy:{
      materialSecurity:good?.82:.34,circularityRate:good?.84:.14,virginDependence:good?.16:.86,durableControlMargin:good?.82:.31,plasticSubstitution:alternatives?.90:.10,
      capability:{closedLoop:good?.85:.10,urbanMining:good?.72:.05,substitution:good?.74:.08,ecodesign:good?.78:.12,recovery:good?.88:.16},
      inUse:{copper:100,steel:500,lithium:40},scrap:{copper:10,steel:40,lithium:5},landfill:{copper:30,steel:60,lithium:10},
      materials:{
        copper:{added:8,retired:7,recovered:6.5,reserveFraction:good?.08:.05,secondaryShare:good?.82:.12,depletionPressure:good?.10:.70,substitutionPotential:good?.62:.15,security:good?.78:.28},
        steel:{added:20,retired:18,recovered:17,reserveFraction:good?.12:.08,secondaryShare:good?.88:.18,depletionPressure:good?.07:.55,substitutionPotential:good?.68:.22,security:good?.84:.35},
        lithium:{added:4,retired:3.5,recovered:3.1,reserveFraction:good?.04:.02,secondaryShare:good?.78:.09,depletionPressure:good?.16:.82,substitutionPotential:good?.68:.20,security:good?.72:.22},
      },
    },
    industrialMaterials:alternatives?{cumulativePolymerUse:2,cumulativeBiomaterialUse:12,cumulativeConventionalFallback:8}:{cumulativePolymerUse:20,cumulativeBiomaterialUse:0,cumulativeConventionalFallback:0},
  };
}

{
  const r=region('closed-loop','a',{controlled:true,alternatives:true});
  const a=assessRegionalResourceDepletion(r);
  assert.equal(a.controlled,true,'near-exhausted virgin reserves should not fail a mature closed-loop economy');
  assert.ok(a.virginDependence<.25);
  assert.ok(a.polymerAlternativeShare>.8,'bio/conventional polymer substitutes should count as demonstrated flexibility');
}

{
  const r=region('linear','a',{controlled:false});
  const a=assessRegionalResourceDepletion(r);
  assert.equal(a.controlled,false,'a linear economy running down critical reserves should fail resource control');
  assert.ok(a.maxDepletionPressure>.6);
  assert.ok(a.criticalSecurityFloor<.3);
}

{
  const dominant=region('dominant','a',{controlled:true,population:10_000_000,alternatives:true});
  const minor=region('minor','b',{controlled:false,population:1_000});
  minor.circularEconomy.inUse={copper:.01};minor.circularEconomy.scrap={};minor.circularEconomy.landfill={};
  minor.circularEconomy.materials={copper:{added:.001,retired:0,recovered:0,reserveFraction:.2,secondaryShare:0,depletionPressure:.3,substitutionPotential:.1,security:.3}};
  const scope=assessResourceDepletionScope([dominant,minor]);
  assert.ok(scope.margin>.68,'a tiny laggard should not outweigh almost all controlled material throughput');
  assert.ok(scope.controlledCoverage>.72);
}

{
  const proof={};
  const controlled={controlled:true,margin:.8,materialSecurity:.8,criticalSecurityFloor:.7,depletionPressure90:.1,controlledCoverage:.9};
  advanceResourceDepletionProof(proof,controlled,19*365.2425);
  assert.equal(proof.resourceDepletion.demonstratedDurable,false);
  advanceResourceDepletionProof(proof,controlled,366);
  assert.equal(proof.resourceDepletion.demonstratedDurable,true);
  assert.equal(proof.resourceDepletion.status,RESOURCE_BOSS_STATES.DEMONSTRATED_DURABLE);
}

{
  const state={};
  const regions=[region('a1','a',{controlled:true,alternatives:true}),region('b1','b',{controlled:false})];
  const first=tickResourceDepletionFinalBoss({regions,playerPolityId:'a',state,elapsedDays:20*365.2425});
  assert.equal(first.player.demonstratedDurable,true,'player society can prove resource stability even while humanity has not');
  assert.equal(first.humanity.demonstratedDurable,false);
  assert.equal(first.ready,false,'grand-campaign resource boss requires both player and humanity');
  regions[1]=region('b1','b',{controlled:true,alternatives:true});
  const second=tickResourceDepletionFinalBoss({regions,playerPolityId:'a',state,elapsedDays:20*365.2425});
  assert.equal(second.humanity.demonstratedDurable,true);
  assert.equal(second.ready,true);
}

{
  const state={};
  const r=region('a1','a',{controlled:true});
  tickResourceDepletionFinalBoss({regions:[r],playerPolityId:'a',state,elapsedDays:20*365.2425});
  r.circularEconomy.materialSecurity=.2;r.circularEconomy.durableControlMargin=.2;
  for(const m of Object.values(r.circularEconomy.materials)){m.security=.15;m.depletionPressure=.9;m.secondaryShare=.05;}
  const result=tickResourceDepletionFinalBoss({regions:[r],playerPolityId:'a',state,elapsedDays:5*365.2425});
  assert.equal(result.player.demonstratedDurable,false,'durability must be lost if control is not maintained');
  assert.equal(result.player.status,RESOURCE_BOSS_STATES.DETERIORATING);
}

console.log('Resource depletion final-boss regression passed.');
