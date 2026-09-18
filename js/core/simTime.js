// Simulation time is measured in days. A world tick is only a scheduling
// cadence; systems should use elapsedDays rather than assuming a fixed week.
// This lets a 30-day Bronze Age tick contain events on day 8, 19, etc.
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_YEAR = 365.2425;

export const TIME_RESOLUTIONS = Object.freeze({
  month: { id: 'month', label: 'month', daysPerTick: 30 },
  fortnight: { id: 'fortnight', label: 'fortnight', daysPerTick: 14 },
  week: { id: 'week', label: 'week', daysPerTick: 7 },
  day: { id: 'day', label: 'day', daysPerTick: 1 },
});

// Legacy compatibility for callers that still provide coarse capabilities.
// The live game now uses the continuous deployment-driven worldTempo model.
const PACE_TRIGGERS = Object.freeze([
  { capability: 'internet', resolution: 'day' },
  { capability: 'powered_flight', resolution: 'day' },
  { capability: 'electric_grid', resolution: 'week' },
  { capability: 'rail_transport', resolution: 'fortnight' },
]);

export function resolutionForWorld(capabilities = new Set()) {
  for (const trigger of PACE_TRIGGERS) {
    if (capabilities.has(trigger.capability)) return TIME_RESOLUTIONS[trigger.resolution];
  }
  return TIME_RESOLUTIONS.month;
}

export function elapsedWeeks(days) {
  return days / DAYS_PER_WEEK;
}

export function compoundFraction(weeklyFraction, elapsedDays) {
  const weeks = Math.max(0, elapsedWeeks(elapsedDays));
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, weeklyFraction)), weeks);
}

export function chanceOverDays(weeklyChance, elapsedDays) {
  return compoundFraction(weeklyChance, elapsedDays);
}

export function calendarWeekIndex(elapsedDays) {
  return Math.floor(Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_WEEK);
}

export function elapsedYears(elapsedDays) {
  return Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
}

export function annualFractionRate(annualRate, elapsedDays) {
  const years = elapsedYears(elapsedDays);
  return 1 - Math.pow(Math.max(0, 1 - annualRate), years);
}

export function formatHistoricalDate(startYear, elapsedDays, daysPerTick = 30) {
  const absoluteDays = Math.max(0, Number(elapsedDays) || 0);
  const yearsElapsed = Math.floor(absoluteDays / DAYS_PER_YEAR);
  const year = startYear + yearsElapsed;
  const dayOfYear = Math.floor(absoluteDays - yearsElapsed * DAYS_PER_YEAR);
  const daysPerMonth = DAYS_PER_YEAR / 12;
  const month = Math.min(12, Math.floor(dayOfYear / daysPerMonth) + 1);
  const dayWithinMonth = Math.min(31, Math.floor(dayOfYear - (month - 1) * daysPerMonth) + 1);
  const era = year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  return Number(daysPerTick) < 20
    ? `Day ${dayWithinMonth}, Month ${month}, ${era}`
    : `Month ${month}, ${era}`;
}
