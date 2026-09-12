import { effectiveInfrastructureCount } from './construction.js?v=20260907-classical1';

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function activeCurrency(value) {
  return value?.active ? value : null;
}

export function currencyCommodityValue(currency) {
  const c = activeCurrency(currency);
  if (!c) return 1;
  // Medieval exchange is still anchored strongly to the amount/quality of
  // precious metal in the coin, but reputation affects what a changer will
  // actually risk paying before assay and reminting.
  const fineness = clamp(c.fineness ?? 1, 0.15, 1);
  const trust = clamp(c.trust ?? 0);
  return fineness * (0.72 + trust * 0.28);
}

export function moneyChangerCapability(region) {
  if (!region) return 0;
  const coinage = region.unlockedTechIds?.has?.('coinage') ? 0.22 : 0;
  const customs = Math.min(0.28, effectiveInfrastructureCount(region, 'market_customs') * 0.14);
  const mint = Math.min(0.24, effectiveInfrastructureCount(region, 'mint') * 0.16);
  const commerce = Math.min(0.2, Math.log1p(Math.max(0, region.tradeEconomy?.weeklyExports || 0)) / 45);
  return clamp(coinage + customs + mint + commerce);
}

function currencyKnownHere(region, currency) {
  if (!region || !currency?.id) return false;
  if (region.currencyUse?.id === currency.id) return true;
  return Boolean(region.currencyContacts?.[currency.id]);
}

export function medievalFxQuote(region, fromCurrency, toCurrency) {
  const from = activeCurrency(fromCurrency);
  const to = activeCurrency(toCurrency);
  if (!from || !to) {
    return { available: false, rate: 1, midRate: 1, spread: 0, reason: 'barter_or_no_currency' };
  }
  if (from.id === to.id) {
    return { available: true, rate: 1, midRate: 1, spread: 0, reason: 'same_currency' };
  }

  const fromValue = currencyCommodityValue(from);
  const toValue = currencyCommodityValue(to);
  const midRate = fromValue / Math.max(0.001, toValue);
  const changer = moneyChangerCapability(region);
  const distrust = (1 - clamp(from.trust)) * 0.55 + (1 - clamp(to.trust)) * 0.25;
  const unfamiliar = (!currencyKnownHere(region, from) ? 0.025 : 0) + (!currencyKnownHere(region, to) ? 0.025 : 0);
  const spread = clamp(0.085 - changer * 0.055 + distrust * 0.09 + unfamiliar, 0.012, 0.2);

  return {
    available: true,
    rate: midRate * (1 - spread),
    midRate,
    spread,
    changerCapability: changer,
    fromValue,
    toValue,
    reason: 'money_changer_quote',
  };
}

export function forexSettlementMultiplier(regionA, regionB) {
  const a = activeCurrency(regionA?.currencyUse);
  const b = activeCurrency(regionB?.currencyUse);
  if (!a || !b || a.id === b.id) return 1;
  // Merchants can normally convert at either end of a route. Use the better
  // market rather than charging both spreads, then add a small handling cost.
  const quoteA = medievalFxQuote(regionA, a, b);
  const quoteB = medievalFxQuote(regionB, a, b);
  const spread = Math.min(
    quoteA.available ? quoteA.spread : 0.2,
    quoteB.available ? quoteB.spread : 0.2
  );
  return 1 + spread * 0.85;
}

export function knownForexQuotes(region) {
  const base = activeCurrency(region?.currencyUse);
  if (!base) return [];
  const contacts = Object.values(region.currencyContacts || {})
    .filter((currency) => currency?.active && currency.id !== base.id);
  const unique = new Map();
  for (const currency of contacts) unique.set(currency.id, currency);
  return [...unique.values()]
    .map((currency) => ({ currency, quote: medievalFxQuote(region, base, currency) }))
    .filter((item) => item.quote.available)
    .sort((a, b) => a.quote.spread - b.quote.spread)
    .slice(0, 6);
}
