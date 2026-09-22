import { ensureCovertIncidentEscalation, registerCovertIncident } from './covertIncidentEscalation.js?v=20260920-covert-escalation1';
import { recordInformationIncident, publishCompetingNarrative } from './informationIntegrity.js?v=20260922-info2';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function sameObservedIncident(existing, mission, tick, actorId) {
  return existing.some((incident) =>
    incident.mission === mission &&
    incident.createdTick === tick &&
    (!actorId || !incident.attributedActorId || incident.attributedActorId === actorId));
}

function headlineFor(incident){
  const labels={
    vip_assassination:'Senior figure killed in suspected covert attack',
    vip_capture:'Senior figure seized in suspected covert operation',
    sabotage:'Sabotage reported against critical infrastructure',
    cyber_attack:'Disruptive cyber attack reported',
    infrastructure_attack:'Critical infrastructure attack reported',
    unknown:'Suspected covert attack reported',
  };
  return labels[incident.mission]||`Suspected ${String(incident.mission||'covert attack').replaceAll('_',' ')} reported`;
}

function publishObservedCovertClaim(region,incident,currentTick){
  if(!incident?.detected)return null;
  const attributed=Boolean(incident.attributed||incident.attributedActorId);
  const attributionProbability=clamp(incident.attributionProbability??(attributed?.72:.22));
  const digital=String(incident.mission||'').includes('cyber');
  const physical=String(incident.mission||'').includes('assassination')||String(incident.mission||'').includes('capture')||String(incident.mission||'').includes('sabotage');
  const publicIncident=recordInformationIncident(region,{
    id:`public-${incident.id}`,
    type:'covert_incident',
    headline:headlineFor(incident),
    tick:incident.createdTick??currentTick,
    receivedTick:incident.createdTick??currentTick,
    allegedActorId:incident.attributedActorId||incident.sourceActorId||null,
    evidenceType:digital?'digital':physical?'mixed':'mixed',
    sourceReliability:incident.success===false?.44:.62,
    corroboration:incident.success===false?.22:.42,
    provenance:digital?.34:.26,
    forensicSupport:digital?.48:physical?.38:.25,
    attributionEvidence:attributionProbability,
    evidence:[{
      sourceId:`security-services-${region.id}`,
      evidenceType:digital?'digital':'document',
      sourceReliability:.68,
      provenance:digital?.40:.32,
      forensicSupport:digital?.52:physical?.42:.30,
      forensicPotential:digital?.88:physical?.70:.55,
      attributionEvidence:attributionProbability,
      receivedTick:incident.createdTick??currentTick,
    }],
  });
  if(publicIncident?.id&&publicIncident.allegedActorId){
    publishCompetingNarrative(region,publicIncident.id,{
      kind:'denial_actor',
      reach:attributed?.52:.30,
      sourceReliability:.40,
      evidenceSupport:attributed?.10:.24,
      publishedTick:incident.createdTick??currentTick,
    });
  }
  if(publicIncident?.id&&digital){
    publishCompetingNarrative(region,publicIncident.id,{
      kind:'alternative_actor',
      reach:.34,
      sourceReliability:.44,
      evidenceSupport:.18,
      publishedTick:incident.createdTick??currentTick,
    });
  }
  return publicIncident;
}

export function harvestCovertIncidents(regions, currentTick = 0) {
  const created = [];
  for (const region of regions || []) {
    const state = ensureCovertIncidentEscalation(region);
    state.harvestedKeys ||= {};

    for (const shock of region.governance?.pendingLeadershipShocks || []) {
      const key = shock.operationId || `leadership:${region.id}:${shock.tick}:${shock.vip?.id || 'vip'}`;
      if (state.harvestedKeys[key]) continue;
      const mission = shock.removedBy === 'assassination' ? 'vip_assassination' : 'vip_capture';
      const incident = registerCovertIncident(region, {
        id: `covert-incident-${key}`,
        operationId: shock.operationId || null,
        mission,
        sourceActorId: shock.sourceActorId || null,
        attributed: !!shock.attributed,
        attributionProbability: shock.attributed ? .82 : .28,
        detected: shock.detected !== false,
        success: true,
        effect: shock.removedBy === 'assassination' ? 'vip_assassinated' : 'vip_captured',
        vip: shock.vip || null,
      }, shock.tick ?? currentTick);
      state.harvestedKeys[key] = true;
      publishObservedCovertClaim(region,incident,shock.tick??currentTick);
      created.push(incident);
    }

    const threat = region.militaryThreat || {};
    if (Number.isFinite(threat.lastCovertAttackTick) && threat.lastCovertAttackTick <= currentTick) {
      const mission = threat.lastCovertAttackMission || 'unknown';
      const key = `threat:${region.id}:${threat.lastCovertAttackTick}:${mission}`;
      if (!state.harvestedKeys[key]) {
        const alreadyRepresented = sameObservedIncident(
          state.incidents,
          mission,
          threat.lastCovertAttackTick,
          threat.lastCovertAttackAttributed ? threat.lastCovertAttackActorId : null,
        );
        state.harvestedKeys[key] = true;
        if (!alreadyRepresented) {
          const incident = registerCovertIncident(region, {
            id: `covert-incident-${key}`,
            mission,
            sourceActorId: threat.lastCovertAttackActorId || null,
            attributed: !!threat.lastCovertAttackAttributed,
            attributionProbability: threat.lastCovertAttackAttributed ? .72 : .22,
            detected: true,
            success: true,
          }, threat.lastCovertAttackTick);
          publishObservedCovertClaim(region,incident,threat.lastCovertAttackTick);
          created.push(incident);
        }
      }
    }
  }
  return created;
}
