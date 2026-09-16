export * from './continuityCore.js?v=20260916-regime1';

import { tickPoliticalContinuity as tickPoliticalContinuityCore } from './continuityCore.js?v=20260916-regime1';
import { tickPopularWellbeing } from './popularWellbeing.js?v=20260916-regime1';
import { tickInstitutionalPolitics } from './institutionalIntegration.js?v=20260916-regime1';
import { tickRegimeChange } from './regimeChange.js?v=20260916-regime1';

/**
 * Live political pass used by main.js. Popular wellbeing feeds institutional
 * pressure; institutional pressure can then produce coups or revolutions; the
 * existing continuity/exile pass runs last against the resulting sovereignty.
 */
export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0, options = {}) {
  const elapsedDays = Math.max(0, Number(elapsedYears) || 0) * 365.2425;
  const popularEvents = tickPopularWellbeing(regions, polities, elapsedDays, options);
  const institutionalEvents = tickInstitutionalPolitics(polities, regions, currentTick, elapsedDays, options);
  const regimeEvents = tickRegimeChange(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);
  const continuityEvents = tickPoliticalContinuityCore(polities, regions, elapsedYears, currentTick, options);
  return [...popularEvents, ...institutionalEvents, ...regimeEvents, ...continuityEvents];
}
