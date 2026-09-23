import { appendChronicleEntry, ensureNationalChronicle } from './nationalChronicle.js';

const RULES = [
  { category: 'war', kind: 'war', importance: 'major', re: /\b(war declared|declares war|war begins|war ended|peace treaty|armistice|ceasefire|campaign victory|campaign defeat|battle won|battle lost|surrender|capitulat|occupation)\b/i },
  { category: 'territory', kind: 'territorial_change', importance: 'major', re: /\b(annex|annexed|ceded|cession|territor(?:y|ial)|region transferred|conquered|liberated|seceded|independence|vassal(?:age)?|protectorate)\b/i },
  { category: 'government', kind: 'leadership', importance: 'major', re: /\b(new ruler|new king|new queen|succession|coronation|abdicated|abdication|leader died|ruler died|head of state|dynasty)\b/i },
  { category: 'government', kind: 'regime_change', importance: 'major', re: /\b(coup|revolution|civil war ended|regime change|government collapsed|government formed|constitution|republic proclaimed|monarchy restored|dictatorship|democratisation|democratization)\b/i },
  { category: 'politics', kind: 'election', importance: 'normal', re: /\b(election|referendum|plebiscite|vote returned|new parliament|assembly elected)\b/i },
  { category: 'diplomacy', kind: 'treaty', importance: 'normal', re: /\b(treaty|alliance|defence pact|defense pact|non-aggression|international organisation|international organization|federation|union formed|diplomatic recognition)\b/i },
  { category: 'religion', kind: 'religious_change', importance: 'major', re: /\b(state religion|religious reform|reformation|conversion|converted|holy city|schism|new faith|religion adopted|religion established)\b/i },
  { category: 'disaster', kind: 'disaster', importance: 'major', re: /\b(earthquake|tsunami|volcan|eruption|flood|drought|famine|plague|pandemic|epidemic|catastroph|major fire|cyclone|hurricane|typhoon)\b/i },
  { category: 'nuclear', kind: 'nuclear_first', importance: 'major', re: /\b(first nuclear test|nuclear test|nuclear weapon detonated|atomic bomb|hydrogen bomb|thermonuclear|nuclear strike|nuclear weapon used)\b/i },
  { category: 'space', kind: 'space_first', importance: 'major', re: /\b(first satellite|first orbital|first orbit|first astronaut|first cosmonaut|first crewed|first manned|moon landing|lunar landing|space station|first probe|first spacecraft|space launch)\b/i },
  { category: 'state', kind: 'state_change', importance: 'major', re: /\b(state formed|state formation|nation formed|country formed|polity formed|state collapsed|nation collapsed|country collapsed|dissolution|unification|unified|independent state)\b/i },
  { category: 'infrastructure', kind: 'major_infrastructure', importance: 'normal', re: /\b(first railway|first railroad|first power station|first electricity grid|national grid|first telegraph|first telephone|first airport|first harbour|first harbor|major dam|canal opened|interconnector|undersea cable|subsea cable|spaceport)\b/i },
];

const TECHNOLOGY_RE = /\b(breakthrough|technology|discovery|invented|steelmaking|ironworking|rifling|gunpowder)\b/i;
const ROUTINE_RE = /\b(weekly|monthly|routine|maintenance due|market price|minor shortage|recognised disease threat)\b/i;

function compact(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

export function classifyHistoricalEvent(title, body = '') {
  const text = `${compact(title)} ${compact(body)}`;
  if (!text.trim() || ROUTINE_RE.test(text)) return null;
  // Technology has its own structured chronicle path with source/channel metadata.
  if (TECHNOLOGY_RE.test(text) && !/nuclear|space|satellite|orbit/i.test(text)) return null;
  return RULES.find((rule) => rule.re.test(text)) || null;
}

function dedupeKey(rule, title, body, tick) {
  const bucket = Math.floor((Number(tick) || 0) / 2);
  return `${rule.category}:${rule.kind}:${compact(title).toLowerCase()}:${compact(body).toLowerCase()}:${bucket}`;
}

export function recordHistoricalPlayerEvent(world, { title, body = '', advisor = null } = {}) {
  const polityId = world?.activePlayerPolityId;
  if (!polityId) return null;
  const rule = classifyHistoricalEvent(title, body);
  if (!rule) return null;
  const polity = (world.polities || []).find((candidate) => candidate?.id === polityId);
  const chronicle = ensureNationalChronicle(polity);
  if (!chronicle) return null;
  chronicle.historicalEventKeys ||= [];
  const tick = Number(world?.clock?.tickIndex) || 0;
  const key = dedupeKey(rule, title, body, tick);
  if (chronicle.historicalEventKeys.includes(key)) return null;
  chronicle.historicalEventKeys.push(key);
  if (chronicle.historicalEventKeys.length > 5000) chronicle.historicalEventKeys.splice(0, chronicle.historicalEventKeys.length - 5000);
  return appendChronicleEntry(world, polityId, {
    category: rule.category,
    kind: rule.kind,
    importance: rule.importance,
    title: compact(title) || 'Historical event',
    body: compact(body),
    advisor,
    tags: [rule.category, rule.kind, advisor].filter(Boolean),
  });
}
