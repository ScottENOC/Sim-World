const MAX_TECH_LOG_ENTRIES = 120;
const POLL_INTERVAL_MS = 350;

const TECH_LABELS = Object.freeze({
  iron_smelting: 'Iron smelting',
  advanced_boatbuilding: 'Advanced boatbuilding',
  hill_forts: 'Hill forts',
  torsion_catapults: 'Torsion catapults',
  water_management: 'Water management',
  shaft_mining: 'Shaft mining',
  mine_drainage: 'Mine drainage',
  steelmaking: 'Steelmaking',
  gunpowder: 'Gunpowder',
  rifling: 'Rifling',
});

const CHANNEL_PRIORITY = Object.freeze({ neighbour: 1, scouting: 2, diplomatic: 3, trade: 4, war: 5 });

function prettifyTechId(techId) {
  return String(techId || 'technology')
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function technologyLabel(techId) {
  return TECH_LABELS[techId] || prettifyTechId(techId);
}

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.governance?.localPolityId || region?.controllingActorId || region?.polityId || region?.id || null;
}

function unlockedTechIds(region) {
  if (region?.unlockedTechIds instanceof Set) return region.unlockedTechIds;
  if (Array.isArray(region?.unlockedTechIds)) return new Set(region.unlockedTechIds);
  return new Set();
}

function polityFor(world, polityId) {
  return (world?.polities || []).find((polity) => polity?.id === polityId) || null;
}

function polityName(world, polityId, fallbackRegion = null) {
  return polityFor(world, polityId)?.name || fallbackRegion?.polityName || fallbackRegion?.country || fallbackRegion?.name || String(polityId || 'a foreign realm');
}

function ensureState(world, playerPolityId) {
  const polity = polityFor(world, playerPolityId);
  if (!polity) return null;
  polity.technologyAttention ||= {};
  const state = polity.technologyAttention;
  state.version = 1;
  if (!Array.isArray(state.domesticSeen)) state.domesticSeen = [];
  if (!Array.isArray(state.foreignSeen)) state.foreignSeen = [];
  if (!Array.isArray(state.log)) state.log = [];
  if (typeof state.initialised !== 'boolean') state.initialised = false;
  return state;
}

function domesticReport(techId, regionName) {
  const label = technologyLabel(techId);
  if (techId === 'iron_smelting') return {
    title: 'Ironworking breakthrough',
    body: `Smiths in ${regionName} have learned to smelt useful iron reliably. Bronze is no longer the only path to strong metal tools and weapons.`,
  };
  if (techId === 'steelmaking') return {
    title: 'Steelmaking breakthrough',
    body: `Smiths in ${regionName} have learned to make steel reliably. Harder, more consistent metal can now be worked into tools, weapons and machinery.`,
  };
  if (techId === 'advanced_boatbuilding') return {
    title: 'Shipwrights make a breakthrough',
    body: `Shipwrights in ${regionName} have developed stronger hulls and more capable seagoing vessels.`,
  };
  if (techId === 'gunpowder') return {
    title: 'A powerful explosive mixture',
    body: `Experimenters in ${regionName} have discovered gunpowder. Its destructive potential is immediately apparent to soldiers and miners alike.`,
  };
  if (techId === 'rifling') return {
    title: 'Rifled barrels understood',
    body: `Gunmakers in ${regionName} have learned to cut spiral grooves inside barrels, greatly improving projectile stability and accuracy.`,
  };
  if (techId.includes('electric') || techId.includes('power')) return {
    title: `${label} breakthrough`,
    body: `Engineers in ${regionName} report a significant advance in ${label.toLowerCase()}.`,
  };
  if (techId.includes('medical') || techId.includes('germ') || techId.includes('vaccine')) return {
    title: `${label} breakthrough`,
    body: `Healers and scholars in ${regionName} report a significant advance in ${label.toLowerCase()}.`,
  };
  return {
    title: `${label} breakthrough`,
    body: `Craftspeople and scholars in ${regionName} have made a significant advance in ${label.toLowerCase()}.`,
  };
}

