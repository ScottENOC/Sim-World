from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'missing patch anchor in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# knowledge.js: scout source + initial wider awareness + explicit Cyprus contacts + scout reports.
path = 'js/core/knowledge.js'
replace(path,
"  SPY: 'spy',\n});",
"  SPY: 'spy',\n  SCOUT: 'scout',\n});")
replace(path,
"  KNOWLEDGE_SOURCES.SPY,\n]);",
"  KNOWLEDGE_SOURCES.SPY,\n  KNOWLEDGE_SOURCES.SCOUT,\n]);")
replace(path,
"export function initialiseKnowledge(regions) {\n  const byId = new Map(regions.map((region) => [region.id, region]));\n\n  for (const region of regions) {\n    getLedger(region);\n    for (const neighbourId of region.neighbors || []) {\n      const neighbour = byId.get(neighbourId);\n      if (neighbour) addInitialNeighbourReports(region, neighbour);\n    }\n  }\n}\n",
"""function addInitialRumour(observer, subject, provenanceType, confidence = 0.35, locationConfidence = 0.25) {
  const ledger = getLedger(observer);
  if (!ledger || !subject || observer.id === subject.id) return;
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.RUMOUR,
    confidence,
    specificity: confidence,
    provenance: { type: provenanceType },
    subjectMatter: ['identity', 'inherited_geography'],
  });
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject) },
    source: KNOWLEDGE_SOURCES.RUMOUR,
    confidence: locationConfidence,
    specificity: locationConfidence,
    provenance: { type: provenanceType },
    subjectMatter: ['location', 'inherited_geography'],
  });
}

function initialDistanceKm(a, b) {
  const [lon1, lat1] = a?.centroid || [];
  const [lon2, lat2] = b?.centroid || [];
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Infinity;
  const toRad = Math.PI / 180;
  const p1 = lat1 * toRad, p2 = lat2 * toRad;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function addHistoricalContact(observer, subject, label = 'historical_contact') {
  const ledger = getLedger(observer);
  if (!ledger || !subject || observer.id === subject.id) return;
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.DIPLOMAT,
    confidence: 1,
    specificity: 1,
    provenance: { type: label },
    subjectMatter: ['identity', 'trade', 'diplomacy'],
  });
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject), routeKnown: true },
    source: KNOWLEDGE_SOURCES.DIPLOMAT,
    confidence: 0.95,
    specificity: 0.9,
    provenance: { type: label },
    subjectMatter: ['location', 'trade_route'],
  });
}

export function initialiseKnowledge(regions, seaRegions = []) {
  const byId = new Map(regions.map((region) => [region.id, region]));

  // Immediate land neighbours are certain direct contacts, as before.
  for (const region of regions) {
    getLedger(region);
    for (const neighbourId of region.neighbors || []) {
      const neighbour = byId.get(neighbourId);
      if (neighbour) addInitialNeighbourReports(region, neighbour);
    }
  }

  // People normally inherit some vague geography beyond the next border.
  // This is deliberately only a rumour: enough to know a direction, not enough
  // to trade, raid or inspect the region through fog of war.
  for (const region of regions) {
    const direct = new Set(region.neighbors || []);
    for (const neighbourId of direct) {
      const neighbour = byId.get(neighbourId);
      for (const secondId of neighbour?.neighbors || []) {
        if (secondId === region.id || direct.has(secondId)) continue;
        const second = byId.get(secondId);
        if (second) addInitialRumour(region, second, 'neighbour_of_neighbour', 0.4, 0.28);
      }
    }
  }

  // Very short sea crossings are usually part of inherited local geography,
  // but still do not automatically create diplomatic/trading contact.
  for (const sea of seaRegions || []) {
    const adjacent = (sea.adjacentLand || []).map((id) => byId.get(id)).filter(Boolean);
    for (let i = 0; i < adjacent.length; i += 1) for (let j = i + 1; j < adjacent.length; j += 1) {
      const a = adjacent[i], b = adjacent[j];
      if (initialDistanceKm(a, b) > 120) continue;
      addInitialRumour(a, b, 'short_sea_horizon', 0.5, 0.38);
      addInitialRumour(b, a, 'short_sea_horizon', 0.5, 0.38);
    }
  }

  // Historical 1300 BCE exception: Cyprus/Alashiya was already embedded in
  // eastern Mediterranean trade and diplomacy. Do this explicitly rather than
  // inventing a universal island-mainland rule.
  const names = new Map(regions.map((region) => [region.name, region]));
  const cyprus = ['Central Cyprus', 'Eastern Cyprus', 'Western Cyprus'].map((name) => names.get(name)).filter(Boolean);
  const easternContacts = ['Ugarit Coast', 'Cilicia', 'Lycia & Pamphylia', 'Northern Phoenician Coast', 'Central Phoenician Coast']
    .map((name) => names.get(name)).filter(Boolean);
  for (const island of cyprus) for (const coast of easternContacts) {
    addHistoricalContact(island, coast, 'late_bronze_age_cyprus_network');
    addHistoricalContact(coast, island, 'late_bronze_age_cyprus_network');
  }
}

export function recordScoutContact(observer, subject, receivedAt = null, mode = 'land') {
  if (!observer || !subject) return null;
  const ledger = getLedger(observer);
  const provenance = { type: 'government_scouting', mode };
  const existence = ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.SCOUT,
    observedAt: receivedAt,
    receivedAt,
    confidence: 0.9,
    specificity: 0.85,
    provenance,
    subjectMatter: ['identity', 'military_scouting'],
  });
  ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject), routeKnown: true },
    source: KNOWLEDGE_SOURCES.SCOUT,
    observedAt: receivedAt,
    receivedAt,
    confidence: 0.8,
    specificity: 0.75,
    provenance,
    subjectMatter: ['location', 'military_scouting'],
  });
  return existence;
}
""")

