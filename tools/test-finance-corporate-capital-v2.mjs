import assert from 'node:assert/strict';
import {
  corporateCreditMultiplier,
  corporateVentureCapacityMultiplier,
  ensureCorporateCapitalState,
  ensurePolityCapitalFinance,
  tickCorporateCapital,
} from '../js/economy/corporateCapital.js';

function region(id, polityId = 'p1', capital = false) {
  return {
    id,
    population: capital ? 70000 : 42000,
    wallet: capital ? 120 : 95,
    treasury: capital ? 0.02 : 0.01,
    stability: 0.72,
    isCoastal: true,
    governance: { sovereignPolityId: polityId },
    tradeEconomy: {
      debt: 0.1,
      creditLimit: 2,
      exportIncomeEma: 8,
      importSpendEma: 7,
      routeReliabilityEma: 0.82,
      merchantConfidence: 0.65,
    },
    medievalCommerce: {
      finance: { merchantCredit: 0.82, depositBanking: 0.76, billsOfExchange: 0.72, stateCredit: 0.7, riskSharing: 0.74, creditCrisis: 0.04 },
      trade: { commercialLaw: 0.78, protectedMarkets: 0.76 },
    },
    medievalSociety: { urban: { guilds: 0.72, council: 0.68 } },
    militaryFinance: { arrearsWeeks: capital ? 8 : 5, stateCapacity: 0.65, revenueEma: capital ? 0.8 : 0.45 },
    resourceDeposits: { copper: {}, iron: {} },
  };
}

const polity = {
  id: 'p1',
  capitalRegionId: 'capital',
  administration: { accounting: 0.76, recordKeeping: 0.73, officialdom: 0.7 },
  stateAdministration: { factions: { urban: { satisfaction: 0.5 } } },
};
const regions = [region('capital', 'p1', true), region('port'), region('hinterland')];

for (let year = 0; year < 24; year += 1) {
  tickCorporateCapital(regions, [polity], year * 52, 365.2425, () => 0, {});
}

const capitalState = ensureCorporateCapitalState(regions[0]);
const polityFinance = ensurePolityCapitalFinance(polity);
assert.ok(capitalState.financialDepth > 0.45, 'mature commercial institutions should create financial depth');
assert.ok(capitalState.partnershipPractice > 0.35, 'persistent partnership practice should emerge');
assert.ok(capitalState.firms.length > 0, 'deep commercial regions should form persistent firms');
assert.ok(capitalState.firms.some((firm) => firm.form === 'chartered_venture' || firm.form === 'joint_stock_company'), 'advanced financing should eventually support chartered or joint-stock firms');
assert.ok(corporateCreditMultiplier(regions[0]) > 1, 'financial depth should raise sustainable credit capacity');
assert.ok(corporateVentureCapacityMultiplier(regions[0]) > 1, 'persistent firms should expand merchant venture capacity');
assert.ok(polityFinance.publicDebt > 0, 'a fiscally stressed state with creditor depth should borrow rather than conjure money');
assert.ok(Object.keys(polityFinance.claimsByRegion).length > 0, 'public debt should be owned by creditor regions');
assert.ok(regions.some((r) => r.wallet < (r.id === 'capital' ? 120 : 95)), 'state borrowing should transfer private wealth into the treasury');
assert.ok(regions[0].treasury > 0, 'borrowed funds should reach the state treasury');

const debtBefore = polityFinance.publicDebt;
const creditorWalletBefore = regions.reduce((sum, r) => sum + r.wallet, 0);
regions[0].treasury += 5;
polityFinance.debtServiceArrears = 0;
tickCorporateCapital(regions, [polity], 1300, 365.2425, () => 0.99, {});
const creditorWalletAfter = regions.reduce((sum, r) => sum + r.wallet, 0);
assert.ok(creditorWalletAfter > creditorWalletBefore, 'debt service should transfer treasury money back to creditors');
assert.ok(polityFinance.publicDebt <= debtBefore + 0.001, 'servicing debt should not itself create additional principal');

const crisisRegion = region('crisis');
crisisRegion.medievalCommerce.finance.creditCrisis = 1;
crisisRegion.tradeEconomy.debt = 12;
crisisRegion.tradeEconomy.creditLimit = 1;
const crisisState = ensureCorporateCapitalState(crisisRegion);
crisisState.financialDepth = 0.7;
crisisState.creditorTrust = 0.8;
crisisState.partnershipPractice = 0.7;
crisisState.firms.push({ id: 'crisis:firm:1', form: 'partnership', sector: 'trade', status: 'active', capitalIndex: 1, debtIndex: 2, equityIndex: 0.3, profitability: -0.5, solvency: 0.05, ageYears: 5 });
const crisisEvents = tickCorporateCapital([crisisRegion], [], 1500, 365.2425, () => 0, {});
assert.ok(crisisEvents.some((event) => event.type === 'commercial_firm_default'), 'leveraged firms should be able to default in a credit crisis');
assert.ok(crisisState.nonPerformingShare > 0.2, 'bad trade debt should propagate into the financial system');
assert.ok(crisisState.creditorTrust < 0.8, 'defaults should damage creditor trust');

console.log('Finance and corporate capital v2 regression passed');
