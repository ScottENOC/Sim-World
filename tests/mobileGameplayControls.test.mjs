import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureConstruction } from '../js/economy/construction.js';
import { constructionAvailability, setNavalClassTarget } from '../js/ui/mobileGameplayControls.js';

function coastalRegion() {
  return {
    id: 'test-coast',
    name: 'Test Coast',
    isCoastal: true,
    population: 100000,
    unlockedTechIds: new Set([
      'advanced_boatbuilding', 'ocean_sailing', 'naval_warfare', 'gunpowder',
      'marine_steam_engine', 'screw_propulsion', 'iron_hull_shipbuilding',
      'steel_hull_shipbuilding', 'self_propelled_torpedo', 'practical_submarine',
      'dreadnought_design',
    ]),
    construction: { projects: [], completed: {}, assets: [], workersReserved: 0, lastWeek: null },
    navalProcurement: { targets: {}, built: {}, lastDecisionTick: null },
    navy: { boats: 0, advancedBoats: 0, personnel: 0, scoutingBoats: 0 },
    deposits: {},
    hydrology: { riverIds: [] },
  };
}

{
  const region = coastalRegion();
  let byId = new Map(constructionAvailability(region).map((entry) => [entry.type.id, entry]));
  assert.equal(byId.get('harbour')?.reason, null, 'harbour must be a discoverable turn-one coastal build option');
  assert.match(byId.get('shipyard')?.reason || '', /harbour/i, 'shipyard should explain its harbour prerequisite');
  assert.match(byId.get('naval_base')?.reason || '', /harbour/i, 'naval base should explain its harbour prerequisite');

  ensureConstruction(region).assets.push({ id: 'harbour-1', typeId: 'harbour', condition: 1, scale: 1 });
  byId = new Map(constructionAvailability(region).map((entry) => [entry.type.id, entry]));
  assert.equal(byId.get('shipyard')?.reason, null, 'shipyard must become available once its real prerequisites are met');
  assert.equal(byId.get('naval_base')?.reason, null, 'naval base must become available once its real prerequisites are met');
}

{
  const region = coastalRegion();
  const result = setNavalClassTarget(region, 'destroyer', 1);
  assert.equal(result.target, 1);
  assert.equal(region.navalProcurement.targets.destroyer, 1, 'class procurement target must be authoritative');
  assert.equal('targetNavySize' in region, false, 'class procurement must not recreate the obsolete scalar navy target');

  region.navalProcurement.built.destroyer = 0.6;
  const increased = setNavalClassTarget(region, 'destroyer', 2);
  assert.equal(increased.target, 2, 'additional class orders should increase the class target');
  assert.equal(increased.built, 0.6, 'fractional shipbuilding progress should remain visible to procurement UI');
}

{
  const files = [
    '../js/main.js',
    '../js/world/region.js',
    '../js/ai/nationAi.js',
    '../js/economy/construction.js',
    '../js/economy/laborCore.js',
    '../js/military/fleets.js',
    '../js/ui/advisors.js',
    '../js/ui/institutionalCouncilSpendingUi.js',
    '../js/ui/institutionalRegionControlsUi.js',
    '../js/ui/mobileGameplayControls.js',
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /targetNavySize|input-navy|council-navy-target/, `${relative} must not retain the obsolete scalar navy model`);
  }
}

{
  const authoritySource = readFileSync(new URL('../js/ui/mobileGameplayControls.js', import.meta.url), 'utf8');
  assert.match(authoritySource, /authoriseRuntimeGovernmentAction/, 'mobile spending controls must use runtime institutional authority');
  assert.match(authoritySource, /'change_spending'/, 'mobile construction and naval procurement must use spending authority');
  assert.match(authoritySource, /spendingKind: 'infrastructure'/, 'infrastructure commissioning must be institutionally gated');
  assert.match(authoritySource, /spendingKind: 'naval_procurement'/, 'naval procurement must be institutionally gated');
}

{
  const source = readFileSync(new URL('../js/military/fleets.js', import.meta.url), 'utf8');
  assert.match(source, /completedByClass/, 'persistent fleets must reconcile against completed class-specific hulls');
  assert.match(source, /Math\.floor\(Number\(value\)/, 'fractional shipbuilding progress must not spawn a persistent ship');
  assert.match(source, /allowEmpty:\s*true/, 'the first completed hull must be able to create an empty fleet shell before the ship is inserted');
}

{
  const focusSource = readFileSync(new URL('../js/ui/mapFirstUi.js', import.meta.url), 'utf8');
  assert.doesNotMatch(focusSource, /Selected · zoom to inspect/, 'static selection instructions should not consume mobile map height');
  assert.match(focusSource, /bottom:calc\(8px \+ env\(safe-area-inset-bottom\)\)/, 'layer controls should be anchored to the bottom safe area');

  const legendSource = readFileSync(new URL('../js/ui/mapOverlayStability.js', import.meta.url), 'utf8');
  assert.match(legendSource, /legend-mode-categorical/, 'categorical legend mode should be explicit');
  assert.match(legendSource, /legend-mode-gradient/, 'gradient legend mode should be explicit');
  assert.match(legendSource, /categorical\.innerHTML = ''/, 'switching back to a gradient must clear stale categorical entries');
}

console.log('Mobile gameplay control regressions passed.');
