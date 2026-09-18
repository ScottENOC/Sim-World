export const PROFESSIONAL_MEDICINE_TECH_ID='professional_medicine';
export const ANATOMY_TECH_ID='scientific_anatomy';
export const NURSING_TECH_ID='professional_nursing';
export const ANTISEPSIS_TECH_ID='antisepsis';
export const GERM_THEORY_TECH_ID='germ_theory';
export const VACCINATION_TECH_ID='vaccination';
export const ANTIBIOTICS_TECH_ID='antibiotics';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
function literacy(region){return clamp(region.publicEducation?.literacy ?? region.educationLevel ?? 0);}
function stateCapacity(region){return clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.35);}
function urbanShare(region){const u=Math.max(0,Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation)||0);return clamp(u/Math.max(1,Number(region.population)||1));}
function hospitalPractice(region){const h=region.publicHealth||{};return clamp((Number(h.operationalBeds)||0)/Math.max(10,(Number(region.population)||1)*0.0025));}
function educationSignal(region){return clamp(literacy(region)*0.72+stateCapacity(region)*0.18+urbanShare(region)*0.10);}
function neighbourCount(region,regionsById,techId){return (region.neighbors||[]).reduce((n,id)=>n+(regionsById.get(id)?.unlockedTechIds?.has(techId)?1:0),0);}
function tradePartnerCount(region,regionsById,techId){const ids=region.recentTradePartners instanceof Map?[...region.recentTradePartners.keys()]:(region.tradePartnerIds||[]);return ids.reduce((n,id)=>n+(regionsById.get(id)?.unlockedTechIds?.has(techId)?1:0),0);}
function diffusion(region,regionsById,techId){const sources=neighbourCount(region,regionsById,techId)+tradePartnerCount(region,regionsById,techId)*0.6;return clamp(1-Math.exp(-sources*0.0012));}
function chanceFrom(readiness,base=0.000003){return Math.max(0,readiness)*base;}

const DEFINITIONS=[
  {id:PROFESSIONAL_MEDICINE_TECH_ID,label:'Professional medicine',requires:[],readiness:r=>educationSignal(r)*0.55+hospitalPractice(r)*0.45,base:0.000010},
  {id:ANATOMY_TECH_ID,label:'Scientific anatomy',requires:[PROFESSIONAL_MEDICINE_TECH_ID],readiness:r=>educationSignal(r)*0.72+hospitalPractice(r)*0.28,base:0.000006},
  {id:NURSING_TECH_ID,label:'Professional nursing',requires:[PROFESSIONAL_MEDICINE_TECH_ID],readiness:r=>educationSignal(r)*0.50+hospitalPractice(r)*0.50,base:0.000008},
  {id:ANTISEPSIS_TECH_ID,label:'Antiseptic practice',requires:[ANATOMY_TECH_ID,NURSING_TECH_ID],readiness:r=>educationSignal(r)*0.42+hospitalPractice(r)*0.58,base:0.000005},
  {id:GERM_THEORY_TECH_ID,label:'Germ theory of disease',requires:[ANATOMY_TECH_ID],readiness:r=>educationSignal(r)*0.78+hospitalPractice(r)*0.22,base:0.000004},
  {id:VACCINATION_TECH_ID,label:'Vaccination',requires:[PROFESSIONAL_MEDICINE_TECH_ID],readiness:r=>educationSignal(r)*0.55+hospitalPractice(r)*0.20+clamp((r.disease?.pathogens?.smallpox?.cumulativeDeaths||0)/Math.max(1,r.population)*25)*0.25,base:0.000005},
  {id:ANTIBIOTICS_TECH_ID,label:'Antibiotic medicine',requires:[GERM_THEORY_TECH_ID,ANTISEPSIS_TECH_ID],readiness:r=>educationSignal(r)*0.72+hospitalPractice(r)*0.28,base:0.0000012},
];

export function medicalCapabilities(region){const t=region.unlockedTechIds||new Set();return {professionalMedicine:t.has(PROFESSIONAL_MEDICINE_TECH_ID),anatomy:t.has(ANATOMY_TECH_ID),nursing:t.has(NURSING_TECH_ID),antisepsis:t.has(ANTISEPSIS_TECH_ID),germTheory:t.has(GERM_THEORY_TECH_ID),vaccination:t.has(VACCINATION_TECH_ID),antibiotics:t.has(ANTIBIOTICS_TECH_ID)};}
export function medicalKnowledgeIndex(region){const c=medicalCapabilities(region);return clamp(0.08+(c.professionalMedicine?0.12:0)+(c.anatomy?0.09:0)+(c.nursing?0.10:0)+(c.antisepsis?0.16:0)+(c.germTheory?0.15:0)+(c.vaccination?0.08:0)+(c.antibiotics?0.22:0));}
export function medicalBreakthroughChance(region,regionsById,definition){if(region.unlockedTechIds?.has(definition.id))return 0;if(!definition.requires.every(id=>region.unlockedTechIds?.has(id)))return 0;const readiness=clamp(definition.readiness(region));return clamp(chanceFrom(readiness,definition.base)+diffusion(region,regionsById,definition.id)*0.03);}
export function tickMedicalBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){const weekScale=Math.max(0.01,elapsedDays/7);const regionsById=new Map(regions.map(r=>[r.id,r]));const events=[];for(const d of DEFINITIONS){for(const region of regions){const p=medicalBreakthroughChance(region,regionsById,d);const adjusted=1-Math.pow(1-clamp(p),weekScale);if(rng()<adjusted){region.unlockedTechIds.add(d.id);events.push({type:'medical_breakthrough',techId:d.id,title:d.label,regionId:region.id,regionName:region.name,tick:currentTick,message:`${region.name} has developed ${d.label.toLowerCase()}.`});}}}return events;}
export function vaccinationProtection(region,pathogenId){const c=medicalCapabilities(region);if(!c.vaccination)return 0;if(pathogenId==='smallpox')return c.germTheory?0.58:0.42;return 0;}
export function treatmentKnowledgeEffect(region,pathogenId){const c=medicalCapabilities(region);let e=0.08+(c.professionalMedicine?0.10:0)+(c.anatomy?0.05:0)+(c.nursing?0.11:0)+(c.antisepsis?0.14:0)+(c.germTheory?0.08:0);if(c.antibiotics&&(pathogenId==='enteric'||pathogenId==='plague'||pathogenId==='respiratory'))e+=0.28;return clamp(e,0,0.72);}
export function preventionKnowledgeEffect(region){const c=medicalCapabilities(region);return clamp((c.antisepsis?0.08:0)+(c.germTheory?0.18:0)+(c.professionalMedicine?0.03:0),0,0.32);}
export function militaryMedicalEffect(region){const c=medicalCapabilities(region);const h=region.publicHealth||{};const hospitalBase=clamp((Number(h.staffingRatio)||0)*(Number(h.fundingRatio)||0));let treatment=0.03+(c.professionalMedicine?0.06:0)+(c.anatomy?0.04:0)+(c.nursing?0.10:0)+(c.antisepsis?0.16:0)+(c.germTheory?0.05:0)+(c.antibiotics?0.23:0);const evacuation=clamp(0.25+stateCapacity(region)*0.35+(region.telephoneNetwork?.coverage||0)*0.15+(region.railway?.networkLevel||0)*0.15);return clamp(treatment*(0.45+hospitalBase*0.35+evacuation*0.20),0,0.68);}
