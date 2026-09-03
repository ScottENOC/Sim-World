// State finance connects the commercial collapse to military failure. Taxes
// are transfers from populace wealth, not newly-created money; wages and
// procurement return treasury money to the populace. Revenue therefore rises
// with taxable wealth and trade, then contracts when routes and markets fail.

const WEEKLY_WEALTH_TAX_RATE = 0.025 / 52;
const EXPORT_DUTY_RATE = 0.05;
const REVENUE_EMA_ALPHA = 1 / 52;
const SOLDIER_UPKEEP_PER_WEEK = 0.002;
const SAILOR_UPKEEP_PER_WEEK = 0.0025;
const PAYROLL_RESERVE_WEEKS = 13;
const PROCUREMENT_REVENUE_SHARE = 0.5;
const PROCUREMENT_TREASURY_SHARE = 0.02;
const ARREARS_STABILITY_PENALTY = 0.0015;
const MAX_WEEKLY_DESERTION = 0.01;
const CIVIL_ADMIN_PER_PERSON_PER_WEEK = 0.00002;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function ensureMilitaryFinance(region) {
  if (!region.militaryFinance) region.militaryFinance = {};
  const defaults = {
    weeklyTaxRevenue: 0,
    weeklyTradeDuties: 0,
    revenueEma: 0,
    payrollDue: 0,
    payrollPaid: 0,
    payRatio: 1,
    readiness: 1,
    arrearsWeeks: 0,
    procurementBudget: 0,
    procurementSpent: 0,
    weeklyProcurementSpent: 0,
    fundedPersonnelCap: Infinity,
    deserters: 0,
    administrationDue: 0,
    administrationPaid: 0,
    stateCapacity: 1,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(region.militaryFinance[key])) region.militaryFinance[key] = value;
  }
  return region.militaryFinance;
}

export function tickStateFinance(regions) {
  for (const region of regions) {
    const finance = ensureMilitaryFinance(region);
    const collectionEffectiveness = clamp01(
      0.2 + 0.5 * (region.stability ?? 1) + 0.3 * (region.safetyRating ?? 1)
    ) * clamp01(finance.stateCapacity);
    const wealthTax = Math.min(
      Math.max(0, region.wallet || 0),
      Math.max(0, region.wallet || 0) * WEEKLY_WEALTH_TAX_RATE * collectionEffectiveness
    );
    const tradeDuties = Math.min(
      Math.max(0, (region.tradeEconomy?.weeklyExports || 0) * EXPORT_DUTY_RATE * collectionEffectiveness),
      Math.max(0, (region.wallet || 0) - wealthTax)
    );
    const revenue = wealthTax + tradeDuties;
    region.wallet -= revenue;
    region.treasury += revenue;
    finance.weeklyTaxRevenue = wealthTax;
    finance.weeklyTradeDuties = tradeDuties;
    finance.revenueEma += (revenue - finance.revenueEma) * REVENUE_EMA_ALPHA;

    // Courts, messengers, granaries and tax collectors are a continuing cost,
    // not free machinery. Paying them recirculates money to households; not
    // paying them erodes the state's ability to collect next week's taxes.
    const administrationDue = Math.max(0, region.population) * CIVIL_ADMIN_PER_PERSON_PER_WEEK;
    const administrationPaid = Math.min(Math.max(0, region.treasury), administrationDue);
    region.treasury -= administrationPaid;
    region.wallet += administrationPaid;
    const administrationRatio = administrationDue > 0 ? administrationPaid / administrationDue : 1;
    finance.administrationDue = administrationDue;
    finance.administrationPaid = administrationPaid;
    const capacityAdjustment = administrationRatio < finance.stateCapacity ? 0.05 : 0.01;
    finance.stateCapacity += (administrationRatio - finance.stateCapacity) * capacityAdjustment;

    const payrollDue = Math.max(0, region.army.personnel || 0) * SOLDIER_UPKEEP_PER_WEEK +
      Math.max(0, region.navy.personnel || 0) * SAILOR_UPKEEP_PER_WEEK;
    const payrollPaid = Math.min(Math.max(0, region.treasury || 0), payrollDue);
    region.treasury -= payrollPaid;
    region.wallet += payrollPaid;
    const payRatio = payrollDue > 0 ? payrollPaid / payrollDue : 1;
    finance.payrollDue = payrollDue;
    finance.payrollPaid = payrollPaid;
    finance.payRatio = payRatio;

    if (payRatio < 0.95) {
      finance.arrearsWeeks += 1;
      region.stability = Math.max(0, region.stability - ARREARS_STABILITY_PENALTY * (1 - payRatio));
    } else {
      finance.arrearsWeeks = Math.max(0, finance.arrearsWeeks - 1);
    }
    const readinessAdjustment = payRatio < finance.readiness ? 0.08 : 0.02;
    finance.readiness += (payRatio - finance.readiness) * readinessAdjustment;

    let deserters = 0;
    if (finance.arrearsWeeks >= 4 && payRatio < 0.75) {
      const desertionRate = MAX_WEEKLY_DESERTION * (1 - payRatio);
      const armyDeserters = region.army.personnel * desertionRate;
      const navyDeserters = region.navy.personnel * desertionRate;
      region.army.personnel = Math.max(0, region.army.personnel - armyDeserters);
      region.navy.personnel = Math.max(0, region.navy.personnel - navyDeserters);
      deserters = armyDeserters + navyDeserters;
    }
    finance.deserters = deserters;

    // Revenue supports a permanent force; reserves can bridge one bad season,
    // but cannot sustain a large army indefinitely after the tax base fails.
    const blendedUpkeep = SOLDIER_UPKEEP_PER_WEEK;
    const operatingRevenue = Math.max(0, finance.revenueEma - administrationDue);
    finance.fundedPersonnelCap = Math.max(0,
      (operatingRevenue + Math.max(0, region.treasury) / 52) / blendedUpkeep
    );

    const nextPayroll = Math.max(0, region.army.personnel) * SOLDIER_UPKEEP_PER_WEEK +
      Math.max(0, region.navy.personnel) * SAILOR_UPKEEP_PER_WEEK;
    const unreservedTreasury = Math.max(0, region.treasury - nextPayroll * PAYROLL_RESERVE_WEEKS);
    finance.procurementBudget = Math.min(
      unreservedTreasury,
      operatingRevenue * PROCUREMENT_REVENUE_SHARE + region.treasury * PROCUREMENT_TREASURY_SHARE
    );
    finance.weeklyProcurementSpent = finance.procurementSpent;
    finance.procurementSpent = 0;
    region.report.stateFinance = {
      revenue, wealthTax, tradeDuties, payrollDue, payrollPaid, payRatio,
      readiness: finance.readiness, arrearsWeeks: finance.arrearsWeeks,
      fundedPersonnelCap: finance.fundedPersonnelCap, deserters,
      procurementBudget: finance.procurementBudget,
      procurementSpent: finance.weeklyProcurementSpent,
      administrationRatio, stateCapacity: finance.stateCapacity,
    };
  }
}

export function militaryReadiness(region) {
  return clamp01(region.militaryFinance?.readiness ?? 1);
}

export function spendMilitaryProcurement(region, requested) {
  const finance = ensureMilitaryFinance(region);
  const spend = Math.min(
    Math.max(0, requested),
    Math.max(0, finance.procurementBudget),
    Math.max(0, region.treasury || 0)
  );
  if (spend <= 0) return 0;
  finance.procurementBudget -= spend;
  finance.procurementSpent += spend;
  region.treasury -= spend;
  region.wallet += spend;
  return spend;
}
