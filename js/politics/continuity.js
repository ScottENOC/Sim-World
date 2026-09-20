export * from './continuityCore.js?v=20260916-regime1';

import { tickPoliticalContinuity as tickPoliticalContinuityCore } from './continuityCore.js?v=20260916-regime1';
import { tickPopularWellbeing } from './popularWellbeing.js?v=20260916-regime1';
import { tickInstitutionalPolitics } from './institutionalIntegration.js?v=20260916-regime1';
import { tickRegimeChange } from './regimeChange.js?v=20260916-regime1';
import { processPendingLeadershipShocks } from './leadershipShocks.js?v=20260920-leadership-shock1';
import { harvestCovertIncidents } from '../diplomacy/covertIncidentBridge.js?v=20260920-covert-escalation1';
import { tickCovertIncidentEscalation } from '../diplomacy/covertIncidentEscalation.js?v=20260920-covert-escalation1';

/**
 * Live political pass used by main.js. Popular wellbeing feeds institutional
 * pressure; detected covert attacks become diplomatic incidents before their
 * leadership shocks alter elite legitimacy/coup conditions; institutional
 * pressure can then produce coups or revolutions; the existing continuity/exile
 * pass runs last against the resulting sovereignty.
 */
export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0, options = {}) {
  const elapsedDays = Math.max(0, Number(elapsedYears) || 0) * 365.2425;
  const popularEvents = tickPopularWellbeing(regions, polities, elapsedDays, options);
  const harvested = harvestCovertIncidents(regions, currentTick);
  const covertEvents = tickCovertIncidentEscalation(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);
  const leadershipEvents = processPendingLeadershipShocks(polities, regions, currentTick, elapsedDays);
  const institutionalEvents = tickInstitutionalPolitics(polities, regions, currentTick, elapsedDays, options);
  const regimeEvents = tickRegimeChange(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);
  const continuityEvents = tickPoliticalContinuityCore(polities, regions, elapsedYears, currentTick, options);
  const harvestEvents = harvested.map((incident) => ({
    type: 'covert_incident_created',
    incidentId: incident.id,
    targetRegionId: incident.targetRegionId,
    targetActorId: incident.targetActorId,
    attributedActorId: incident.attributedActorId,
    attributionConfidence: incident.attributionConfidence,
    mission: incident.mission,
  }));
  return [...popularEvents, ...harvestEvents, ...covertEvents, ...leadershipEvents, ...institutionalEvents, ...regimeEvents, ...continuityEvents];
}