export function foreignTechnologyReport({ techId, sourceName, channel = 'scouting' }) {
  const label = technologyLabel(techId);
  if (channel === 'trade' && techId === 'steelmaking') return {
    title: 'Foreign steel observed',
    body: `Traders from ${sourceName} have brought steel farming tools with them. Our blacksmiths are envious of the quality.`,
  };
  if (channel === 'trade' && techId === 'iron_smelting') return {
    title: 'Foreign ironwork observed',
    body: `Traders from ${sourceName} are carrying iron tools unlike our usual metalwork. Smiths at home are studying the pieces closely.`,
  };
  if (channel === 'trade') return {
    title: `Foreign ${label.toLowerCase()} observed`,
    body: `Traders from ${sourceName} bring reports and examples of advances in ${label.toLowerCase()}. Our own specialists are studying what they can learn from them.`,
  };
  if (channel === 'war') return {
    title: `${label} encountered in war`,
    body: `Our forces have encountered ${label.toLowerCase()} in use by ${sourceName}. Officers have sent examples and reports home for study.`,
  };
  if (channel === 'diplomatic') return {
    title: `Envoys report ${label.toLowerCase()}`,
    body: `Our envoys report that ${sourceName} has made a significant advance in ${label.toLowerCase()}.`,
  };
  if (channel === 'neighbour') return {
    title: `New craft reported across the border`,
    body: `Travellers from ${sourceName} describe advances in ${label.toLowerCase()} that our specialists have not seen there before.`,
  };
  return {
    title: `Foreign ${label.toLowerCase()} reported`,
    body: `Travellers and scouts returning from ${sourceName} report a significant advance in ${label.toLowerCase()}.`,
  };
}

function addContact(contactMap, foreignRegionId, channel, observerRegionId) {
  if (!foreignRegionId) return;
  const priority = CHANNEL_PRIORITY[channel] || 0;
  const existing = contactMap.get(foreignRegionId);
  if (!existing || priority > existing.priority) contactMap.set(foreignRegionId, { channel, priority, observerRegionId });
}

function buildContactMap(world, controlledRegions, playerPolityId) {
  const regionsById = new Map((world?.regions || []).map((region) => [region.id, region]));
  const contacts = new Map();
  const campaigns = world?.activeCampaigns || [];

  for (const region of controlledRegions) {
    for (const neighbourId of region.neighbors || []) {
      const neighbour = regionsById.get(neighbourId);
      if (neighbour && actorId(neighbour) !== playerPolityId) addContact(contacts, neighbour.id, 'neighbour', region.id);
    }
    if (region.recentTradePartners instanceof Map) {
      for (const partnerId of region.recentTradePartners.keys()) {
        const partner = regionsById.get(partnerId);
        if (partner && actorId(partner) !== playerPolityId) addContact(contacts, partner.id, 'trade', region.id);
      }
    }
    for (const partnerId of region.tradePartnerIds || []) {
      const partner = regionsById.get(partnerId);
      if (partner && actorId(partner) !== playerPolityId) addContact(contacts, partner.id, 'trade', region.id);
    }
    for (const observation of region.knowledge?.observations || []) {
      const subject = regionsById.get(observation?.subjectId);
      if (subject && actorId(subject) !== playerPolityId) addContact(contacts, subject.id, 'scouting', region.id);
    }
    for (const report of region.diplomaticIntelligence || []) {
      const host = regionsById.get(report?.hostRegionId);
      if (host && actorId(host) !== playerPolityId) addContact(contacts, host.id, 'diplomatic', region.id);
    }
  }

  const controlledIds = new Set(controlledRegions.map((region) => region.id));
  for (const campaign of campaigns) {
    const attackerId = campaign?.attackerId;
    const defenderId = campaign?.defenderId;
    if (controlledIds.has(attackerId) && defenderId) addContact(contacts, defenderId, 'war', attackerId);
    if (controlledIds.has(defenderId) && attackerId) addContact(contacts, attackerId, 'war', defenderId);
  }
  return contacts;
}

function appendLog(state, entry) {
  state.log.push(entry);
  if (state.log.length > MAX_TECH_LOG_ENTRIES) state.log.splice(0, state.log.length - MAX_TECH_LOG_ENTRIES);
}

function emitNotice(entry, emit) {
  emit?.({
    title: entry.title,
    body: entry.body,
    actionLabel: 'Open discoveries',
    action: openDiscoveries,
    ttlMs: 14000,
  });
}

function currentTick(world) {
  return Number(world?.clock?.tickIndex) || 0;
}

function baselineState(state, world, controlledRegions, playerPolityId) {
  const domestic = new Set();
  for (const region of controlledRegions) for (const techId of unlockedTechIds(region)) domestic.add(techId);
  state.domesticSeen = [...domestic];

  const contacts = buildContactMap(world, controlledRegions, playerPolityId);
  const foreign = new Set();
  for (const foreignRegionId of contacts.keys()) {
    const foreignRegion = (world.regions || []).find((region) => region.id === foreignRegionId);
    const foreignPolityId = actorId(foreignRegion);
    if (!foreignRegion || !foreignPolityId || foreignPolityId === playerPolityId) continue;
    for (const techId of unlockedTechIds(foreignRegion)) foreign.add(`${foreignPolityId}:${techId}`);
  }
  state.foreignSeen = [...foreign];
  state.initialised = true;
}

