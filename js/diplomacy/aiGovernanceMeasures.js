import { AI_GOVERNANCE_MEASURES, ensureAiGovernance } from './aiStatecraft.js?v=20260923-ai-statecraft1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const polityId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;

function accordsFor(world,id,measure){
  return (world.aiGovernanceAccords||[]).filter(a=>a?.active&&a.memberPolityIds?.includes?.(id)&&a.measures?.includes?.(measure));
}

export function applyAdditionalAiGovernanceMeasures(world,elapsedDays=30){
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  for(const region of world.regions||[]){
    const id=polityId(region);if(!id)continue;
    const g=ensureAiGovernance(region);
    const notification=accordsFor(world,id,AI_GOVERNANCE_MEASURES.FRONTIER_MODEL_NOTIFICATION);
    const autonomous=accordsFor(world,id,AI_GOVERNANCE_MEASURES.AUTONOMOUS_WEAPON_LIMITS);
    const hotlines=accordsFor(world,id,AI_GOVERNANCE_MEASURES.EMERGENCY_HOTLINE);

    if(notification.length){
      const strength=Math.max(...notification.map(a=>clamp(a.reportingStrength)));
      g.policy.registryCompliance=clamp(g.policy.registryCompliance+years*.035*strength*(1-g.policy.registryCompliance));
      g.policy.transparency=clamp(g.policy.transparency+years*.018*strength*(1-g.policy.transparency));
    }

    if(autonomous.length){
      const restraint=clamp(g.policy.strategicRestraint);
      const strength=Math.max(...autonomous.map(a=>clamp(a.verificationStrength)));
      const reduction=years*.045*restraint*(.45+.55*strength);
      if(region.aiControl?.access)region.aiControl.access.military=clamp((region.aiControl.access.military||0)-reduction);
      if(region.strategicAi?.policy)region.strategicAi.policy.militaryDecisionSupport=clamp((region.strategicAi.policy.militaryDecisionSupport||0)-reduction*.7);
      if(Number.isFinite(region.aiMilitaryIntegration))region.aiMilitaryIntegration=clamp(region.aiMilitaryIntegration-reduction*.8);
    }

    if(hotlines.length){
      const strength=Math.max(...hotlines.map(a=>clamp(a.reportingStrength*.45+a.verificationStrength*.55)));
      region.strategicCrisisPressure=clamp((region.strategicCrisisPressure||0)-years*.055*strength);
      region.aiIncidentEscalationPressure=clamp((region.aiIncidentEscalationPressure||0)-years*.045*strength);
    }

    if(notification.length||autonomous.length||hotlines.length){
      region.report||={};region.report.aiGovernance||={};
      region.report.aiGovernance.activeTreatyMeasures=[...new Set([
        ...(notification.length?[AI_GOVERNANCE_MEASURES.FRONTIER_MODEL_NOTIFICATION]:[]),
        ...(autonomous.length?[AI_GOVERNANCE_MEASURES.AUTONOMOUS_WEAPON_LIMITS]:[]),
        ...(hotlines.length?[AI_GOVERNANCE_MEASURES.EMERGENCY_HOTLINE]:[]),
      ])];
    }
  }
}
