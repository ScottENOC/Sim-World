import { ensureCounterIntelligence } from './counterIntelligence.js?v=20260909-counterintel1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const CRYPTOGRAPHY_TECHS=Object.freeze({
  FREQUENCY_ANALYSIS:'frequency_analysis',
  DIPLOMATIC_CODEBOOKS:'diplomatic_codebooks',
  TELEGRAPH_CODES:'telegraph_codes',
  SIGNALS_INTELLIGENCE:'signals_intelligence',
  MECHANICAL_CRYPTOGRAPHY:'mechanical_cryptography',
  MODERN_CRYPTOGRAPHY:'modern_cryptography',
  PUBLIC_KEY_CRYPTOGRAPHY:'public_key_cryptography',
  DIGITAL_SIGNATURES:'digital_signatures',
  POST_QUANTUM_CRYPTOGRAPHY:'post_quantum_cryptography',
});

function literacy(r){return clamp(r.publicEducation?.literacy??r.massEducation?.literacy??r.educationLevel??0);}
function admin(r){return clamp(r.governance?.administrativeControl??r.polityAdministration?.recordKeeping??.25);}
function computing(r){return clamp(Math.max(r.computingIndustry?.capability||0,r.computingIndustry?.digitalCapability||0,r.digitalInfrastructure?.coverage||0));}
function radio(r){return has(r,'radio')||has(r,'radio_broadcasting')||has(r,'wireless_telegraphy');}
function telegraph(r){return has(r,'electrical_telegraphy')||has(r,'telegraph');}
function networking(r){return has(r,'computer_networks')||has(r,'internet')||has(r,'packet_switching')||has(r,'digital_communications');}
function electronic(r){return has(r,'electronic_computing')||has(r,'digital_computing')||has(r,'semiconductors')||has(r,'integrated_circuits')||computing(r)>.38;}
function quantumThreat(r){return has(r,'quantum_computing')||has(r,'fault_tolerant_quantum_computing')||(computing(r)>.82&&clamp(r.aiLabour?.capability||0)>.72);}
function annualChance(base,readiness,elapsedDays){const years=Math.max(0,Number(elapsedDays)||0)/365.2425;return 1-Math.pow(1-clamp(base*clamp(readiness),0,.95),years);}
function unlock(region,id,title,currentTick,events){if(has(region,id))return false;region.unlockedTechIds?.add?.(id);events.push({type:'cryptography_breakthrough',techId:id,title,regionId:region.id,polityId:region.governance?.sovereignPolityId||region.polityId||null,currentTick});return true;}

export function cryptographyProgressionSummary(region){
  const ids=Object.values(CRYPTOGRAPHY_TECHS);
  return{known:ids.filter(id=>has(region,id)),cipherPractice:clamp(region.communicationState?.cipherPractice||0),codePractice:clamp(region.counterIntelligence?.codePractice||0),signalsIntelligence:clamp(region.cryptographyProgression?.signalsIntelligence||0),trafficAnalysis:clamp(region.cryptographyProgression?.trafficAnalysis||0)};
}