# Region state has an explicit scouting slot and navy commitment counter.
replace('js/world/region.js',
"    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0 };",
"    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0, scoutingBoats: 0 };\n    this.scouting = { active: false, lastResult: null };")

# AI: import scouting, consider it before diplomacy/war, and only from perceived local incentives.
replace('js/ai/nationAi.js',
"import { activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';",
"import { activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';\nimport { startScoutingMission } from '../core/scouting.js?v=20260906-scouting1';")
replace('js/ai/nationAi.js',
"    maybeAdjustTradeEmbargo(region, regionsById, currentTick);\n    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));",
"    maybeAdjustTradeEmbargo(region, regionsById, currentTick);\n    maybeScout(region, regionsById, currentTick, rng);\n    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));")
replace('js/ai/nationAi.js',
"function stableAiHash(value) {",
"""function maybeScout(region, regionsById, currentTick, rng) {
  if (region.scouting?.active) return;
  const contacts = directContactIds(region).size;
  const demand = region.marketDemand || {};
  const unmet = ['food', 'bronze', 'copper', 'wood', 'clothing']
    .reduce((sum, key) => sum + Math.max(0, Number(demand[key]) || 0), 0);
  const population = Math.max(1, region.population || 1);
  const shortagePressure = Math.min(1, unmet / Math.max(50, population * 0.02));
  const tradeExperience = (region.recentTradePartners?.size || 0) > 0 ||
    (region.occupations?.trader || 0) > 0 ||
    (region.tradeEconomy?.exportIncomeEma || 0) + (region.tradeEconomy?.importSpendEma || 0) > 20;

  // No omniscient catch-up motive. A truly isolated, self-sufficient society
  // does not know that unseen foreigners have better technology. Scouting is
  // attractive when rulers already understand trade, feel a local shortage,
  // or have remarkably few known neighbours despite maintaining armed forces.
  if (!tradeExperience && shortagePressure < 0.15 && contacts >= 2) return;
  const isolation = Math.max(0, 1 - contacts / 5);
  const motive = shortagePressure * 0.55 + (tradeExperience ? 0.25 : 0) + isolation * 0.2;
  if (motive < 0.18 || rng() > Math.min(0.65, motive)) return;

  startScoutingMission(region, [...regionsById.values()], currentTick, rng, 'auto');
}

function stableAiHash(value) {""")

