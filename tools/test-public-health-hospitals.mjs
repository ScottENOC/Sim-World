import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ensurePublicHealth, publicHealthEligibility, setPublicHealthPolicy, tickPublicHealth, hospitalTreatmentEffect, publicHealthPreventionEffect } from '../js/society/publicHealth.js';

function region(overrides={}){
  return {
    id:'test',population:100000,urbanisation:{urbanPopulation:50000},
    governance:{administrativeControl:0.8},militaryFinance:{stateCapacity:0.8},
    publicEducation:{literacy:0.65},treasury:1000,wallet:2000,
    stockpile:{wood:1000,stone:1000,clay:1000},
    urbanHousing:{sanitationLevel:0.65},disease:{pathogens:{}},...overrides,
  };
}

const modern=region();
const eligibility=publicHealthEligibility(modern);
assert.equal(eligibility.publicHospitals,true,'urban administratively capable regions should be able to establish public hospitals');
setPublicHealthPolicy(modern,{publicHealthAdministration:0.7,publicHospitalBudgetShare:0.08},{playerChoice:true});
tickPublicHealth(modern,365,{isPlayer:true});
const health=ensurePublicHealth(modern);
assert.ok(health.publicBeds>0,'public hospital budgets should build real beds');
assert.ok(health.operationalBeds>0,'beds should become operational when funded and staffed');
assert.ok(health.hospitalBuildSpend>0,'hospital construction should spend treasury funds');
assert.ok(modern.stockpile.wood<1000&&modern.stockpile.stone<1000,'hospital construction should consume physical materials');
assert.ok(publicHealthPreventionEffect(modern)>0,'public health administration plus sanitation should reduce local transmission pressure');

const mild=hospitalTreatmentEffect(modern,'enteric',0.001);
const overwhelmed=hospitalTreatmentEffect(modern,'enteric',0.12);
assert.ok(mild>0,'operational hospitals should reduce case fatality when capacity is available');
assert.ok(overwhelmed<mild,'epidemics that outrun beds should receive less effective treatment');

const premodern=region({urbanisation:{urbanPopulation:1500},governance:{administrativeControl:0.18},militaryFinance:{stateCapacity:0.18},publicEducation:{literacy:0.01},treasury:20});
assert.equal(publicHealthEligibility(premodern).publicHospitals,false,'small low-capacity societies should not unlock state hospitals');
tickPublicHealth(premodern,365,{isPlayer:false});
assert.equal(ensurePublicHealth(premodern).publicBeds,0,'NPCs should not conjure public hospitals before institutional prerequisites');

const diseaseSource=fs.readFileSync(new URL('../js/society/disease.js',import.meta.url),'utf8');
assert.match(diseaseSource,/hospitalTreatmentEffect/,'disease mortality must consume hospital treatment capacity');
assert.match(diseaseSource,/urbanHealthRisk/,'urban living conditions must affect disease transmission');
assert.match(diseaseSource,/publicHealthPreventionEffect/,'public-health administration must affect transmission');

console.log('public health and hospitals regression passed');
