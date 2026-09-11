const CURRENCY_LEGITIMACY_THRESHOLD = 0.55;
const DISCOVERY_THRESHOLD = 1;

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function stableFraction(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function currencyIdFor(polity) {
  return `currency_${polity.id}`;
}

export function ensureCurrencyInstitution(polity) {
  if (!polity.currency) {
    polity.currency = {
      active: false,
      id: currencyIdFor(polity),
      name: null,
      issuerPolityId: polity.id,
      foundedTick: null,
      trust: 0,
      fineness: 1,
      undisclosedDebasement: 0,
      disclosedDebasement: 0,
      discoveryProgress: 0,
      debasementCount: 0,
      lastDebasementTick: null,
      lastDiscoveryTick: null,
      seigniorageRaised: 0,
    };
  }
  return polity.currency;
}

export function currencyAvailability(polity, capital) {
  if (!polity || !capital) return { available: false, reason: 'No recognised polity.' };
  const currency = ensureCurrencyInstitution(polity);
  if (currency.active) return { available: false, reason: 'A currency is already in circulation.' };
  if (polity.kingdomSinceTick == null) return { available: false, reason: 'Only an established kingdom can issue a trusted currency.' };
  const legitimacy = clamp(polity.administration?.legitimacy ?? 0);
  if (legitimacy < CURRENCY_LEGITIMACY_THRESHOLD) {
    return {
      available: false,
      reason: `Legitimacy ${(legitimacy * 100).toFixed(0)}% — requires ${Math.round(CURRENCY_LEGITIMACY_THRESHOLD * 100)}%.`,
    };
  }
  return { available: true, legitimacy };
}

export function foundCurrency(polity, capital, regions, currentTick = 0) {
  const availability = currencyAvailability(polity, capital);
  if (!availability.available) return { changed: false, ...availability };
  const currency = ensureCurrencyInstitution(polity);
  currency.active = true;
  currency.name = `${capital.name} coin`;
  currency.foundedTick = currentTick;
  currency.fineness = 1;
  currency.trust = clamp(0.58 + availability.legitimacy * 0.32, 0.65, 0.92);
  currency.discoveryProgress = 0;
  propagateCurrency(polity, regions);
  return { changed: true, currency };
}

function issuerTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

function propagateCurrency(polity, regions) {
  const currency = ensureCurrencyInstitution(polity);
  for (const region of issuerTerritories(polity, regions)) {
    if (!currency.active) {
      region.currencyUse = null;
      continue;
    }
    region.currencyUse = {
      id: currency.id,
      name: currency.name,
      issuerPolityId: polity.id,
      trust: currency.trust,
      fineness: currency.fineness,
      active: true,
    };
  }
}

export function debaseCurrency(polity, capital, regions, fraction = 0.1, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  if (!currency.active) return { changed: false, reason: 'No currency in circulation.' };
  const severity = clamp(fraction, 0.02, 0.35);
  const previousFineness = currency.fineness;
  currency.fineness = clamp(currency.fineness * (1 - severity), 0.2, 1);
  const actualDebasement = Math.max(0, previousFineness - currency.fineness);
  currency.undisclosedDebasement = clamp(currency.undisclosedDebasement + actualDebasement, 0, 0.8);
  currency.discoveryProgress = Math.max(0, currency.discoveryProgress - 0.15);
  currency.debasementCount += 1;
  currency.lastDebasementTick = currentTick;

  const annualRevenueProxy = Math.max(0, capital.militaryFinance?.revenueEma || 0) * 52;
  const monetaryBaseProxy = Math.max(10, annualRevenueProxy * 1.5 + Math.max(0, capital.treasury || 0) * 0.25);
  const windfall = monetaryBaseProxy * actualDebasement * 0.9;
  capital.treasury = Math.max(0, capital.treasury || 0) + windfall;
  currency.seigniorageRaised += windfall;
  propagateCurrency(polity, regions);
  return { changed: true, windfall, currency };
}

export function tickCurrencyInstitution(polity, capital, regions, elapsedDays = 30, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  if (!currency.active) return [];
  const years = Math.max(0, elapsedDays) / 365.2425;
  const admin = polity.administration || {};
  const tradeScale = Math.min(1, Math.log1p(Math.max(0, capital.tradeEconomy?.weeklyExports || 0)) / 8);
  const mintSignal = capital.unlockedTechIds?.has?.('coinage') ? 0.08 : 0;

  // Trust slowly reflects functioning institutions even without a crisis.
  const institutionalTarget = clamp(0.48 + (admin.legitimacy || 0) * 0.32 + (admin.accounting || 0) * 0.12 + tradeScale * 0.08);
  const adjustment = 1 - Math.pow(0.94, years);
  currency.trust += (institutionalTarget - currency.trust) * adjustment;

  const events = [];
  if (currency.undisclosedDebasement > 0.0001) {
    const scrutiny = 0.12 + (admin.accounting || 0) * 0.45 + tradeScale * 0.25 + mintSignal;
    currency.discoveryProgress += years * scrutiny;
    const hiddenThreshold = DISCOVERY_THRESHOLD * (0.72 + stableFraction(`${currency.id}:${currency.debasementCount}`) * 0.55);
    if (currency.discoveryProgress >= hiddenThreshold) {
      const discovered = currency.undisclosedDebasement;
      currency.disclosedDebasement = clamp(currency.disclosedDebasement + discovered, 0, 1);
      currency.undisclosedDebasement = 0;
      currency.discoveryProgress = 0;
      currency.lastDiscoveryTick = currentTick;
      currency.trust = clamp(currency.trust - discovered * 0.95 - 0.05, 0.08, 1);
      events.push({
        type: 'currency_debasement_discovered',
        polityId: polity.id,
        regionId: capital.id,
        currencyName: currency.name,
        discoveredDebasement: discovered,
        trust: currency.trust,
      });
    }
  }

  propagateCurrency(polity, regions);
  return events;
}

export function currencyFiscalModifiers(region) {
  const use = region?.currencyUse;
  if (!use?.active) return { collection: 1, tradeDuty: 1, adminEfficiency: 1, payrollEfficiency: 1 };
  const confidence = clamp((use.trust - 0.35) / 0.65, -0.35, 1);
  return {
    collection: Math.max(0.9, 1 + confidence * 0.12),
    tradeDuty: Math.max(0.88, 1 + confidence * 0.1),
    adminEfficiency: Math.max(0.92, 1 + confidence * 0.08),
    payrollEfficiency: Math.max(0.9, 1 + confidence * 0.1),
  };
}

export function currencyTradeFriction(regionA, regionB) {
  const a = regionA?.currencyUse;
  const b = regionB?.currencyUse;
  if (!a?.active && !b?.active) return 1;
  if (a?.active && b?.active && a.id === b.id) {
    const trust = Math.min(a.trust ?? 0, b.trust ?? 0);
    return Math.max(0.86, Math.min(1.15, 0.86 + (1 - trust) * 0.34));
  }
  const trust = Math.max(a?.trust ?? 0, b?.trust ?? 0);
  // A trusted portable currency still helps cross-border settlement a little;
  // a distrusted one creates exchange/testing friction instead.
  return Math.max(0.94, Math.min(1.12, 1.02 - trust * 0.08));
}

export function currencyStatus(polity) {
  const currency = ensureCurrencyInstitution(polity);
  return {
    ...currency,
    legitimacyThreshold: CURRENCY_LEGITIMACY_THRESHOLD,
    legitimacy: clamp(polity.administration?.legitimacy ?? 0),
  };
}
