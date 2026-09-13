import assert from 'node:assert/strict';
import {
  ensureFiscalMilitaryPolity,
  ensureFiscalMilitaryRegion,
  fortificationResistanceMultiplier,
  fiscalMilitarySupplyMultiplier,
  tickFiscalMilitaryState,
} from '../js/politics/fiscalMilitaryState.js';

function infrastructure(...types) {
  return { assets: types.map((typeId, i) => ({ id: `${typeId}-${i}`, typeId, condition: 1, scale: 1 })) };
}

function region(id, polityId, overrides = {}) {
  return {
    id, name: id, polityId,
    governance: { sovereignPolityId: polityId, autonomy: 0.12 },
    population: 50000, wallet: 1000, treasury: 50, stability: 0.8,
    tradeEconomy: { weeklyExports: 80, weeklyImports: 60 },
    militaryFinance: { stateCapacity: 0.8, revenueEma: 2 },
    medievalSociety: { estates: { taxExemption: 0.08 } },
    unlockedTechIds: new Set(['gunpowder']),
    firearms: { readiness: 0.5 },
    earlyModernMilitary: { artillery: { readiness: 0.7, inventory: Array.from({ length: 8 }, () => ({ kind: 'field_cannon' })), away: [] } },
    construction: infrastructure('administrative_centre', 'market_customs', 'royal_arsenal', 'drill_ground', 'settlement_walls'),
    ...overrides,
  };
}

const warPolity = {
  id: 'p-war', capitalRegionId: 'war-capital',
  administration: { accounting: 0.8, recordKeeping: 0.8, officialdom: 0.75 },
  stateAdministration: { factions: { provincial: { satisfaction: 0.7 }, urban: { satisfaction: 0.7 } } },
  capitalFinance: { publicDebt: 100, annualInterestRate: 0.06, creditorConfidence: 0.6, claimsByRegion: {} },
};
const peacePolity = {
  id: 'p-peace', capitalRegionId: 'peace-capital',
  administration: { accounting: 0.15, recordKeeping: 0.18, officialdom: 0.12 },
  stateAdministration: { factions: { provincial: { satisfaction: 0.7 }, urban: { satisfaction: 0.7 } } },
  capitalFinance: { publicDebt: 0, annualInterestRate: 0.05, creditorConfidence: 0.6, claimsByRegion: {} },
};

const warRegion = region('war-capital', warPolity.id);
const peaceRegion = region('peace-capital', peacePolity.id, {
  wallet: 1000,
  tradeEconomy: { weeklyExports: 8, weeklyImports: 6 },
  militaryFinance: { stateCapacity: 0.25, revenueEma: 0.3 },
  unlockedTechIds: new Set(),
  firearms: { readiness: 0 },
  earlyModernMilitary: { artillery: { readiness: 0, inventory: [], away: [] } },
  construction: infrastructure('settlement_walls'),
});

const regions = [warRegion, peaceRegion];
const polities = [warPolity, peacePolity];
const wars = [{ id: 'war-1', attackerPolityId: warPolity.id, defenderPolityId: 'enemy' }];
const initialWarWallet = warRegion.wallet;
const initialWarTreasury = warRegion.treasury;

for (let year = 1; year <= 120; year++) {
  tickFiscalMilitaryState(regions, polities, wars, year * 52, 365.2425, { playerPolityId: warPolity.id });
}

const state = ensureFiscalMilitaryPolity(warPolity);
const local = ensureFiscalMilitaryRegion(warRegion);
const peaceful = ensureFiscalMilitaryPolity(peacePolity);

assert.ok(state.fiscalCadastre > 0.25, 'capable early-modern state should develop cadastral/fiscal administration');
assert.ok(state.customsAdministration > 0.25, 'customs administration should deepen from customs houses and accounting');
assert.ok(state.excisePractice > 0.2, 'war and debt should encourage excise practice');
assert.ok(state.extraordinaryWarLevy > 0.2, 'sustained war should produce extraordinary levies');
assert.ok(state.arsenalCoordination > 0.3, 'arsenals plus artillery should become coordinated');
assert.ok(state.magazineNetwork > 0.25, 'arsenals/drill/war should produce magazines');
assert.ok(state.standingForceInstitution > 0.2, 'standing-force institutions should emerge from finance/drill/magazines');
assert.ok(state.artilleryFortificationPressure > 0.4, 'artillery should create fortification pressure');
assert.ok(state.bastionPractice > 0.25, 'gunpowder artillery plus walls/admin should produce bastion practice');
assert.ok(local.bastionCoverage > 0.2, 'existing walls should be progressively adapted to artillery warfare');
assert.ok(local.magazineCapacity > 0.25, 'arsenal region should build persistent magazine capacity');
assert.ok(local.garrisonInstitution > 0.2, 'drill grounds and bastions should support standing garrisons');
assert.ok(local.taxResistance > 0, 'extraction should create local resistance rather than being free money');
assert.ok(warRegion.wallet < initialWarWallet, 'wartime fiscal extraction must transfer real private wealth');
assert.ok(warRegion.treasury > initialWarTreasury, 'wartime extraction should fund the public treasury');
assert.ok(warPolity.stateAdministration.factions.provincial.satisfaction < 0.7, 'war levies should create provincial political costs');
assert.ok(fortificationResistanceMultiplier(warRegion) > 1.2, 'bastioned/garrisoned region should resist artillery better than ordinary walls');
assert.ok(fiscalMilitarySupplyMultiplier(warRegion, polities) > 1, 'magazines and fiscal institutions should improve military supply');
assert.ok(state.debtBurden > 0, 'existing sovereign debt should feed fiscal-military pressure');
assert.ok(state.bastionPractice > peaceful.bastionPractice, 'weak peaceful non-gunpowder polity should not converge to the same fortification system');
assert.ok(state.extractionCapacity > peaceful.extractionCapacity, 'administrative capacity should matter for extraction');

console.log(JSON.stringify({
  fiscalCadastre: state.fiscalCadastre,
  customsAdministration: state.customsAdministration,
  excisePractice: state.excisePractice,
  warLevy: state.extraordinaryWarLevy,
  magazineNetwork: state.magazineNetwork,
  standingForceInstitution: state.standingForceInstitution,
  bastionPractice: state.bastionPractice,
  localBastionCoverage: local.bastionCoverage,
  localMagazineCapacity: local.magazineCapacity,
  taxResistance: local.taxResistance,
  fortificationMultiplier: fortificationResistanceMultiplier(warRegion),
  supplyMultiplier: fiscalMilitarySupplyMultiplier(warRegion, polities),
  wallet: warRegion.wallet,
  treasury: warRegion.treasury,
}, null, 2));
