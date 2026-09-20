import { ensureCovertIncidentEscalation, registerCovertIncident } from './covertIncidentEscalation.js?v=20260920-covert-escalation1';

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
      created.push(incident);
    }

    const threat = region.militaryThreat || {};
    if (Number.isFinite(threat.lastCovertAttackTick) && threat.lastCovertAttackTick <= currentTick) {
      const key = `threat:${region.id}:${threat.lastCovertAttackTick}:${threat.lastCovertAttackMission || 'unknown'}`;
      if (!state.harvestedKeys[key]) {
        const incident = registerCovertIncident(region, {
          id: `covert-incident-${key}`,
          mission: threat.lastCovertAttackMission || 'unknown',
          sourceActorId: threat.lastCovertAttackActorId || null,
          attributed: !!threat.lastCovertAttackAttributed,
          attributionProbability: threat.lastCovertAttackAttributed ? .72 : .22,
          detected: true,
          success: true,
        }, threat.lastCovertAttackTick);
        state.harvestedKeys[key] = true;
        created.push(incident);
      }
    }
  }
  return created;
}
