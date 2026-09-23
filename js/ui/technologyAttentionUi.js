import { appendChronicleEntry, migrateLegacyTechnologyLog } from '../history/nationalChronicle.js';
import { openNationalChronicle, renderNationalChronicle } from './nationalChronicleUi.js';

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
  state.version = 2;
  if (!Array.isArray(state.domesticSeen)) state.domesticSeen = [];
  if (!Array.isArray(state.foreignSeen)) state.foreignSeen = [];
  if (!Array.isArray(state.log)) state.log = [];
  if (typeof state.initialised !== 'boolean') state.initialised = false;
  migrateLegacyTechnologyLog(world, playerPolityId, state);
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
    title: 'New craft reported across the border',
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

function buildContactMap(world, controlledRegions, playerPolityId, regionsById = null) {
  const byId = regionsById || new Map((world?.regions || []).map((region) => [region.id, region]));
  const contacts = new Map();
  const campaigns = world?.activeCampaigns || [];

  for (const region of controlledRegions) {
    for (const neighbourId of region.neighbors || []) {
      const neighbour = byId.get(neighbourId);
      if (neighbour && actorId(neighbour) !== playerPolityId) addContact(contacts, neighbour.id, 'neighbour', region.id);
    }
    if (region.recentTradePartners instanceof Map) {
      for (const partnerId of region.recentTradePartners.keys()) {
        const partner = byId.get(partnerId);
        if (partner && actorId(partner) !== playerPolityId) addContact(contacts, partner.id, 'trade', region.id);
      }
    }
    for (const partnerId of region.tradePartnerIds || []) {
      const partner = byId.get(partnerId);
      if (partner && actorId(partner) !== playerPolityId) addContact(contacts, partner.id, 'trade', region.id);
    }
    for (const observation of region.knowledge?.observations || []) {
      const subject = byId.get(observation?.subjectId);
      if (subject && actorId(subject) !== playerPolityId) addContact(contacts, subject.id, 'scouting', region.id);
    }
    for (const report of region.diplomaticIntelligence || []) {
      const host = byId.get(report?.hostRegionId);
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

function currentTick(world) {
  return Number(world?.clock?.tickIndex) || 0;
}

function recordTechnologyChronicle(world, playerPolityId, entry) {
  return appendChronicleEntry(world, playerPolityId, {
    ...entry,
    category: 'technology',
    elapsedDays: Number(world?.clock?.elapsedDays) || 0,
    tags: ['technology', entry.techId, entry.channel, entry.sourcePolityId].filter(Boolean),
  });
}

function emitNotice(entry, emit) {
  emit?.({
    title: entry.title,
    body: entry.body,
    actionLabel: 'Open chronicle',
    action: openNationalChronicle,
    ttlMs: 14000,
  });
}

function baselineState(state, world, controlledRegions, playerPolityId, regionsById) {
  const domestic = new Set();
  for (const region of controlledRegions) for (const techId of unlockedTechIds(region)) domestic.add(techId);
  state.domesticSeen = [...domestic];

  const contacts = buildContactMap(world, controlledRegions, playerPolityId, regionsById);
  const foreign = new Set();
  for (const foreignRegionId of contacts.keys()) {
    const foreignRegion = regionsById.get(foreignRegionId);
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

  const regionsById = new Map(world.regions.map((region) => [region.id, region]));
  const controlledRegions = world.regions.filter((region) => actorId(region) === playerPolityId);
  if (!controlledRegions.length) return [];
  if (!state.initialised) {
    baselineState(state, world, controlledRegions, playerPolityId, regionsById);
    renderNationalChronicle(world);
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
      recordTechnologyChronicle(world, playerPolityId, entry);
      emitNotice(entry, emit);
      emitted.push(entry);
    }
  }
  state.domesticSeen = [...domesticSeen];

  const foreignSeen = new Set(state.foreignSeen);
  const contacts = buildContactMap(world, controlledRegions, playerPolityId, regionsById);
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
      recordTechnologyChronicle(world, playerPolityId, entry);
      emitNotice(entry, emit);
      emitted.push(entry);
    }
  }
  state.foreignSeen = [...foreignSeen];
  renderNationalChronicle(world);
  return emitted;
}

function installTechnologyAttention() {
  let lastTick = null;
  const run = () => {
    const world = globalThis.__worldsim;
    if (!world?.clock || !world?.regions || !world?.polities) return;
    const tick = currentTick(world);
    if (tick === lastTick) {
      renderNationalChronicle(world);
      return;
    }
    lastTick = tick;
    scanTechnologyAttention(world, { emit: (notice) => globalThis.__playerAttention?.push?.(notice) });
  };
  setInterval(run, POLL_INTERVAL_MS);
  run();
  globalThis.__technologyAttention = {
    scan: () => scanTechnologyAttention(globalThis.__worldsim, { emit: (notice) => globalThis.__playerAttention?.push?.(notice) }),
    openDiscoveries: openNationalChronicle,
    openChronicle: openNationalChronicle,
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installTechnologyAttention, { once: true });
  else installTechnologyAttention();
}
