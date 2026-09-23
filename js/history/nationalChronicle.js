const CHRONICLE_VERSION = 1;
const START_YEAR_ASTRONOMICAL = -1299; // 1300 BCE; astronomical year 0 = 1 BCE.

function polityFor(world, polityId) {
  return (world?.polities || []).find((polity) => polity?.id === polityId) || null;
}

export function ensureNationalChronicle(polity) {
  if (!polity) return null;
  polity.nationalChronicle ||= {};
  const chronicle = polity.nationalChronicle;
  chronicle.version = CHRONICLE_VERSION;
  if (!Array.isArray(chronicle.entries)) chronicle.entries = [];
  if (!Number.isFinite(chronicle.nextId)) chronicle.nextId = chronicle.entries.length + 1;
  return chronicle;
}

export function chronicleDateLabel(elapsedDays = 0) {
  const yearsElapsed = Math.max(0, Number(elapsedDays) || 0) / 365.2425;
  const astronomicalYear = START_YEAR_ASTRONOMICAL + Math.floor(yearsElapsed);
  if (astronomicalYear <= 0) return `${1 - astronomicalYear} BCE`;
  return `${astronomicalYear} CE`;
}

export function appendChronicleEntry(world, polityId, entry = {}) {
  const polity = polityFor(world, polityId);
  const chronicle = ensureNationalChronicle(polity);
  if (!chronicle) return null;

  const tick = Number.isFinite(entry.tick) ? entry.tick : Number(world?.clock?.tickIndex) || 0;
  const elapsedDays = Number.isFinite(entry.elapsedDays) ? entry.elapsedDays : Number(world?.clock?.elapsedDays) || 0;
  const record = {
    id: entry.id || `chronicle-${chronicle.nextId++}`,
    category: entry.category || 'general',
    kind: entry.kind || 'event',
    tick,
    elapsedDays,
    dateLabel: entry.dateLabel || chronicleDateLabel(elapsedDays),
    title: String(entry.title || 'Historical event'),
    body: String(entry.body || ''),
    importance: entry.importance || 'normal',
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    ...entry,
  };
  chronicle.entries.push(record);
  return record;
}

export function chronicleEntries(world, polityId, { category = null, query = '', kind = null, newestFirst = true } = {}) {
  const polity = polityFor(world, polityId);
  const entries = [...(ensureNationalChronicle(polity)?.entries || [])];
  const needle = String(query || '').trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (category && category !== 'all' && entry.category !== category) return false;
    if (kind && kind !== 'all' && entry.kind !== kind) return false;
    if (!needle) return true;
    const haystack = [entry.title, entry.body, entry.dateLabel, entry.category, entry.kind, ...(entry.tags || [])].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
  filtered.sort((a, b) => (Number(a.elapsedDays) || 0) - (Number(b.elapsedDays) || 0) || (Number(a.tick) || 0) - (Number(b.tick) || 0));
  if (newestFirst) filtered.reverse();
  return filtered;
}

export function migrateLegacyTechnologyLog(world, polityId, technologyAttention) {
  if (!technologyAttention || technologyAttention.chronicleMigrated) return 0;
  const polity = polityFor(world, polityId);
  const chronicle = ensureNationalChronicle(polity);
  if (!chronicle) return 0;
  const existingKeys = new Set(chronicle.entries.filter((entry) => entry.category === 'technology')
    .map((entry) => `${entry.kind}:${entry.techId || ''}:${entry.sourcePolityId || ''}:${entry.tick || 0}`));
  let migrated = 0;
  for (const legacy of technologyAttention.log || []) {
    const key = `${legacy.kind}:${legacy.techId || ''}:${legacy.sourcePolityId || ''}:${legacy.tick || 0}`;
    if (existingKeys.has(key)) continue;
    appendChronicleEntry(world, polityId, {
      ...legacy,
      category: 'technology',
      kind: legacy.kind || 'technology',
      elapsedDays: Number.isFinite(legacy.elapsedDays) ? legacy.elapsedDays : 0,
      tags: ['technology', legacy.techId, legacy.channel, legacy.sourcePolityId].filter(Boolean),
    });
    existingKeys.add(key);
    migrated += 1;
  }
  technologyAttention.chronicleMigrated = true;
  return migrated;
}
