const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

export const ANTIBIOTIC_CLASSES=Object.freeze({
  early:{id:'early',label:'Early antibiotics',potency:.72,resistanceRate:.16,reserve:false},
  broad:{id:'broad',label:'Broad-spectrum antibiotics',potency:.86,resistanceRate:.12,reserve:false},
  reserve:{id:'reserve',label:'Reserve antibiotics',potency:.94,resistanceRate:.075,reserve:true},
});
export const BACTERIAL_PATHOGENS=Object.freeze(['enteric','plague','respiratory']);

function ensurePathogenState(s,id){s.pathogens[id]||={};for(const key of Object.keys(ANTIBIOTIC_CLASSES))if(!Number.isFinite(s.pathogens[id][key]))s.pathogens[id][key]=0;return s.pathogens[id];}
export function ensureAntimicrobialResistance(region){
  region.antimicrobialResistance||={};const s=region.antimicrobialResistance;
  for(const [k,v] of Object.entries({stewardship:.12,diagnostics:.08,infectionControl:.08,surveillance:.06,livestockRestriction:.05,innovation:.08,newClassMaturity:0,humanUsePressure:0,livestockUsePressure:0,resistantInfectionBurden:0,treatmentEffectiveness:1,reserveClassAvailable:0}))if(!Number.isFinite(s[k]))s[k]=v;
  s.pathogens||={};for(const id of BACTERIAL_PATHOGENS)ensurePathogenState(s,id);
  return s;
}
export function setAntimicrobialPolicy(region,patch={}){const s=ensureAntimicrobialResistance(region);for(const k of ['stewardship','diagnostics','infectionControl','surveillance','livestockRestriction','innovation'])if(patch[k]!==undefined)s[k]=clamp(patch[k]);return antimicrobialResistanceSummary(region);}
function tech(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function hospitalCapacity(region){const h=region?.publicHealth||{};return clamp((positive(h.operationalBeds)/Math.max(10,positive(region.population)*.0025))*.55+clamp(h.staffingRatio||0)*.25+clamp(h.fundingRatio||0)*.20);}
function scienceCapacity(region){return clamp((region.publicEducation?.literacy??region.educationLevel??0)*.34+(region.aiLabour?.sectors?.research?.outputMultiplier?Math.min(.25,(region.aiLabour.sectors.research.outputMultiplier-1)*.35):0)+hospitalCapacity(region)*.24+(region.governance?.administrativeControl??.3)*.17);}
function availableClasses(region,s){if(!tech(region,'antibiotics'))return[];const classes=['early'];if(tech(region,'germ_theory')&&hospitalCapacity(region)>.22)classes.push('broad');if(s.newClassMaturity>=.72)classes.push('reserve');return classes;}
function humanUse(region,s){if(!tech(region,'antibiotics'))return 0;const d=region.disease?.pathogens||{};const burden=BACTERIAL_PATHOGENS.reduce((sum,id)=>sum+clamp(d[id]?.prevalence||0),0);const access=clamp(.20+hospitalCapacity(region)*.55+(region.publicHealth?.publicHealthAdministration||0)*.25);const targeting=.45+s.diagnostics*.40+s.stewardship*.15;return clamp(burden*3.2*access*(1.22-targeting*.42),0,1);}
function livestockUse(region,s){const raw=clamp(region.livestockAgriculture?.antibioticPressure||0);return clamp(raw*(1-s.livestockRestriction*.82));}
function classSelection(region,s,id,classId){const c=ANTIBIOTIC_CLASSES[classId],p=s.pathogens[id];const diagnosticProtection=.55+s.diagnostics*.30+s.surveillance*.15;const stewardshipProtection=.45+s.stewardship*.55;const livestockSpill=classId==='reserve'?.08:.28;const pressure=s.humanUsePressure+s.livestockUsePressure*livestockSpill;return pressure*c.resistanceRate*(1-diagnosticProtection*.35)*(1-stewardshipProtection*.42)*(1-clamp(p[classId])*.35);}
export function antibioticTreatmentEffect(region,pathogenId){const s=ensureAntimicrobialResistance(region);if(!BACTERIAL_PATHOGENS.includes(pathogenId)||!tech(region,'antibiotics'))return 0;const classes=availableClasses(region,s);if(!classes.length)return 0;const p=ensurePathogenState(s,pathogenId);let best=0;for(const id of classes){const c=ANTIBIOTIC_CLASSES[id];const reservePenalty=c.reserve?(1-s.stewardship*.35):0;best=Math.max(best,c.potency*(1-clamp(p[id]))*(1-reservePenalty*.12));}return clamp(best,0,.95);}
export function tickAntimicrobialResistance(region,elapsedDays=7){const s=ensureAntimicrobialResistance(region),years=positive(elapsedDays)/DAYS_PER_YEAR;if(!years)return s;
  const admin=clamp(region.publicHealth?.publicHealthAdministration||0),hosp=hospitalCapacity(region),science=scienceCapacity(region);
  s.diagnostics=clamp(s.diagnostics+(1-s.diagnostics)*years*(.015+science*.045));
  s.infectionControl=clamp(s.infectionControl+(1-s.infectionControl)*years*(.012+hosp*.035+admin*.020));
  s.surveillance=clamp(s.surveillance+(1-s.surveillance)*years*(.010+admin*.040+science*.018));
  s.humanUsePressure=humanUse(region,s);s.livestockUsePressure=livestockUse(region,s);
  if(tech(region,'antibiotics'))s.newClassMaturity=clamp(s.newClassMaturity+(1-s.newClassMaturity)*years*(.0015+science*.008+s.innovation*.010));
  const decayBase=.008+s.stewardship*.022+s.infectionControl*.012;
  let weighted=0,weight=0;
  for(const id of BACTERIAL_PATHOGENS){const p=ensurePathogenState(s,id),prevalence=clamp(region.disease?.pathogens?.[id]?.prevalence||0);for(const classId of Object.keys(ANTIBIOTIC_CLASSES)){const rise=classSelection(region,s,id,classId)*years;const decay=p[classId]*(decayBase+(classId==='reserve'?.010:0))*years;p[classId]=clamp(p[classId]+rise-decay);}const resistance=Math.max(p.early,p.broad*.9,p.reserve*.8);weighted+=resistance*(.05+prevalence);weight+=.05+prevalence;}
  s.resistantInfectionBurden=weight?clamp(weighted/weight):0;s.treatmentEffectiveness=clamp(1-s.resistantInfectionBurden*.72,.12,1);s.reserveClassAvailable=s.newClassMaturity>=.72?1:0;
  region.report||={};region.report.antimicrobialResistance=antimicrobialResistanceSummary(region);return s;}
export function antimicrobialResistanceSummary(region){const s=ensureAntimicrobialResistance(region);return{stewardship:s.stewardship,diagnostics:s.diagnostics,infectionControl:s.infectionControl,surveillance:s.surveillance,livestockRestriction:s.livestockRestriction,innovation:s.innovation,newClassMaturity:s.newClassMaturity,reserveClassAvailable:s.reserveClassAvailable,humanUsePressure:s.humanUsePressure,livestockUsePressure:s.livestockUsePressure,resistantInfectionBurden:s.resistantInfectionBurden,treatmentEffectiveness:s.treatmentEffectiveness,pathogens:Object.fromEntries(BACTERIAL_PATHOGENS.map(id=>[id,{...s.pathogens[id],effectiveTreatment:antibioticTreatmentEffect(region,id)}]))};}
