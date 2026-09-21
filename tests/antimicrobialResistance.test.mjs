import assert from 'node:assert/strict';
import { ensureAntimicrobialResistance, setAntimicrobialPolicy, tickAntimicrobialResistance, antibioticTreatmentEffect } from '../js/society/antimicrobialResistance.js';
import { treatmentKnowledgeEffect } from '../js/technology/medicalProgress.js';

function region({antibiotics=true, prevalence=.12, livestock=.25}={}){
  const tech=new Set(['professional_medicine','scientific_anatomy','professional_nursing','antisepsis','germ_theory']);
  if(antibiotics)tech.add('antibiotics');
  return {id:'r',population:1000000,unlockedTechIds:tech,educationLevel:.72,governance:{administrativeControl:.7},publicHealth:{operationalBeds:2200,staffingRatio:.8,fundingRatio:.8,publicHealthAdministration:.7},disease:{pathogens:{enteric:{prevalence},plague:{prevalence:prevalence*.35},respiratory:{prevalence:prevalence*.7}}},livestockAgriculture:{antibioticPressure:livestock},report:{}};
}

{
  const r=region({antibiotics:false});
  assert.equal(antibioticTreatmentEffect(r,'enteric'),0,'without antibiotic medicine there is no antibiotic treatment effect');
}

{
  const r=region();
  const s=ensureAntimicrobialResistance(r);
  const before=s.pathogens.enteric.early;
  tickAntimicrobialResistance(r,365.2425*8);
  assert.ok(s.pathogens.enteric.early>before,'sustained human and livestock antibiotic use should select for resistance');
  assert.ok(s.humanUsePressure>0&&s.livestockUsePressure>0,'both human and livestock sectors should contribute selection pressure');
}

{
  const weak=region(), strong=region();
  setAntimicrobialPolicy(weak,{stewardship:.05,diagnostics:.05,livestockRestriction:0});
  setAntimicrobialPolicy(strong,{stewardship:.95,diagnostics:.9,livestockRestriction:.95});
  tickAntimicrobialResistance(weak,365.2425*12);
  tickAntimicrobialResistance(strong,365.2425*12);
  assert.ok(strong.antimicrobialResistance.pathogens.enteric.early<weak.antimicrobialResistance.pathogens.enteric.early,'stewardship, diagnostics and livestock restrictions should slow resistance');
}

{
  const r=region();
  const s=ensureAntimicrobialResistance(r);
  s.pathogens.enteric.early=.9;s.pathogens.enteric.broad=.82;
  const degraded=antibioticTreatmentEffect(r,'enteric');
  s.newClassMaturity=.8;
  const withReserve=antibioticTreatmentEffect(r,'enteric');
  assert.ok(withReserve>degraded,'a mature reserve antibiotic class should restore some treatment effectiveness');
}

{
  const r=region();
  const baseline=treatmentKnowledgeEffect(r,'enteric');
  const s=ensureAntimicrobialResistance(r);s.pathogens.enteric.early=.98;s.pathogens.enteric.broad=.96;s.pathogens.enteric.reserve=.94;s.newClassMaturity=.9;
  const resistant=treatmentKnowledgeEffect(r,'enteric');
  assert.ok(resistant<baseline,'drug resistance should materially reduce real treatment benefit');
  assert.ok(resistant>0,'non-antibiotic medical care should remain beneficial despite severe AMR');
}

console.log('antimicrobialResistance tests passed');
