import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260920-nuclear-weaponisation1';
import { nuclearIndustrialReadiness } from '../economy/nuclearPower.js?v=20260920-nuclear1';
import { ensureStrategicNuclearState, NUCLEAR_PROGRAMME_POSTURES } from '../economy/strategicNuclear.js?v=20260920-strategic-nuclear1';
import { knowledgeLevel } from '../core/knowledge.js?v=20260906-scouting1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, Number(v)||0));
const nonNegative = (v) => Math.max(0, Number(v)||0);

export const NUCLEAR_WEAPONISATION_TECH_ID = 'nuclear_weaponisation';
export const NUCLEAR_TEST_VALIDATION_TECH_ID = 'nuclear_test_validation';
export const NUCLEAR_TEST_POLICIES = Object.freeze({ NONE:'none', COVERT:'covert', PUBLIC:'public' });
export const NUCLEAR_WEAPON_PROGRAMMES = Object.freeze({ INACTIVE:'inactive', RESEARCH:'research', PROTOTYPE:'prototype' });

export function ensureNuclearWeaponState(region){
  ensureStrategicNuclearState(region);
  region.nuclearWeapons ||= {};
  const s=region.nuclearWeapons;
  s.policy ||= { programme:NUCLEAR_WEAPON_PROGRAMMES.INACTIVE, testPolicy:NUCLEAR_TEST_POLICIES.NONE, secrecy:0.7 };
  if(!Object.values(NUCLEAR_WEAPON_PROGRAMMES).includes(s.policy.programme)) s.policy.programme=NUCLEAR_WEAPON_PROGRAMMES.INACTIVE;
  if(!Object.values(NUCLEAR_TEST_POLICIES).includes(s.policy.testPolicy)) s.policy.testPolicy=NUCLEAR_TEST_POLICIES.NONE;
  s.policy.secrecy=clamp(s.policy.secrecy??0.7);
  if(!Number.isFinite(s.weaponisationProgress)) s.weaponisationProgress=0;
  if(!Number.isFinite(s.validationConfidence)) s.validationConfidence=0;
  if(!Number.isFinite(s.programmeExperience)) s.programmeExperience=0;
  if(!Number.isFinite(s.prototypeCount)) s.prototypeCount=0;
  if(!Array.isArray(s.tests)) s.tests=[];
  s.observableSignals ||= {};
  return s;
}

export function setNuclearWeaponPolicy(region, patch={}){
  const s=ensureNuclearWeaponState(region);
  if(patch.programme && Object.values(NUCLEAR_WEAPON_PROGRAMMES).includes(patch.programme)) s.policy.programme=patch.programme;
  if(patch.testPolicy && Object.values(NUCLEAR_TEST_POLICIES).includes(patch.testPolicy)) s.policy.testPolicy=patch.testPolicy;
  if(Number.isFinite(patch.secrecy)) s.policy.secrecy=clamp(patch.secrecy);
  return {...s.policy};
}

function hasStrategicMaterial(region){
  return nonNegative(region.stockpile?.strategic_uranium_material)+nonNegative(region.stockpile?.separated_plutonium)>0.05;
}
function consumeAbstractStrategicMaterial(region, amount){
  let remaining=Math.max(0,amount);
  const fromU=Math.min(remaining,nonNegative(region.stockpile?.strategic_uranium_material));
  region.stockpile.strategic_uranium_material=nonNegative(region.stockpile?.strategic_uranium_material)-fromU;
  remaining-=fromU;
  const fromP=Math.min(remaining,nonNegative(region.stockpile?.separated_plutonium));
  region.stockpile.separated_plutonium=nonNegative(region.stockpile?.separated_plutonium)-fromP;
  return amount-remaining;
}

export function nuclearWeaponisationReadiness(region){
  const strategic=ensureStrategicNuclearState(region);
  const industrial=nuclearIndustrialReadiness(region);
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const literacy=clamp(region.massEducation?.literacy||region.education?.literacy||0);
  const records=clamp(region.governance?.administration?.recordKeeping||region.governance?.administrativeControl||0);
  const labs=effectiveInfrastructureCount(region,'nuclear_weapons_research_establishment');
  const deliberate=strategic.policy.posture===NUCLEAR_PROGRAMME_POSTURES.STRATEGIC?1:strategic.policy.posture===NUCLEAR_PROGRAMME_POSTURES.HEDGE?.35:0;
  return clamp((industrial*.34+precision*.22+literacy*.20+records*.12+Math.min(1,labs)*.12)*deliberate);
}

