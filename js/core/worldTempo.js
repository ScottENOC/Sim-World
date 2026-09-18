import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const weightedAverage = (entries, valueFn) => {
  let weighted = 0;
  let totalWeight = 0;
  for (const region of entries) {
    const weight = Math.max(1, Number(region.population) || 1);
    weighted += clamp(valueFn(region)) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
};

function infrastructureSignal(region, type, scale = 1) {
  return clamp(effectiveInfrastructureCount(region, type) / Math.max(0.01, scale));
}

function knowledgeSignal(region, techId) {
  return region.unlockedTechIds?.has?.(techId) ? 1 : 0;
}

function railSignal(region) {
  const network = Number(region.railway?.networkLevel ?? region.railways?.networkLevel ?? region.railNetwork?.coverage);
  if (Number.isFinite(network)) return clamp(network);
  return Math.max(
    infrastructureSignal(region, 'railway', 1),
    infrastructureSignal(region, 'rail_network', 1),
    knowledgeSignal(region, 'rail_transport') * 0.15,
  );
}

function telegraphSignal(region) {
  return Math.max(
    infrastructureSignal(region, 'telegraph_network', 1),
    knowledgeSignal(region, 'electrical_telegraphy') * 0.12,
  );
}

function telephoneSignal(region) {
  const coverage = Number(region.telephoneNetwork?.coverage ?? region.localCommunications?.telephoneCoverage);
  return Math.max(
    Number.isFinite(coverage) ? clamp(coverage) : 0,
    infrastructureSignal(region, 'telephone_exchange', 2),
    knowledgeSignal(region, 'telephone_networks') * 0.08,
  );
}

function electricitySignal(region) {
  const coverage = Number(region.electricity?.coverage ?? region.electricity?.servedShare ?? region.localGrid?.coverage);
  return Math.max(
    Number.isFinite(coverage) ? clamp(coverage) : 0,
    infrastructureSignal(region, 'local_electric_grid', 2),
    knowledgeSignal(region, 'local_electric_distribution') * 0.08,
  );
}

function aviationSignal(region) {
  const aircraft = Array.isArray(region.aviation?.aircraft) ? region.aviation.aircraft.length
    : Array.isArray(region.aircraft) ? region.aircraft.length
      : Number(region.aviation?.aircraftCount ?? region.aircraftCount) || 0;
  const operational = clamp(aircraft / 12);
  return Math.max(
    infrastructureSignal(region, 'airfield', 2) * 0.65 + operational * 0.35,
    knowledgeSignal(region, 'powered_flight') * 0.05,
  );
}

function administrativeSignal(region) {
  const literacy = clamp(region.publicEducation?.literacy ?? region.educationLevel ?? 0);
  const admin = clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.2);
  const printing = knowledgeSignal(region, 'printing_press');
  const relay = infrastructureSignal(region, 'relay_stations', 1);
  return clamp(literacy * 0.30 + admin * 0.25 + printing * 0.20 + relay * 0.25);
}

function leadingEdge(regions, valueFn) {
  const values = regions.map((region) => clamp(valueFn(region))).sort((a, b) => b - a);
  if (!values.length) return 0;
  const count = Math.max(1, Math.ceil(values.length * 0.12));
  return values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
}

function adoption(regions, valueFn) {
  // The global clock should not jump because one city built a prototype, but it
  // also should not wait for every remote region to industrialise. Blend broad
  // population coverage with the established leading edge of the world system.
  return clamp(weightedAverage(regions, valueFn) * 0.72 + leadingEdge(regions, valueFn) * 0.28);
}

export function assessWorldTempo(regions = []) {
  if (!regions.length) return { index: 0, daysPerTick: 30, label: 'monthly', signals: {} };
  const signals = {
    administration: adoption(regions, administrativeSignal),
    rail: adoption(regions, railSignal),
    telegraph: adoption(regions, telegraphSignal),
    telephone: adoption(regions, telephoneSignal),
    electricity: adoption(regions, electricitySignal),
    aviation: adoption(regions, aviationSignal),
  };

  // Communications and transport dominate because they make decisions and
  // events propagate faster. Administrative capacity matters earlier but has a
  // deliberately limited ceiling so literate empires do not become "modern"
  // without modern communications and transport.
  const index = clamp(
    signals.administration * 0.12 +
    signals.rail * 0.23 +
    signals.telegraph * 0.27 +
    signals.telephone * 0.16 +
    signals.electricity * 0.09 +
    signals.aviation * 0.13
  );

  // Smooth exponential compression: 0 => 30 days, ~0.25 => 15 days,
  // ~0.45 => 8 days, ~0.65 => 4 days, 1 => ~1 day. No era/date thresholds.
  const daysPerTick = Math.max(1, Math.min(30, 30 * Math.exp(-3.35 * index)));
  const label = daysPerTick >= 24 ? 'monthly'
    : daysPerTick >= 10 ? 'multi-week'
      : daysPerTick >= 5 ? 'weekly'
        : daysPerTick >= 2 ? 'multi-day' : 'daily';
  return { index, daysPerTick, label, signals };
}
