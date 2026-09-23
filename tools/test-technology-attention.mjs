import assert from 'node:assert/strict';
import { foreignTechnologyReport, scanTechnologyAttention, technologyLabel } from '../js/ui/technologyAttentionUi.js';

function region(id, polityId, techs = []) {
  return {
    id,
    name: id,
    governance: { sovereignPolityId: polityId },
    unlockedTechIds: new Set(techs),
    neighbors: [],
    tradePartnerIds: [],
    recentTradePartners: new Map(),
    knowledge: { observations: [] },
    diplomaticIntelligence: [],
  };
}

const kent = region('Kent', 'player', ['bronze_tools']);
const sussex = region('Sussex', 'player', ['bronze_tools']);
const essex = region('Essex', 'essex-polity', ['bronze_tools']);
const remote = region('Remote', 'remote-polity', ['steelmaking']);
kent.recentTradePartners.set('Essex', 1);

const world = {
  activePlayerPolityId: 'player',
  clock: { tickIndex: 10 },
  polities: [
    { id: 'player', name: 'Kentish Realm' },
    { id: 'essex-polity', name: 'Essex' },
    { id: 'remote-polity', name: 'Remote Realm' },
  ],
  regions: [kent, sussex, essex, remote],
  activeCampaigns: [],
};

{
  const messages = [];
  assert.deepEqual(scanTechnologyAttention(world, { emit: (notice) => messages.push(notice) }), []);
  assert.equal(messages.length, 0, 'initial scan should baseline existing technologies without retroactive spam');
}

{
  world.clock.tickIndex = 11;
  sussex.unlockedTechIds.add('iron_smelting');
  const messages = [];
  const events = scanTechnologyAttention(world, { emit: (notice) => messages.push(notice) });
  assert.equal(events.length, 1, 'first polity-wide domestic acquisition should be reported once');
  assert.equal(events[0].kind, 'domestic');
  assert.equal(events[0].techId, 'iron_smelting');
  assert.match(events[0].body, /Smiths in Sussex/i);
  assert.equal(messages.length, 1);
}

{
  world.clock.tickIndex = 12;
  kent.unlockedTechIds.add('iron_smelting');
  const events = scanTechnologyAttention(world);
  assert.equal(events.length, 0, 'routine adoption by another controlled region should stay silent after the polity knows the technology');
}

{
  world.clock.tickIndex = 13;
  essex.unlockedTechIds.add('steelmaking');
  const messages = [];
  const events = scanTechnologyAttention(world, { emit: (notice) => messages.push(notice) });
  assert.equal(events.length, 1, 'new technology in a contacted foreign polity should be reported');
  assert.equal(events[0].kind, 'foreign');
  assert.equal(events[0].channel, 'trade');
  assert.equal(events[0].sourcePolityId, 'essex-polity');
  assert.match(events[0].body, /Traders from Essex have brought steel farming tools/i);
  assert.match(events[0].body, /blacksmiths are envious/i);
  assert.equal(messages[0].actionLabel, 'Open discoveries');
}

{
  world.clock.tickIndex = 14;
  const events = scanTechnologyAttention(world);
  assert.equal(events.length, 0, 'a foreign technology observation should only be announced once per foreign polity');
}

{
  world.clock.tickIndex = 15;
  remote.unlockedTechIds.add('rifling');
  const events = scanTechnologyAttention(world);
  assert.equal(events.length, 0, 'breakthroughs in unknown/uncontacted countries should remain unknown');
}

{
  world.clock.tickIndex = 16;
  kent.tradePartnerIds.push('Remote');
  const events = scanTechnologyAttention(world);
  assert.ok(events.some((entry) => entry.sourcePolityId === 'remote-polity' && entry.techId === 'rifling'),
    'first real contact should reveal foreign technologies not previously observed');
}

{
  const report = foreignTechnologyReport({ techId: 'rifling', sourceName: 'Essex', channel: 'war' });
  assert.match(report.body, /forces have encountered rifling/i);
  assert.equal(technologyLabel('advanced_boatbuilding'), 'Advanced boatbuilding');
}

{
  const log = world.polities[0].technologyAttention.log;
  assert.ok(log.some((entry) => entry.kind === 'domestic' && entry.techId === 'iron_smelting'));
  assert.ok(log.some((entry) => entry.kind === 'foreign' && entry.sourcePolityId === 'essex-polity' && entry.techId === 'steelmaking'));
}

console.log('Technology attention regressions passed.');
