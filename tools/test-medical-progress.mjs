import assert from 'node:assert/strict';
import {
  PROFESSIONAL_MEDICINE_TECH_ID,ANATOMY_TECH_ID,NURSING_TECH_ID,ANTISEPSIS_TECH_ID,GERM_THEORY_TECH_ID,VACCINATION_TECH_ID,ANTIBIOTICS_TECH_ID,
  medicalKnowledgeIndex,treatmentKnowledgeEffect,vaccinationProtection,resolveMilitaryCasualties,tickMedicalBreakthroughs
} from '../js/technology/medicalProgress.js';

function region(id='r') { return {
  id,name:id,population:100000,neighbors:[],tradePartnerIds:[],unlockedTechIds:new Set(),
  publicEducation:{literacy:0.8},governance:{administrativeControl:0.85},militaryFinance:{stateCapacity:0.85},
  urbanisation:{urbanPopulation:50000},publicHealth:{operationalBeds:500,staffingRatio:0.95,fundingRatio:0.95,publicHealthAdministration:0.8},
  telephoneNetwork:{coverage:0.6},railway:{networkLevel:0.6},disease:{pathogens:{smallpox:{cumulativeDeaths:2000}}}
}; }

const old=region('old'); old.publicEducation.literacy=0.05; old.governance.administrativeControl=0.2; old.militaryFinance.stateCapacity=0.2; old.publicHealth={operationalBeds:0,staffingRatio:0.2,fundingRatio:0.2,publicHealthAdministration:0};
const modern=region('modern'); for(const id of [PROFESSIONAL_MEDICINE_TECH_ID,ANATOMY_TECH_ID,NURSING_TECH_ID,ANTISEPSIS_TECH_ID,GERM_THEORY_TECH_ID,VACCINATION_TECH_ID,ANTIBIOTICS_TECH_ID]) modern.unlockedTechIds.add(id);
assert.ok(medicalKnowledgeIndex(modern)>medicalKnowledgeIndex(old),'medical progression must raise medical knowledge');
assert.ok(treatmentKnowledgeEffect(modern,'enteric')>treatmentKnowledgeEffect(old,'enteric'),'later medicine must improve treatable disease outcomes');
assert.equal(vaccinationProtection(old,'smallpox'),0,'vaccination cannot exist without the breakthrough');
assert.ok(vaccinationProtection(modern,'smallpox')>0.4,'organised vaccination should materially reduce smallpox susceptibility');
assert.equal(vaccinationProtection(modern,'respiratory'),0,'smallpox vaccination must not become a generic immunity bonus');

const ancientLoss=resolveMilitaryCasualties(old,200,{deployedPersonnel:5000,homeCare:false,logistics:0.7});
const modernLoss=resolveMilitaryCasualties(modern,200,{deployedPersonnel:5000,homeCare:false,logistics:0.7});
assert.ok(modernLoss.deaths<ancientLoss.deaths,'modern military medicine must reduce deaths from the same gross casualties');
assert.ok(modernLoss.survivingWounded>ancientLoss.survivingWounded,'medical improvements should convert deaths into surviving wounded');

const overwhelmed=region('overwhelmed'); for(const id of modern.unlockedTechIds) overwhelmed.unlockedTechIds.add(id); overwhelmed.publicHealth.operationalBeds=0;
const manageable=resolveMilitaryCasualties(modern,80,{deployedPersonnel:4000,homeCare:true,logistics:1});
const massCasualty=resolveMilitaryCasualties(overwhelmed,2000,{deployedPersonnel:4000,homeCare:true,logistics:1});
assert.ok(manageable.capacityRatio>massCasualty.capacityRatio,'mass casualties must overwhelm finite treatment capacity');

const lucky=region('lucky'); const events=tickMedicalBreakthroughs([lucky],1,()=>0,7);
assert.ok(events.some(e=>e.techId===PROFESSIONAL_MEDICINE_TECH_ID),'an eligible lucky region can discover professional medicine');
assert.equal(events.some(e=>e.techId===ANTIBIOTICS_TECH_ID),false,'medical prerequisites must not chain from first medicine to antibiotics in one tick');

console.log('medical progression regression passed');