export function tickNuclearWeaponProgramme(region,currentTick,elapsedDays=7,rng=Math.random){
  const s=ensureNuclearWeaponState(region);
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const events=[];
  const labs=effectiveInfrastructureCount(region,'nuclear_weapons_research_establishment');
  const canWork=region.unlockedTechIds?.has(NUCLEAR_WEAPONISATION_TECH_ID)&&labs>0&&s.policy.programme!==NUCLEAR_WEAPON_PROGRAMMES.INACTIVE;
  const readiness=nuclearWeaponisationReadiness(region);
  if(canWork&&years>0){
    const moneyNeed=18*labs*years;
    const paid=Math.min(nonNegative(region.treasury),moneyNeed);
    region.treasury=nonNegative(region.treasury)-paid;
    const funding=moneyNeed>0?clamp(paid/moneyNeed):1;
    const material=hasStrategicMaterial(region)?1:.15;
    const gain=years*(.18+.52*readiness)*funding*material*(1-s.weaponisationProgress*.35);
    s.weaponisationProgress=clamp(s.weaponisationProgress+gain);
    s.programmeExperience=clamp(s.programmeExperience+years*.06*readiness*(1-s.programmeExperience));
    if(s.weaponisationProgress>=.82&&s.prototypeCount<1&&hasStrategicMaterial(region)){
      const used=consumeAbstractStrategicMaterial(region,.12);
      if(used>=.10){
        s.prototypeCount=1;
        s.policy.programme=NUCLEAR_WEAPON_PROGRAMMES.PROTOTYPE;
        s.validationConfidence=Math.max(s.validationConfidence,.28+.25*readiness);
        events.push({type:'nuclear_prototype_capability',regionId:region.id,regionName:region.name,tick:currentTick,title:'Prototype nuclear device capability',message:`${region.name} has completed an untested prototype-capable nuclear weapons programme.`});
      }
    }
  }

  const researchFootprint=clamp(labs/2);
  const procurement=clamp((s.weaponisationProgress||0)*.7+s.programmeExperience*.3);
  const concealment=clamp(s.policy.secrecy*.72+(region.strategicNuclear?.policy?.secrecy||0)*.28);
  s.observableSignals={researchFootprint,procurement,concealment};

  if(s.prototypeCount>0&&s.policy.testPolicy!==NUCLEAR_TEST_POLICIES.NONE&&region.unlockedTechIds?.has(NUCLEAR_TEST_VALIDATION_TECH_ID)){
    const already=s.tests.some(t=>t.completed);
    if(!already&&years>0){
      const chance=clamp(years*(.55+.35*readiness));
      if((rng?.()??Math.random())<chance){
        const mode=s.policy.testPolicy;
        const detected=mode===NUCLEAR_TEST_POLICIES.PUBLIC?true:((rng?.()??Math.random())<clamp(.42+(1-s.policy.secrecy)*.32));
        const test={tick:currentTick,mode,completed:true,detected,publiclyDeclared:mode===NUCLEAR_TEST_POLICIES.PUBLIC};
        s.tests.push(test);
        s.validationConfidence=clamp(Math.max(s.validationConfidence,.72+.20*readiness));
        events.push({type:mode==='public'?'public_nuclear_test':'covert_nuclear_test',regionId:region.id,regionName:region.name,tick:currentTick,detected,title:mode==='public'?'Nuclear test announced':'Nuclear test conducted',message:mode==='public'?`${region.name} has publicly demonstrated a nuclear explosive capability.`:`${region.name} has conducted a covert nuclear test${detected?' that may have been detected abroad.':'.'}`});
      }
    }
  }
  return events;
}

export function nuclearDeterrentStatus(region){
  const s=ensureNuclearWeaponState(region);
  const tested=s.tests.some(t=>t.completed);
  if(s.prototypeCount<=0)return 'none';
  if(tested&&s.validationConfidence>=.7)return 'demonstrated_device_capability';
  return 'untested_device_capability';
}

export function estimateForeignNuclearWeaponCapability(observer,target){
  const s=ensureNuclearWeaponState(target);
  const familiarity=observer?.id===target?.id?1:clamp(knowledgeLevel(observer,target?.id));
  const sig=s.observableSignals||{};
  const detectedTest=s.tests.some(t=>t.completed&&(t.publiclyDeclared||t.detected));
  const publicTest=s.tests.some(t=>t.completed&&t.publiclyDeclared);
  const visibility=clamp((sig.researchFootprint||0)*.38+(sig.procurement||0)*.32+(detectedTest?.30:0)-(sig.concealment||0)*.28);
  const confidence=observer?.id===target?.id?1:clamp(.04+familiarity*.52+visibility*.44);
  let assessment='no_indication';
  if(publicTest) assessment='nuclear_capability_demonstrated';
  else if(detectedTest&&confidence>.35) assessment='probable_nuclear_test';
  else if(s.prototypeCount>0&&confidence>.7) assessment='untested_device_probable';
  else if((s.weaponisationProgress||0)>.35&&confidence>.35) assessment='weaponisation_programme_suspected';
  return {targetRegionId:target.id,assessment,confidence,exactPrototypeCountKnown:observer?.id===target?.id,evidence:{researchFootprint:clamp((sig.researchFootprint||0)*familiarity),procurement:clamp((sig.procurement||0)*familiarity),testSignal:detectedTest?clamp(.5+.5*familiarity):0}};
}