export function scanTechnologyAttention(world, { emit = null } = {}) {
  const playerPolityId = world?.activePlayerPolityId;
  if (!playerPolityId || !Array.isArray(world?.regions)) return [];
  const state = ensureState(world, playerPolityId);
  if (!state) return [];

  const controlledRegions = world.regions.filter((region) => actorId(region) === playerPolityId);
  if (!controlledRegions.length) return [];
  if (!state.initialised) {
    baselineState(state, world, controlledRegions, playerPolityId);
    return [];
  }

  const tick = currentTick(world);
  const emitted = [];
  const domesticSeen = new Set(state.domesticSeen);
  for (const region of controlledRegions) {
    for (const techId of unlockedTechIds(region)) {
      if (domesticSeen.has(techId)) continue;
      domesticSeen.add(techId);
      const report = domesticReport(techId, region.name || 'the realm');
      const entry = { tick, kind: 'domestic', techId, label: technologyLabel(techId), sourceRegionId: region.id, title: report.title, body: report.body };
      appendLog(state, entry);
      emitNotice(entry, emit);
      emitted.push(entry);
    }
  }
  state.domesticSeen = [...domesticSeen];

  const foreignSeen = new Set(state.foreignSeen);
  const regionsById = new Map(world.regions.map((region) => [region.id, region]));
  const contacts = buildContactMap(world, controlledRegions, playerPolityId);
  for (const [foreignRegionId, contact] of contacts) {
    const foreignRegion = regionsById.get(foreignRegionId);
    const foreignPolityId = actorId(foreignRegion);
    if (!foreignRegion || !foreignPolityId || foreignPolityId === playerPolityId) continue;
    const sourceName = polityName(world, foreignPolityId, foreignRegion);
    for (const techId of unlockedTechIds(foreignRegion)) {
      const key = `${foreignPolityId}:${techId}`;
      if (foreignSeen.has(key)) continue;
      foreignSeen.add(key);
      const report = foreignTechnologyReport({ techId, sourceName, channel: contact.channel });
      const entry = {
        tick, kind: 'foreign', techId, label: technologyLabel(techId), sourceRegionId: foreignRegion.id,
        sourcePolityId: foreignPolityId, channel: contact.channel, title: report.title, body: report.body,
      };
      appendLog(state, entry);
      emitNotice(entry, emit);
      emitted.push(entry);
    }
  }
  state.foreignSeen = [...foreignSeen];
  renderTechnologyLog(world);
  return emitted;
}

function technologyState(world) {
  const playerPolityId = world?.activePlayerPolityId;
  return playerPolityId ? ensureState(world, playerPolityId) : null;
}

function renderTechnologyLog(world = globalThis.__worldsim) {
  if (typeof document === 'undefined') return;
  const content = document.getElementById('advisor-content');
  const activeSpymaster = document.querySelector('[data-advisor="spymaster"].active');
  if (!content || !activeSpymaster) return;
  content.querySelector('[data-technology-discoveries]')?.remove();

  const state = technologyState(world);
  const section = document.createElement('section');
  section.className = 'advisor-section';
  section.dataset.technologyDiscoveries = '1';
  const heading = document.createElement('h3');
  heading.textContent = 'Technological reports';
  section.appendChild(heading);

  const entries = [...(state?.log || [])].reverse().slice(0, 12);
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'advisor-note';
    empty.textContent = 'No new domestic breakthroughs or foreign technologies have been reported yet.';
    section.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'intelligence-list';
    const now = currentTick(world);
    for (const entry of entries) {
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = entry.title || entry.label || 'Technological report';
      const detail = document.createElement('span');
      const age = Number.isFinite(entry.tick) ? `${Math.max(0, now - entry.tick)}w old` : 'undated';
      detail.textContent = `${entry.body || ''} · ${age}`;
      row.append(strong, detail);
      list.appendChild(row);
    }
    section.appendChild(list);
  }
  content.appendChild(section);
}

function openDiscoveries() {
  if (typeof document === 'undefined') return;
  document.getElementById('btn-council')?.click();
  queueMicrotask(() => {
    document.querySelector('[data-advisor="spymaster"]')?.click();
    queueMicrotask(() => renderTechnologyLog());
  });
}

function installTechnologyAttention() {
  let lastTick = null;
  const run = () => {
    const world = globalThis.__worldsim;
    if (!world?.clock || !world?.regions || !world?.polities) return;
    const tick = currentTick(world);
    if (tick === lastTick) {
      renderTechnologyLog(world);
      return;
    }
    lastTick = tick;
    scanTechnologyAttention(world, { emit: (notice) => globalThis.__playerAttention?.push?.(notice) });
  };
  setInterval(run, POLL_INTERVAL_MS);
  run();

  const content = document.getElementById('advisor-content');
  if (content) new MutationObserver(() => queueMicrotask(() => renderTechnologyLog())).observe(content, { childList: true });
  globalThis.__technologyAttention = { scan: () => scanTechnologyAttention(globalThis.__worldsim, { emit: (notice) => globalThis.__playerAttention?.push?.(notice) }), openDiscoveries };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installTechnologyAttention, { once: true });
  else installTechnologyAttention();
}
