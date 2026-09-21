import { ensureAiControlState } from '../technology/aiControl.js?v=20260921-ai-control2';

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
  // These are deliberately explicit bridges into aiControl. Civilian AI adoption never writes them.
  region.aiMilitaryIntegration=clamp(Math.max(p.militaryDecisionSupport,p.earlyWarningIntegration*.85));
  region.aiNuclearCommandIntegration=clamp(p.nuclearCommandIntegration);
  return {military:region.aiMilitaryIntegration,nuclearCommand:region.aiNuclearCommandIntegration};
}

export function strategicAiCommandEffects(region){
  const s=ensureStrategicAiState(region),p=s.policy;
  const ai=ensureAiControlState(region);
  const capability=clamp(region.aiLabour?.capability||region.aiEconomy?.capability||0);
  const safety=clamp(ai.safetyMaturity*.35+ai.evaluationMaturity*.20+ai.containmentMaturity*.25+ai.monitoringMaturity*.20);
  const human=clamp(p.humanReleaseAuthority);

  const warningQuality=clamp(capability*p.earlyWarningIntegration*(.45+.55*ai.monitoringMaturity));
  const decisionSupport=clamp(capability*p.militaryDecisionSupport*(.50+.50*ai.evaluationMaturity));
  const nuclearIntegration=clamp(capability*p.nuclearCommandIntegration);

  // AI can make a retaliatory force harder to surprise or decapitate without itself receiving release authority.
  const secondStrikeResilience=clamp(nuclearIntegration*(.28+.42*warningQuality+.30*safety)*(.72+.28*human));
  const falseAlarmFiltering=clamp(warningQuality*(.35+.65*ai.evaluationMaturity)*(.65+.35*human));

  // Autonomous retaliation is intentionally dangerous. Human release authority and mature controls suppress,
  // but do not erase, the extra command-and-control risk created by deep strategic integration.
  const autonomyExposure=clamp(p.autonomousRetaliation*nuclearIntegration*(1-human*.82));
  const commandRisk=clamp(
    ai.lossOfControlHazard*(.35+.65*nuclearIntegration)+
    autonomyExposure*(.18+.42*(1-safety))+
    nuclearIntegration*(1-ai.monitoringMaturity)*.06
  );

  return {
    warningQuality,
    decisionSupport,
    secondStrikeResilience,
    falseAlarmFiltering,
    commandRisk,
    humanReleaseAuthority:human,
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
