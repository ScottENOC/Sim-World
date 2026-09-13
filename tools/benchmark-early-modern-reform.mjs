import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ensureRenaissanceState } from '../js/society/renaissanceNetworks.js';
import { tickEarlyModernReform } from '../js/society/earlyModernReform.js';
import { createReligiousWorld } from '../js/society/religion.js';

function makeRegion(i, count) {
  const id = `r${i}`;
  const region = {
    id, name: `Region ${i}`, population: 40000 + (i % 12) * 5000, treasury: 300 + (i % 9) * 60,
    wallet: 700 + (i % 16) * 90, educationLevel: 0.22 + (i % 7) * 0.07,
    neighbors: [`r${(i + 1) % count}`, `r${(i + count - 1) % count}`],
    tradePartnerIds: new Set([`r${(i + 11) % count}`, `r${(i + 37) % count}`]), recentTradePartners: new Map(),
    governance: { sovereignPolityId: `p${i % 140}`, administrativeControl: 0.35 + (i % 5) * 0.1 },
    religion: { shares: { parent: 1 }, stateReligionId: 'parent', tolerance: 0.35 + (i % 6) * 0.1, unrest: 0 },
    medievalCompletion: {
      city: { guildPower: 0.4, communeAutonomy: 0.25 },
      church: { wealth: 180 + (i % 11) * 45, bishopric: 0.35 + (i % 5) * 0.1, landShare: 0.22 },
      university: { founded: i % 10 === 0, students: i % 10 === 0 ? 700 : 0, institutionalMemory: 0.45 }, actors: [],
    },
    medievalSociety: { education: { knowledgeCapacity: 0.3 + (i % 6) * 0.08 }, urban: { industrialSpecialisation: 0.45 }, estates: { hereditaryPower: 0.5, eliteLandShare: 0.45 } },
  };
  const print = ensureRenaissanceState(region).printing;
  Object.assign(print, {
    mechanicalPress: i % 5 !== 0,
    publicationFlow: 0.2 + (i % 7) * 0.08,
    vernacularShare: 0.25 + (i % 6) * 0.1,
    censorship: (i % 5) * 0.09,
    informationVelocity: 0.2 + (i % 8) * 0.07,
    religiousChallengePressure: 0.15 + (i % 7) * 0.08,
  });
  return region;
}

const count = 2300;
const regions = Array.from({ length: count }, (_, i) => makeRegion(i, count));
const world = createReligiousWorld();
world.religions.push({ id: 'parent', name: 'Common Tradition', parentId: null, familyId: 'parent', holyCityRegionId: 'r0', foundedTick: 0, authority: 0.65, active: true, spreadMode: 'organised' });
world.nextReligionId = 2;
for (let year = 0; year < 4; year++) tickEarlyModernReform(regions, world, year * 52, 365.2425, () => 0.5);
const timings = [];
for (let year = 4; year < 14; year++) {
  const start = performance.now();
  tickEarlyModernReform(regions, world, year * 52, 365.2425, () => 0.5);
  timings.push(performance.now() - start);
}
const averageMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
const maxMs = Math.max(...timings);
assert.ok(averageMs < 150, `Early Modern reform annual tick averaged ${averageMs.toFixed(1)}ms, over 150ms budget`);
console.log(JSON.stringify({ regions: count, religions: world.religions.length, averageMs: Number(averageMs.toFixed(2)), maxMs: Number(maxMs.toFixed(2)) }, null, 2));
