import { ensureAiControlState } from '../technology/aiControl.js?v=20260921-ai-control2';
import { ensureAiSystemicRisk } from '../technology/aiSystemicRisk.js?v=20260922-ai-systemic1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export function ensureStrategicAiState(region){
  region.strategicAi ||= {};
  const s=region.strategicAi;
  s.policy ||= {};
  for(const [key,value] of Object.entries({
    militaryDecisionSupport:0,
    earlyWarningIntegration:0,
    nuclearCommandIntegration:0,
    autonomousRetaliation:0,
    humanReleaseAuthority:1,
  })) if(!Number.isFinite(s.policy[key])) s.policy[key]=value;
  s.effects ||= {};
  return s;
}

export function setStrategicAiPolicy(region,patch={}){
  const s=ensureStrategicAiState(region);
  for(const key of ['militaryDecisionSupport','earlyWarningIntegration','nuclearCommandIntegration','autonomousRetaliation','humanReleaseAuthority']){
    if(patch[key]!==undefined) s.policy[key]=clamp(patch[key]);
  }
  syncExplicitAccess(region,s);
  s.effects=strategicAiCommandEffects(region);
  return {...s.policy};
}

function syncExplicitAccess(region,s=ensureStrategicAiState(region)){
  const p=s.policy;
  region.aiMilitaryIntegration=clamp(Math.max(p.militaryDecisionSupport,p.earlyWarningIntegration*.85));
  region.aiNuclearCommandIntegration=clamp(p.nuclearCommandIntegration);
  return {military:region.aiMilitaryIntegration,nuclearCommand:region.aiNuclearCommandIntegration};
}

export function strategicAiCommandEffects(region){
  const s=ensureStrategicAiState(region),p=s.policy;
  const ai=ensureAiControlState(region);
  const systemic=ensureAiSystemicRisk(region);
  const capability=clamp(region.aiLabour?.capability||region.aiEconomy?.capability||0);
  const safety=clamp(ai.safetyMaturity*.35+ai.evaluationMaturity*.20+ai.containmentMaturity*.25+ai.monitoringMaturity*.20);
  const human=clamp(p.humanReleaseAuthority);
  const overrideReliability=clamp(systemic.controls?.overrideReliability??human);
  const automationBias=clamp(systemic.pressures?.automationBias||0);
  const hostileCapture=clamp(systemic.pressures?.hostileCapture||0);
  const operatorMisuse=clamp(systemic.pressures?.operatorMisuse||0);

  const warningQuality=clamp(capability*p.earlyWarningIntegration*(.45+.55*ai.monitoringMaturity));
  const decisionSupport=clamp(capability*p.militaryDecisionSupport*(.50+.50*ai.evaluationMaturity));
  const nuclearIntegration=clamp(capability*p.nuclearCommandIntegration);

  // Strong AI can improve detection and second-strike survivability without receiving release authority.
  const secondStrikeResilience=clamp(nuclearIntegration*(.28+.42*warningQuality+.30*safety)*(.60+.20*human+.20*overrideReliability));
  const falseAlarmFiltering=clamp(warningQuality*(.35+.65*ai.evaluationMaturity)*(.45+.25*human+.30*overrideReliability)*(1-automationBias*.28));

  // Strategic danger is broader than a self-directed rogue system. A model can be obedient yet still be
  // wrong, over-trusted, compromised, or deliberately used by an authorised operator for a disastrous act.
  const autonomyExposure=clamp(p.autonomousRetaliation*nuclearIntegration*(1-human*.82));
  const judgementFailure=clamp(nuclearIntegration*(automationBias*.34+hostileCapture*.28+operatorMisuse*.28)*(1-overrideReliability*.55));
  const commandRisk=clamp(
    ai.lossOfControlHazard*(.28+.52*nuclearIntegration)+
    autonomyExposure*(.18+.42*(1-safety))+
    judgementFailure+
    nuclearIntegration*(1-ai.monitoringMaturity)*.05
  );

  return {
    warningQuality,
    decisionSupport,
    secondStrikeResilience,
    falseAlarmFiltering,
    commandRisk,
    humanReleaseAuthority:human,
    humanOverrideReliability:overrideReliability,
    automationBiasExposure:automationBias,
    hostileCaptureExposure:hostileCapture,
    operatorMisuseExposure:operatorMisuse,
    autonomousRetaliation:clamp(p.autonomousRetaliation),
    militaryAccess:clamp(region.aiMilitaryIntegration||0),
    nuclearCommandAccess:clamp(region.aiNuclearCommandIntegration||0),
  };
}

export function tickStrategicAiCommand(region){
  const s=ensureStrategicAiState(region);
  syncExplicitAccess(region,s);
  s.effects=strategicAiCommandEffects(region);
  region.report ||= {};
  region.report.strategicAi={policy:{...s.policy},effects:{...s.effects}};
  return s;
}