export function tickCryptographyProgression(regions,currentTick=0,elapsedDays=7,rng=Math.random){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds ||= new Set();
    region.communicationState ||= {};
    region.cryptographyProgression ||= {signalsIntelligence:0,trafficAnalysis:0,keyManagement:0};
    const ci=ensureCounterIntelligence(region),cipher=clamp(region.communicationState.cipherPractice||0),lit=literacy(region),adm=admin(region),comp=computing(region);
    const scholarly=clamp(cipher*.40+lit*.30+adm*.30);
    if(!has(region,CRYPTOGRAPHY_TECHS.FREQUENCY_ANALYSIS)&&cipher>.12&&lit>.12&&rng()<annualChance(.035,scholarly,elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.FREQUENCY_ANALYSIS,'Systematic frequency analysis',currentTick,events);
    if(has(region,CRYPTOGRAPHY_TECHS.FREQUENCY_ANALYSIS)&&!has(region,CRYPTOGRAPHY_TECHS.DIPLOMATIC_CODEBOOKS)&&adm>.22&&rng()<annualChance(.055,clamp(adm*.55+lit*.25+cipher*.20),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.DIPLOMATIC_CODEBOOKS,'Organised diplomatic codebooks',currentTick,events);
    if(telegraph(region)&&!has(region,CRYPTOGRAPHY_TECHS.TELEGRAPH_CODES)&&rng()<annualChance(.12,clamp(adm*.45+lit*.25+cipher*.30),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.TELEGRAPH_CODES,'Telegraph codes and cipher bureaux',currentTick,events);
    if((telegraph(region)||radio(region))&&has(region,CRYPTOGRAPHY_TECHS.FREQUENCY_ANALYSIS)&&!has(region,CRYPTOGRAPHY_TECHS.SIGNALS_INTELLIGENCE)&&rng()<annualChance(.09,clamp(adm*.35+lit*.20+(radio(region)?.25:.12)+cipher*.20),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.SIGNALS_INTELLIGENCE,'Signals intelligence organisation',currentTick,events);
    if(radio(region)&&has(region,CRYPTOGRAPHY_TECHS.TELEGRAPH_CODES)&&!has(region,CRYPTOGRAPHY_TECHS.MECHANICAL_CRYPTOGRAPHY)&&rng()<annualChance(.07,clamp(adm*.25+lit*.20+comp*.25+ci.codePractice*.30),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.MECHANICAL_CRYPTOGRAPHY,'Mechanical cryptography',currentTick,events);
    if(electronic(region)&&has(region,CRYPTOGRAPHY_TECHS.MECHANICAL_CRYPTOGRAPHY)&&!has(region,CRYPTOGRAPHY_TECHS.MODERN_CRYPTOGRAPHY)&&rng()<annualChance(.11,clamp(comp*.55+lit*.15+adm*.15+ci.codePractice*.15),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.MODERN_CRYPTOGRAPHY,'Modern mathematical cryptography',currentTick,events);
    if(networking(region)&&has(region,CRYPTOGRAPHY_TECHS.MODERN_CRYPTOGRAPHY)&&!has(region,CRYPTOGRAPHY_TECHS.PUBLIC_KEY_CRYPTOGRAPHY)&&rng()<annualChance(.09,clamp(comp*.62+lit*.18+adm*.20),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.PUBLIC_KEY_CRYPTOGRAPHY,'Public-key cryptography',currentTick,events);
    if(has(region,CRYPTOGRAPHY_TECHS.PUBLIC_KEY_CRYPTOGRAPHY)&&!has(region,CRYPTOGRAPHY_TECHS.DIGITAL_SIGNATURES)&&rng()<annualChance(.18,clamp(comp*.55+adm*.30+lit*.15),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.DIGITAL_SIGNATURES,'Digital signatures and certificate infrastructure',currentTick,events);
    if(quantumThreat(region)&&has(region,CRYPTOGRAPHY_TECHS.PUBLIC_KEY_CRYPTOGRAPHY)&&!has(region,CRYPTOGRAPHY_TECHS.POST_QUANTUM_CRYPTOGRAPHY)&&rng()<annualChance(.08,clamp(comp*.55+(region.aiLabour?.capability||0)*.30+adm*.15),elapsedDays))unlock(region,CRYPTOGRAPHY_TECHS.POST_QUANTUM_CRYPTOGRAPHY,'Post-quantum cryptography',currentTick,events);

    const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
    const sigintTarget=clamp((has(region,CRYPTOGRAPHY_TECHS.SIGNALS_INTELLIGENCE)?.32:0)+(has(region,CRYPTOGRAPHY_TECHS.MECHANICAL_CRYPTOGRAPHY)?.18:0)+(has(region,CRYPTOGRAPHY_TECHS.MODERN_CRYPTOGRAPHY)?.16:0)+comp*.22+adm*.12);
    const trafficTarget=clamp((telegraph(region)?.15:0)+(radio(region)?.22:0)+(networking(region)?.22:0)+comp*.25+adm*.16);
    region.cryptographyProgression.signalsIntelligence=clamp(region.cryptographyProgression.signalsIntelligence+(sigintTarget-region.cryptographyProgression.signalsIntelligence)*Math.min(1,years*.8));
    region.cryptographyProgression.trafficAnalysis=clamp(region.cryptographyProgression.trafficAnalysis+(trafficTarget-region.cryptographyProgression.trafficAnalysis)*Math.min(1,years*.8));
    region.cryptographyProgression.keyManagement=clamp(region.cryptographyProgression.keyManagement+years*(.02+adm*.05+ci.verificationCaution*.025)*(1-region.cryptographyProgression.keyManagement));
    if(has(region,CRYPTOGRAPHY_TECHS.FREQUENCY_ANALYSIS))ci.codePractice=clamp(ci.codePractice+years*.018*(1-ci.codePractice));
    if(has(region,CRYPTOGRAPHY_TECHS.DIPLOMATIC_CODEBOOKS))region.communicationState.cipherPractice=clamp(cipher+years*.012*(1-cipher));
    region.report||={};region.report.cryptography=cryptographyProgressionSummary(region);
  }
  return events;
}
