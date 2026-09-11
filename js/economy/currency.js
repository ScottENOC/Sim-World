const CURRENCY_LEGITIMACY_THRESHOLD = 0.55;
const DISCOVERY_THRESHOLD = 1;
const CONTACT_MEMORY_WEEKS = 520;
const MIN_CURRENCY_TRUST = 0.28;
const REFORM_MIN_WEEKS = 260;

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function stableFraction(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function currencyIdFor(polity, generation = 1) {
  return `currency_${polity.id}_g${generation}`;
}

function currencySnapshot(currency) {
  if (!currency?.active) return null;
  return {
    id: currency.id,
    name: currency.name,
    issuerPolityId: currency.issuerPolityId,
    trust: clamp(currency.trust),
    fineness: clamp(currency.fineness),
    generation: currency.generation || 1,
    active: true,
  };
}

function isPlayerPolity(polity) {
  return globalThis.__worldsim?.activePlayerPolityId === polity?.id;
}

export function ensureCurrencyInstitution(polity) {
  if (!polity.currency) {
    polity.currency = {
      active: false,
      generation: 1,
      id: currencyIdFor(polity, 1),
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
      lastReformTick: null,
      seigniorageRaised: 0,
      history: [],
    };
  }
  const currency = polity.currency;
  currency.generation = Math.max(1, Number(currency.generation) || 1);
  if (!Array.isArray(currency.history)) currency.history = [];
  if (!currency.id) currency.id = currencyIdFor(polity, currency.generation);
  if (!Number.isFinite(currency.trust)) currency.trust = 0;
  if (!Number.isFinite(currency.fineness)) currency.fineness = 1;
  if (!Number.isFinite(currency.seigniorageRaised)) currency.seigniorageRaised = 0;
  return currency;
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

function issuerTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

function archiveCurrentCurrency(polity, currentTick, reason) {
  const currency = ensureCurrencyInstitution(polity);
  if (!currency.active) return;
  currency.history.push({
    id: currency.id,
    name: currency.name,
    generation: currency.generation,
    foundedTick: currency.foundedTick,
    endedTick: currentTick,
    endingTrust: currency.trust,
    endingFineness: currency.fineness,
    debasementCount: currency.debasementCount,
    reason,
  });
  if (currency.history.length > 12) currency.history = currency.history.slice(-12);
}

function resetCurrencyRegime(polity, capital, currentTick, { reformed = false } = {}) {
  const currency = ensureCurrencyInstitution(polity);
  const legitimacy = clamp(polity.administration?.legitimacy ?? 0);
  const accounting = clamp(polity.administration?.accounting ?? 0);
  currency.active = true;
  currency.issuerPolityId = polity.id;
  currency.id = currencyIdFor(polity, currency.generation);
  currency.name = reformed ? `Reformed ${capital.name} coin` : `${capital.name} coin`;
  currency.foundedTick = currentTick;
  currency.fineness = 1;
  currency.trust = clamp(0.5 + legitimacy * 0.32 + accounting * 0.12, 0.58, 0.94);
  currency.undisclosedDebasement = 0;
  currency.disclosedDebasement = 0;
  currency.discoveryProgress = 0;
  currency.debasementCount = 0;
  currency.lastDebasementTick = null;
  currency.lastDiscoveryTick = null;
  return currency;
}

export function foundCurrency(polity, capital, regions, currentTick = 0) {
  const availability = currencyAvailability(polity, capital);
  if (!availability.available) return { changed: false, ...availability };
  const currency = ensureCurrencyInstitution(polity);
  currency.generation = Math.max(1, currency.generation || 1);
  resetCurrencyRegime(polity, capital, currentTick);
  chooseCurrencyForTerritories(polity, regions, currentTick);
  return { changed: true, currency };
}

export function reformCurrency(polity, capital, regions, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  if (!currency.active) return { changed: false, reason: 'No domestic currency exists to reform.' };
  const legitimacy = clamp(polity.administration?.legitimacy ?? 0);
  if (legitimacy < 0.5) return { changed: false, reason: 'Legitimacy must be at least 50% to make a credible monetary reform.' };
  const age = currentTick - (currency.foundedTick ?? currentTick);
  if (age < REFORM_MIN_WEEKS) return { changed: false, reason: 'The current currency regime is too new to reform again.' };
  const annualRevenue = Math.max(0, capital.militaryFinance?.revenueEma || 0) * 52;
  const reformCost = Math.max(5, annualRevenue * 0.35);
  if ((capital.treasury || 0) < reformCost) return { changed: false, reason: `Treasury needs ${reformCost.toFixed(1)} for recall and reminting.` };

  capital.treasury -= reformCost;
  archiveCurrentCurrency(polity, currentTick, 'reformed');
  currency.generation += 1;
  currency.lastReformTick = currentTick;
  resetCurrencyRegime(polity, capital, currentTick, { reformed: true });
  polity.administration.legitimacy = clamp(legitimacy - 0.02);
  chooseCurrencyForTerritories(polity, regions, currentTick);
  return { changed: true, reformCost, currency };
}

export function abandonCurrency(polity, regions, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  if (!currency.active) return { changed: false, reason: 'No domestic currency is active.' };
  archiveCurrentCurrency(polity, currentTick, 'abandoned');
  currency.active = false;
  chooseCurrencyForTerritories(polity, regions, currentTick);
  return { changed: true };
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
  chooseCurrencyForTerritories(polity, regions, currentTick);
  return { changed: true, windfall, currency };
}

function ensureCurrencyContacts(region) {
  if (!region.currencyContacts || typeof region.currencyContacts !== 'object' || Array.isArray(region.currencyContacts)) {
    region.currencyContacts = {};
  }
  return region.currencyContacts;
}

export function recordCurrencyContact(regionA, regionB, currentTick = 0) {
  if (!regionA || !regionB) return;
  const contactsA = ensureCurrencyContacts(regionA);
  const contactsB = ensureCurrencyContacts(regionB);
  if (regionB.currencyUse?.active) contactsA[regionB.currencyUse.id] = { ...regionB.currencyUse, lastSeenTick: currentTick };
  if (regionA.currencyUse?.active) contactsB[regionA.currencyUse.id] = { ...regionA.currencyUse, lastSeenTick: currentTick };
}

function candidateCurrencies(region, domesticCurrency, currentTick) {
  const candidates = new Map();
  const domestic = currencySnapshot(domesticCurrency);
  if (domestic) candidates.set(domestic.id, domestic);
  const contacts = ensureCurrencyContacts(region);
  for (const [id, contact] of Object.entries(contacts)) {
    if (!contact?.active || !Number.isFinite(contact.trust)) continue;
    if (Number.isFinite(currentTick) && Number.isFinite(contact.lastSeenTick) && currentTick - contact.lastSeenTick > CONTACT_MEMORY_WEEKS) {
      delete contacts[id];
      continue;
    }
    candidates.set(id, contact);
  }
  return [...candidates.values()];
}

function chooseRegionCurrency(region, domesticCurrency, currentTick) {
  const currentId = region.currencyUse?.id;
  const candidates = candidateCurrencies(region, domesticCurrency, currentTick);
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if ((candidate.trust ?? 0) < MIN_CURRENCY_TRUST) continue;
    const domestic = candidate.issuerPolityId === region.governance?.sovereignPolityId;
    const inertia = candidate.id === currentId ? 0.05 : 0;
    const score = candidate.trust + (domestic ? 0.08 : 0) + inertia;
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  region.currencyUse = best && bestScore >= 0.45 ? { ...best, active: true } : null;
  return region.currencyUse;
}

export function chooseCurrencyForTerritories(polity, regions, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  for (const region of issuerTerritories(polity, regions)) chooseRegionCurrency(region, currency, currentTick);
}

function maybeNpcCurrencyDecision(polity, capital, regions, currentTick) {
  if (isPlayerPolity(polity)) return [];
  const events = [];
  const currency = ensureCurrencyInstitution(polity);
  const availability = currencyAvailability(polity, capital);
  const kingdomAge = polity.kingdomSinceTick == null ? 0 : currentTick - polity.kingdomSinceTick;

  if (!currency.active && availability.available && kingdomAge >= 104 && (polity.administration?.legitimacy || 0) >= 0.6) {
    const result = foundCurrency(polity, capital, regions, currentTick);
    if (result.changed) events.push({ type: 'currency_founded', polityId: polity.id, regionId: capital.id, currencyName: result.currency.name });
    return events;
  }

  if (!currency.active) return events;
  const arrears = capital.militaryFinance?.arrearsWeeks || 0;
  const year = Math.floor(currentTick / 52);
  if (arrears >= 4 && currency.trust >= 0.58 && stableFraction(`${polity.id}:debase:${year}`) < 0.35) {
    const result = debaseCurrency(polity, capital, regions, 0.1, currentTick);
    if (result.changed) events.push({ type: 'currency_debased', polityId: polity.id, regionId: capital.id, currencyName: currency.name });
  }

  const age = currentTick - (currency.foundedTick ?? currentTick);
  if (currency.trust < 0.4 && age >= REFORM_MIN_WEEKS && (polity.administration?.legitimacy || 0) >= 0.55) {
    const result = reformCurrency(polity, capital, regions, currentTick);
    if (result.changed) events.push({ type: 'currency_reformed', polityId: polity.id, regionId: capital.id, currencyName: result.currency.name });
  }
  return events;
}

export function tickCurrencyInstitution(polity, capital, regions, elapsedDays = 30, currentTick = 0) {
  const currency = ensureCurrencyInstitution(polity);
  const events = maybeNpcCurrencyDecision(polity, capital, regions, currentTick);
  if (!currency.active) {
    chooseCurrencyForTerritories(polity, regions, currentTick);
    return events;
  }

  const years = Math.max(0, elapsedDays) / 365.2425;
  const admin = polity.administration || {};
  const tradeScale = Math.min(1, Math.log1p(Math.max(0, capital.tradeEconomy?.weeklyExports || 0)) / 8);
  const mintSignal = capital.unlockedTechIds?.has?.('coinage') ? 0.08 : 0;
  const institutionalTarget = clamp(0.48 + (admin.legitimacy || 0) * 0.32 + (admin.accounting || 0) * 0.12 + tradeScale * 0.08);
  const adjustment = 1 - Math.pow(0.94, years);
  currency.trust += (institutionalTarget - currency.trust) * adjustment;

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
        type: 'currency_debasement_discovered', polityId: polity.id, regionId: capital.id,
        currencyName: currency.name, discoveredDebasement: discovered, trust: currency.trust,
      });
    }
  }

  chooseCurrencyForTerritories(polity, regions, currentTick);
  return events;
}

export function currencyFiscalModifiers(region) {
  const use = region?.currencyUse;
  if (!use?.active) return { collection: 1, tradeDuty: 1, adminEfficiency: 1, payrollEfficiency: 1 };
  const confidence = clamp((use.trust - 0.35) / 0.65, -0.35, 1);
  const domestic = use.issuerPolityId === region.governance?.sovereignPolityId;
  const control = domestic ? 1 : 0.45;
  return {
    collection: Math.max(0.92, 1 + confidence * 0.12 * control),
    tradeDuty: Math.max(0.9, 1 + confidence * 0.1 * control),
    adminEfficiency: Math.max(0.94, 1 + confidence * 0.08 * control),
    payrollEfficiency: Math.max(0.92, 1 + confidence * 0.1 * (domestic ? 1 : 0.65)),
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