# main.js: initialise with sea geography, tick missions, and expose player controls.
replace('js/main.js',
"import { buildFishingContactPairs, initialiseKnowledge, pruneKnowledge, tickFishingKnowledge, KNOWLEDGE_THRESHOLDS, knowledgeLevel, knowledgeStage, compassDirection } from './core/knowledge.js?v=20260904-weather1';",
"import { buildFishingContactPairs, initialiseKnowledge, pruneKnowledge, tickFishingKnowledge, KNOWLEDGE_THRESHOLDS, knowledgeLevel, knowledgeStage, compassDirection } from './core/knowledge.js?v=20260906-scouting1';\nimport { startScoutingMission, tickScouting } from './core/scouting.js?v=20260906-scouting1';")
replace('js/main.js',
"  initialiseKnowledge(regions);",
"  initialiseKnowledge(regions, seaRegions);")
replace('js/main.js',
"    tickFishingKnowledge(fishingContactPairs, calendarWeek);\n    tickTrade(regions, calendarWeek, time);",
"    tickFishingKnowledge(fishingContactPairs, calendarWeek);\n    tickScouting(regions, calendarWeek, Math.random);\n    tickTrade(regions, calendarWeek, time);")
replace('js/main.js',
"    <label class=\"control-row\">Target navy size (boats)\n      <input type=\"number\" min=\"0\" step=\"1\" id=\"input-navy\" value=\"${Math.round(region.targetNavySize)}\" ${region.isCoastal ? '' : 'disabled title=\"not a coastal region\"'}>\n    </label>\n",
"""    <label class=\"control-row\">Target navy size (boats)
      <input type=\"number\" min=\"0\" step=\"1\" id=\"input-navy\" value=\"${Math.round(region.targetNavySize)}\" ${region.isCoastal ? '' : 'disabled title=\"not a coastal region\"'}>
    </label>
    <div class=\"raid-section\">
      <strong>Government scouting</strong>
      <div id=\"scouting-control-status\" class=\"raid-status\">${region.scouting?.active
        ? `${region.scouting.mode === 'sea' ? 'Naval' : 'Land'} expedition away · ${region.scouting.armyCommitted || 0} soldiers${region.scouting.navyCommitted ? ' · 1 fleet boat' : ''}`
        : region.scouting?.lastResult?.success
          ? `Last expedition made contact with ${region.scouting.lastResult.targetName}`
          : region.scouting?.lastResult ? 'Last expedition returned without making contact' : 'No expedition currently away'}</div>
      <label class=\"control-row\">Scout by
        <select id=\"scouting-mode\">
          <option value=\"auto\">best available route</option>
          <option value=\"land\">land patrol</option>
          ${region.isCoastal ? '<option value=\"sea\">naval expedition</option>' : ''}
        </select>
      </label>
      <button id=\"btn-scout-launch\" ${region.scouting?.active ? 'disabled' : ''}>Send scouting expedition</button>
    </div>
""")
replace('js/main.js',
"  document.getElementById('input-navy').addEventListener('change', (e) => {\n    region.targetNavySize = Math.max(0, Number(e.target.value) || 0);\n  });\n",
"""  document.getElementById('input-navy').addEventListener('change', (e) => {
    region.targetNavySize = Math.max(0, Number(e.target.value) || 0);
  });

  const scoutButton = document.getElementById('btn-scout-launch');
  scoutButton?.addEventListener('click', () => {
    const mode = document.getElementById('scouting-mode')?.value || 'auto';
    const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);
    const mission = startScoutingMission(region, regions, currentWeek, Math.random, mode);
    const status = document.getElementById('scouting-control-status');
    if (!mission) {
      if (status) status.textContent = 'No viable scouting route or insufficient army/fleet capacity.';
      return;
    }
    if (status) status.textContent = `${mission.mode === 'sea' ? 'Naval' : 'Land'} expedition dispatched · ${mission.armyCommitted} soldiers${mission.navyCommitted ? ' · 1 fleet boat' : ''}`;
    scoutButton.disabled = true;
  });
""")
replace('js/main.js',
"    <div>Government: ${governanceLabel(region)}${region.governance?.relationship !== 'core' ? ` &middot; administrative control ${(region.governance.administrativeControl * 100).toFixed(0)}% &middot; reports delayed ${region.governance.reportDelayWeeks} weeks` : ''}</div>\n    ${buildContactsSection(region, regions, playerRegionId, fogOfWar)}",
"    <div>Government: ${governanceLabel(region)}${region.governance?.relationship !== 'core' ? ` &middot; administrative control ${(region.governance.administrativeControl * 100).toFixed(0)}% &middot; reports delayed ${region.governance.reportDelayWeeks} weeks` : ''}</div>\n    ${observer.id === region.id && region.scouting?.active ? `<div>Scouting: ${region.scouting.mode} expedition away until about week ${Math.round(region.scouting.completeTick)}</div>` : ''}\n    ${buildContactsSection(region, regions, playerRegionId, fogOfWar)}")

print('scouting fixes patched')
