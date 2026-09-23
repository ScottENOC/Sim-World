export const ADVISOR_DIRECTORY = Object.freeze({
  marshal: Object.freeze({ id: 'marshal', name: 'Marshal', brief: 'forces, war and security' }),
  treasurer: Object.freeze({ id: 'treasurer', name: 'Treasurer', brief: 'coin, trade and finance' }),
  steward: Object.freeze({ id: 'steward', name: 'Steward', brief: 'people, food, infrastructure and resources' }),
  envoy: Object.freeze({ id: 'envoy', name: 'Envoy', brief: 'foreign relations and agreements' }),
  chancellor: Object.freeze({ id: 'chancellor', name: 'Chancellor', brief: 'government, law and the realm' }),
  priest: Object.freeze({ id: 'priest', name: 'High Priest', brief: 'faith and religious authority' }),
  spymaster: Object.freeze({ id: 'spymaster', name: 'Spymaster', brief: 'knowledge, intelligence and technology' }),
});

const RULES = Object.freeze([
  // Put subject-specific knowledge/technology and faith rules ahead of generic
  // delivery channels such as trade or diplomacy. A steel report carried by a
  // merchant is still technological intelligence; the messenger does not own it.
  ['spymaster', /\b(technology|technological|breakthrough|discovery|research|intelligence|spy|spymaster|covert|secret|sabotage|intercept|scout|unknown|rumour|rumor|forgery|counter-intelligence|counter intelligence|surveillance|cyber|cryptograph|information operation|steel|steelmaking|ironwork|rifling|gunpowder)\b/i],
  ['spymaster', /\bforeign\b.{0,60}\bobserved\b|\bnew craft reported\b|\bsignificant advance\b/i],
  ['priest', /\b(religion|religious|faith|holy|temple|priest|church|conversion|heresy|doctrine|pilgrim|worship|sacred|divine)\b/i],
  ['marshal', /\b(army|armies|military|war\b|battle|campaign|raid|raider|fleet|naval|ship|siege|fort|mobilis|demobilis|troop|soldier|weapon|artillery|aircraft|aviation|missile|nuclear strike|occupation|garrison|combat|enemy force|veteran)\b/i],
  ['treasurer', /\b(treasur|coin|finance|financial|debt|credit|bond|currency|tax|tariff|trade|market|merchant|commercial|firm|company|bank|capital|revenue|budget|payroll|bankrupt|insolv|price|inflation|money|import|export)\b/i],
  ['steward', /\b(food|famine|harvest|crop|granary|hunger|disease|illness|outbreak|epidemic|plague|water|drought|flood|reservoir|aquifer|irrigation|migration|migrant|refugee|population|housing|construction|infrastructure|road|bridge|harbour|grid|electricity|energy|power shortage|pollution|climate|environment|school|education|labour|employment|factory|mine|agricultur)\b/i],
  ['envoy', /\b(diplomat|envoy|foreign relation|treaty|agreement|alliance|ally|sanction|embargo|international organisation|international organization|ambassador|courier|negotiat|tribute demand|military aid|joint operation|recognition|foreign government)\b/i],
  ['chancellor', /\b(government|governance|realm|polity|administration|law|legal|regime|succession|election|parliament|council|unrest|revolt|uprising|civil war|coup|legitimacy|settlement|autonomy|vassal|state capacity|constitution|mass politics|protest)\b/i],
]);

export function advisorForReport(title = '', body = '') {
  const text = `${String(title || '')} ${String(body || '')}`;
  for (const [advisorId, pattern] of RULES) if (pattern.test(text)) return advisorId;
  return 'chancellor';
}

export function advisorDetails(advisorId) {
  return ADVISOR_DIRECTORY[advisorId] || ADVISOR_DIRECTORY.chancellor;
}

export function advisorFramedTitle(title = 'Report', advisorId = 'chancellor') {
  const clean = String(title || 'Report').trim() || 'Report';
  const advisor = advisorDetails(advisorId);
  const prefix = `${advisor.name}:`;
  if (clean.toLowerCase().startsWith(prefix.toLowerCase())) return clean;
  return `${prefix} ${clean}`;
}

export function advisorReviewLabel(advisorId) {
  return `Review with ${advisorDetails(advisorId).name}`;
}
