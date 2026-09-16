export * from './continuityCore.js?v=20260916-regime1';

import { tickPoliticalContinuity as tickPoliticalContinuityCore } from './continuityCore.js?v=20260916-regime1';
import { tickPopularWellbeing } from './popularWellbeing.js?v=20260916-regime1';
import { tickInstitutionalPolitics } from './institutionalIntegration.js?v=20260916-regime1';
import { tickRegimeChange } from './regimeChange.js?v=20260916-regime1';

const PLAYER_REGIME_WARNING_INTERVAL_WEEKS = 52;

/**
 * Live political pass used by main.js. Popular wellbeing feeds institutional
 * pressure; institutional pressure can then produce coups or revolutions; the
 * existing continuity/exile pass runs last against the resulting sovereignty.
 */
export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0, options = {}) {
  const elapsedDays = Math.max(0, Number(elapsedYears) || 0) * 365.2425;
  const popularEvents = tickPopularWellbeing(regions, polities, elapsedDays, options);
  const institutionalEvents = tickInstitutionalPolitics(polities, regions, currentTick, elapsedDays, options);
  const rawRegimeEvents = tickRegimeChange(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);
  const regimeEvents = rawRegimeEvents.filter((event) => {
    if (event.type !== 'player_regime_crisis') return true;
    const polity = (polities || []).find((candidate) => candidate.id === event.polityId);
    if (!polity) return false;
    polity.institutionalCrisis ||= {};
    const lastWarning = polity.institutionalCrisis.lastPlayerRegimeWarningTick;
    if (Number.isFinite(lastWarning) && currentTick - lastWarning < PLAYER_REGIME_WARNING_INTERVAL_WEEKS) return false;
    polity.institutionalCrisis.lastPlayerRegimeWarningTick = currentTick;
    return true;
  });
  const continuityEvents = tickPoliticalContinuityCore(polities, regions, elapsedYears, currentTick, options);
  return [...popularEvents, ...institutionalEvents, ...regimeEvents, ...continuityEvents];
}
