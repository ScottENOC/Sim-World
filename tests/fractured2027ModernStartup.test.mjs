import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FogOfWar } from '../js/core/fogOfWar.js';
import { applyScenarioRuntimeRules } from '../js/core/scenarioRuntime.js';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';
import { availableConstructionTypes, ensureConstruction } from '../js/economy/construction.js';

{
  const regions = [{ id: 'madagascar' }, { id: 'greenland' }, { id: 'taiwan' }];
  const fog = new FogOfWar(regions);
  fog.setPlayerRegion('madagascar');
  assert.equal(fog.isVisible(regions[1]), false, 'ordinary fog should not reveal a remote region without knowledge');
  fog.setPhysicalWorldKnown(true);
  assert.equal(fog.isVisible(regions[1]), true, 'modern physical-world knowledge should reveal remote geography');
  assert.equal(fog.isVisible(regions[2]), true, 'modern physical-world knowledge should reveal the whole physical map');
  assert.equal(fog.devMode, false, 'physical-world knowledge must not enable omniscient dev mode');
}

{
  const calls = [];
  const clock = {
    worldTempo: null,
    setWorldTempo(tempo) {
      this.worldTempo = { ...tempo };
      calls.push(this.worldTempo);
      return this.worldTempo;
    },
  };
  const fogOfWar = { known: false, setPhysicalWorldKnown(value) { this.known = value; } };
  const sim = { clock, fogOfWar };
  const scenario = { id: 'fractured-2027', rulesProfile: 'modern-crisis' };
  const pkg = { manifest: { pacing: { preferredStrategicTurnUnit: 'day' } } };
  const result = applyScenarioRuntimeRules(sim, scenario, pkg);
  assert.equal(result.dailyTurns, true);
  assert.equal(clock.worldTempo.daysPerTick, 1, '2027 should begin with one simulated day per turn');
  assert.equal(clock.worldTempo.label, 'daily');
  assert.equal(fogOfWar.known, true);

  clock.setWorldTempo({ daysPerTick: 30, label: 'monthly', index: .8 });
  assert.equal(clock.worldTempo.daysPerTick, 1, 'adaptive world-tempo reassessment must not reset 2027 to monthly turns');
  assert.equal(clock.worldTempo.label, 'daily');
}

{
  const clock = { setWorldTempo(tempo) { this.worldTempo = tempo; return tempo; } };
  const fogOfWar = { known: false, setPhysicalWorldKnown(value) { this.known = value; } };
  const result = applyScenarioRuntimeRules({ clock, fogOfWar }, { id: 'grand-campaign', rulesProfile: 'grand-campaign' }, null);
  assert.equal(result.dailyTurns, false, 'grand campaign cadence must remain adaptive');
  assert.equal(fogOfWar.known, false, 'grand campaign must retain historical fog of war');
}

{
  const profile = JSON.parse(readFileSync(new URL('../data/scenarios/fractured-2027/modern-start.json', import.meta.url), 'utf8'));
  const region = {
    id: 'modern-coast',
    name: 'Modern Coast',
    scenarioCountryId: 'australia',
    governance: { sovereignPolityName: 'Australia' },
    population: 100000,
    isCoastal: true,
    unlockedTechIds: new Set(),
    electricity: {},
    structuralTransformation: { capability: {} },
    industrialSupply: { capability: {}, inventory: {} },
    industrialPlants: { componentCapability: {} },
    stockpile: {},
    army: { personnel: 0, away: 0 },
  };
  const world = { regions: [region], scenarioState: { id: 'fractured-2027' } };
  applyModernScenarioBaseline(world, profile);

  for (const techId of [
    'advanced_boatbuilding', 'ocean_sailing', 'naval_warfare', 'marine_steam_engine',
    'screw_propulsion', 'iron_hull_shipbuilding', 'steel_hull_shipbuilding',
    'self_propelled_torpedo', 'practical_submarine', 'dreadnought_design',
  ]) {
    assert.equal(region.unlockedTechIds.has(techId), true, `2027 coastal states should inherit mature maritime technology: ${techId}`);
  }

  let available = new Set(availableConstructionTypes(region).map((type) => type.id));
  assert.equal(available.has('harbour'), true, 'a coastal 2027 region should be able to commission a harbour on turn one');
  assert.equal(available.has('shipyard'), false, 'a shipyard should still require physical harbour infrastructure');

  ensureConstruction(region).assets.push({ id: 'scenario-harbour', typeId: 'harbour', condition: 1, scale: 1 });
  available = new Set(availableConstructionTypes(region).map((type) => type.id));
  assert.equal(available.has('shipyard'), true, 'once a harbour exists, a 2027 coastal region should qualify for an advanced shipyard');
  assert.equal(available.has('naval_base'), true, 'once a harbour exists, a 2027 coastal region should qualify for a naval base');
}

{
  const bootstrapSource = readFileSync(new URL('../js/ui/scenarioRuntimeAuto.js', import.meta.url), 'utf8');
  assert.match(
    bootstrapSource,
    /await waitForScenarioSelection\(\)/,
    'scenario runtime bootstrap must begin its timeout after scenario selection rather than page load',
  );
  assert.match(
    bootstrapSource,
    /if \(await tryStart\(\)\) return;/,
    'scenario runtime bootstrap must await its first runtime availability check',
  );
  assert.doesNotMatch(
    bootstrapSource,
    /if \(!tryStart\(\)\)/,
    'an async tryStart Promise is truthy and must never be used as the retry condition directly',
  );
}

console.log('Fractured 2027 modern-startup regressions passed.');
