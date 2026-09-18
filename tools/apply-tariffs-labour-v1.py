from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)

# --- trade engine ---
p = Path('js/economy/trade.js')
s = p.read_text()
s = replace_once(s,
    "import { tradeAllowed } from './tradePolicy.js?v=20260905-policy1';",
    "import { borderTariffQuote, tradeAllowed } from './tradePolicy.js?v=20260905-policy1';",
    'trade import')
s = replace_once(s,
    "    foodImportEma: 0, bronzeExportEma: 0, routeReliabilityEma: 0,\n    weeklyExports: 0, weeklyImports: 0, searchPressure: 0,",
    "    foodImportEma: 0, bronzeExportEma: 0, routeReliabilityEma: 0,\n    importTariffBurdenEma: 0, tariffRevenueEma: 0,\n    weeklyExports: 0, weeklyImports: 0, weeklyImportTariffPaid: 0, weeklyExportTariffPaid: 0, weeklyTariffRevenue: 0, searchPressure: 0,",
    'trade defaults')
s = replace_once(s,
    "  if (!Array.isArray(region.tradeEconomy.ventures)) region.tradeEconomy.ventures = [];\n",
    "  if (!Array.isArray(region.tradeEconomy.ventures)) region.tradeEconomy.ventures = [];\n  if (!region.tradeEconomy.importSpendByResourceEma || typeof region.tradeEconomy.importSpendByResourceEma !== 'object') region.tradeEconomy.importSpendByResourceEma = {};\n  if (!region.tradeEconomy.weeklyImportsByResource || typeof region.tradeEconomy.weeklyImportsByResource !== 'object') region.tradeEconomy.weeklyImportsByResource = {};\n",
    'trade resource ema init')
s = replace_once(s,
    "  economy.weeklyImports = 0;\n  economy.weeklyFoodImports = 0;",
    "  economy.weeklyImports = 0;\n  economy.weeklyImportTariffPaid = 0;\n  economy.weeklyExportTariffPaid = 0;\n  economy.weeklyTariffRevenue = 0;\n  economy.weeklyImportsByResource = {};\n  economy.weeklyFoodImports = 0;",
    'trade weekly reset')
s = replace_once(s,
    "  economy.bronzeExportEma = ema(economy.bronzeExportEma, economy.weeklyBronzeExports);\n  const reliability = economy.weeklyTradeCount > 0",
    "  economy.bronzeExportEma = ema(economy.bronzeExportEma, economy.weeklyBronzeExports);\n  const importTariffBurden = economy.weeklyImports + economy.weeklyImportTariffPaid > 0\n    ? economy.weeklyImportTariffPaid / (economy.weeklyImports + economy.weeklyImportTariffPaid) : 0;\n  economy.importTariffBurdenEma = ema(economy.importTariffBurdenEma, importTariffBurden);\n  economy.tariffRevenueEma = ema(economy.tariffRevenueEma, economy.weeklyTariffRevenue);\n  const importKeys = new Set([...Object.keys(economy.importSpendByResourceEma || {}), ...Object.keys(economy.weeklyImportsByResource || {})]);\n  for (const resource of importKeys) {\n    const value = ema(economy.importSpendByResourceEma[resource] || 0, economy.weeklyImportsByResource[resource] || 0);\n    if (value > 0.01) economy.importSpendByResourceEma[resource] = value; else delete economy.importSpendByResourceEma[resource];\n  }\n  const reliability = economy.weeklyTradeCount > 0",
    'trade tariff ema')
s = replace_once(s,
    "      if (!tradeAllowed(region, dest, resource)) continue;\n      const priceHere = pricesHere[resource];\n      const priceThere = pricesThere[resource];\n      const cost = baseCost + priceHere * transit.rate;\n      const gap = priceThere - priceHere - cost;",
    "      const tariffQuote = borderTariffQuote(region, dest, resource);\n      if (!tariffQuote.allowed) continue;\n      const priceHere = pricesHere[resource];\n      const priceThere = pricesThere[resource];\n      const cost = baseCost + priceHere * transit.rate;\n      const tariffCost = priceThere * tariffQuote.importRate + priceThere * tariffQuote.exportRate;\n      const gap = priceThere - priceHere - cost - tariffCost;",
    'trade opportunity tariff')
old_arrival = """      if (!venture.arrived && currentDay >= arrivalDay) {
        if (!tradeAllowed(origin, dest, venture.resource)) {
          venture.payment = 0;
          venture.soldVolume = 0;
          venture.unsoldCargo = Math.max(0, venture.cargo || 0);
          venture.arrived = true;
        }
        const buyerEconomy = ensureTradeEconomy(dest);
        const destinationPrice = localPrice(dest, venture.resource);
        const price = Math.max(0.001, destinationPrice);
        const creditAvailable = Math.max(0, buyerEconomy.creditLimit - buyerEconomy.debt);
        const purchasingPower = Math.max(0, dest.wallet || 0) + creditAvailable;
        const saleable = Math.min(venture.cargo || 0, purchasingPower / price);
        const sold = Math.max(0, saleable);
        const payment = sold * price;
        const cashPaid = Math.min(Math.max(0, dest.wallet || 0), payment);
        dest.wallet = Math.max(0, (dest.wallet || 0) - cashPaid);
        buyerEconomy.debt += payment - cashPaid;
        dest.stockpile[venture.resource] = (dest.stockpile[venture.resource] || 0) + sold;
        buyerEconomy.weeklyImports += payment;
        if (venture.resource === 'food') buyerEconomy.weeklyFoodImports += sold;
        buyerEconomy.weeklyRouteReliability += venture.reliability || 0;
        buyerEconomy.weeklyTradeCount += sold > 0 ? 1 : 0;
        venture.payment = payment;
        venture.soldVolume = sold;
        venture.unsoldCargo = Math.max(0, (venture.cargo || 0) - sold);
        venture.arrived = true;
      }
"""
new_arrival = """      if (!venture.arrived && currentDay >= arrivalDay) {
        const tariffQuote = borderTariffQuote(origin, dest, venture.resource);
        if (!tariffQuote.allowed) {
          venture.payment = 0;
          venture.exportTariff = 0;
          venture.soldVolume = 0;
          venture.unsoldCargo = Math.max(0, venture.cargo || 0);
          venture.arrived = true;
        } else {
          const buyerEconomy = ensureTradeEconomy(dest);
          const destinationPrice = localPrice(dest, venture.resource);
          const price = Math.max(0.001, destinationPrice);
          const creditAvailable = Math.max(0, buyerEconomy.creditLimit - buyerEconomy.debt);
          const purchasingPower = Math.max(0, dest.wallet || 0) + creditAvailable;
          const landedUnitCost = price * (1 + tariffQuote.importRate);
          const saleable = Math.min(venture.cargo || 0, purchasingPower / Math.max(0.001, landedUnitCost));
          const sold = Math.max(0, saleable);
          const goodsValue = sold * price;
          const settledTariff = borderTariffQuote(origin, dest, venture.resource, goodsValue);
          const totalDue = goodsValue + settledTariff.importTariff;
          const cashPaid = Math.min(Math.max(0, dest.wallet || 0), totalDue);
          dest.wallet = Math.max(0, (dest.wallet || 0) - cashPaid);
          buyerEconomy.debt += totalDue - cashPaid;
          dest.treasury = Math.max(0, Number(dest.treasury) || 0) + settledTariff.importTariff;
          dest.stockpile[venture.resource] = (dest.stockpile[venture.resource] || 0) + sold;
          buyerEconomy.weeklyImports += goodsValue;
          buyerEconomy.weeklyImportsByResource[venture.resource] = (buyerEconomy.weeklyImportsByResource[venture.resource] || 0) + goodsValue;
          buyerEconomy.weeklyImportTariffPaid += settledTariff.importTariff;
          buyerEconomy.weeklyTariffRevenue += settledTariff.importTariff;
          if (venture.resource === 'food') buyerEconomy.weeklyFoodImports += sold;
          buyerEconomy.weeklyRouteReliability += venture.reliability || 0;
          buyerEconomy.weeklyTradeCount += sold > 0 ? 1 : 0;
          venture.payment = goodsValue;
          venture.exportTariff = settledTariff.exportTariff;
          venture.soldVolume = sold;
          venture.unsoldCargo = Math.max(0, (venture.cargo || 0) - sold);
          venture.arrived = true;
        }
      }
"""
s = replace_once(s, old_arrival, new_arrival, 'venture arrival settlement')
s = replace_once(s,
    "  const debtRepaid = Math.min(economy.debt, payment * CREDIT_REPAYMENT_SHARE_OF_EXPORTS);\n  economy.debt -= debtRepaid;\n  origin.wallet = (origin.wallet || 0) + payment - debtRepaid;\n\n  const costBasis = (venture.cargo || 0) * (venture.originPrice || 0) + (venture.cargo || 0) * (venture.routeCost || 0);\n  const profit = payment - costBasis;",
    "  const debtRepaid = Math.min(economy.debt, payment * CREDIT_REPAYMENT_SHARE_OF_EXPORTS);\n  economy.debt -= debtRepaid;\n  const exportTariff = Math.min(payment, Math.max(0, Number(venture.exportTariff) || 0));\n  origin.wallet = (origin.wallet || 0) + payment - debtRepaid - exportTariff;\n  origin.treasury = Math.max(0, Number(origin.treasury) || 0) + exportTariff;\n  economy.weeklyExportTariffPaid += exportTariff;\n  economy.weeklyTariffRevenue += exportTariff;\n\n  const costBasis = (venture.cargo || 0) * (venture.originPrice || 0) + (venture.cargo || 0) * (venture.routeCost || 0);\n  const profit = payment - exportTariff - costBasis;",
    'export tariff settlement')
p.write_text(s)

# --- labour relations: consume actual tariff burden, never a protection slider ---
p = Path('js/society/labourRelations.js')
s = p.read_text()
s = replace_once(s,
    "  const hardship=pct(e.hardship||0),unemployment=pct(e.unemploymentRate||0),food=pct(e.causes?.foodPrices||0),failures=pct(e.causes?.firmFailures||0),trade=pct(e.causes?.tradeDisruption||0);\n",
    "  const hardship=pct(e.hardship||0),unemployment=pct(e.unemploymentRate||0),food=pct(e.causes?.foodPrices||0),failures=pct(e.causes?.firmFailures||0),trade=pct(e.causes?.tradeDisruption||0);\n  const tariffCost=pct(region.tradeEconomy?.importTariffBurdenEma||0);\n",
    'labour tariff input')
s = replace_once(s,
    "  const workplace=pct((region.enterpriseExternalities?.labourHarm||0)*.55+(1-safety)*industry*.18),wageCostPressure=pct(hardship*.38+food*.3-wageRelief),insecurity=pct(unemployment*.5+failures*.28+trade*.2-relief*.12);",
    "  const workplace=pct((region.enterpriseExternalities?.labourHarm||0)*.55+(1-safety)*industry*.18),wageCostPressure=pct(hardship*.38+food*.3+tariffCost*.22-wageRelief),insecurity=pct(unemployment*.5+failures*.28+trade*.2-relief*.12);",
    'labour tariff grievance')
s = replace_once(s,
    "  return {formal,literacy,urban,industry,hardship,unemployment,food,failures,trade,standards,safety,relief,capacity,affordable,excessFloor,hiringPenalty,workplace,wageCostPressure,insecurity,rawGrievance,organisationTarget,patrioticRestraint,strikeBase,emergency,munitionsCritical};",
    "  return {formal,literacy,urban,industry,hardship,unemployment,food,failures,trade,tariffCost,standards,safety,relief,capacity,affordable,excessFloor,hiringPenalty,workplace,wageCostPressure,insecurity,rawGrievance,organisationTarget,patrioticRestraint,strikeBase,emergency,munitionsCritical};",
    'labour assessment result')
s = replace_once(s,
    "  const causes=[];\n  if(a.wageCostPressure>.18)causes.push('living costs are outrunning take-home pay');",
    "  const causes=[];\n  if(a.tariffCost>.08)causes.push('tariffs are materially raising the cost of imported goods and inputs');\n  if(a.wageCostPressure>.18)causes.push('living costs are outrunning take-home pay');",
    'labour notice tariff')
s = replace_once(s,
    "causes:{wageCost:a.wageCostPressure,workplace:a.workplace,jobInsecurity:a.insecurity,hardship:a.hardship,unemployment:a.unemployment,warEmergency:a.emergency}",
    "causes:{wageCost:a.wageCostPressure,tariffCost:a.tariffCost,workplace:a.workplace,jobInsecurity:a.insecurity,hardship:a.hardship,unemployment:a.unemployment,warEmergency:a.emergency}",
    'labour report tariff')
p.write_text(s)

# --- Treasurer UI: extend existing embargo controls, do not create a second policy system ---
p = Path('js/ui/advisors.js')
s = p.read_text()
s = replace_once(s,
    "import { activeTradeRestrictions, removeTradeRestriction, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';",
    "import { activeTariffs, activeTradeRestrictions, removeTradeRestriction, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';",
    'advisor trade import')
s = replace_once(s,
    "    const restrictions = activeTradeRestrictions(player);\n",
    "    const restrictions = activeTradeRestrictions(player);\n    const tariffs = activeTariffs(player);\n",
    'advisor tariffs list')
s = replace_once(s,
    "${section('Trade', row('Exports this week', number(trade.weeklyExports)) + row('Imports this week', number(trade.weeklyImports)) + row('Trade debt', `${number(trade.debt)} / ${number(trade.creditLimit)}`) + row('Known partners', number(player.tradePartnerIds?.size)))}",
    "${section('Trade', row('Exports this week', number(trade.weeklyExports)) + row('Imports this week', number(trade.weeklyImports)) + row('Tariff revenue this week', Number(trade.weeklyTariffRevenue || 0).toFixed(1)) + row('Import tariff burden', percent(trade.importTariffBurdenEma || 0)) + row('Trade debt', `${number(trade.debt)} / ${number(trade.creditLimit)}`) + row('Known partners', number(player.tradePartnerIds?.size)))}",
    'advisor tariff report')
start = s.index("      ${section('Trade restrictions', `")
end_marker = "      ${section('Later institutions', '<p class=\"advisor-note\">The same policy engine already carries a tariff-rate field, but tariffs are not active in Bronze Age play. A later state can use this layer for customs duties without replacing the embargo system.</p>')}`;"
end = s.index(end_marker, start) + len(end_marker)
new_section = r'''      ${section('Trade policy', `
        <p class="advisor-note">Use the same goods-and-country rule for embargoes or tariffs. Tariffs make the selected trade less attractive, raise the importer's landed cost and transfer the duty to your treasury. They can shelter domestic producers only through those real market effects; there is no separate protectionism bonus.</p>
        <label class="advisor-field"><span>Direction</span><select id="trade-rule-direction"><option value="import">Imports only</option><option value="export">Exports only</option><option value="trade">Imports and exports</option></select></label>
        <label class="advisor-field"><span>Goods</span><select id="trade-rule-good"><option value="*">All goods</option>${goods.map(([id, good]) => `<option value="${id}">${good.label}${good.strategic ? ' · military' : ''}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Country</span><select id="trade-rule-country"><option value="*">All countries</option>${actors.map((region) => `<option value="${tradeActorId(region)}">${region.name}</option>`).join('')}</select></label>
        <label class="advisor-field advisor-slider"><span>Tariff rate <b id="trade-tariff-label">20%</b></span><input id="trade-rule-tariff" type="range" min="0" max="200" step="5" value="20"></label>
        <button id="add-trade-tariff" class="advisor-order">Set tariff</button>
        <button id="add-trade-embargo" class="advisor-order danger">Prohibit trade</button>
        ${tariffs.length ? `<div class="advisor-list">${tariffs.map((rule) => `<button data-remove-trade-rule="${rule.id}"><span>${ruleLabel(rule)}</span><small>${Math.round((rule.tariffRate || 0) * 100)}% tariff · remove</small></button>`).join('')}</div>` : '<p class="advisor-note">No tariffs are currently in force.</p>'}
        ${restrictions.length ? `<div class="advisor-list">${restrictions.map((rule) => `<button data-remove-trade-rule="${rule.id}"><span>${ruleLabel(rule)}</span><small>Embargo · lift restriction</small></button>`).join('')}</div>` : '<p class="advisor-note">No additional embargoes are in force.</p>'}
        <p class="advisor-note">For a list of goods or countries, add several specific rules. The phone-first control avoids awkward multi-select gestures. Very high tariffs can choke off the trade entirely and can provoke diplomatic resentment.</p>`)};'''
s = s[:start] + new_section + s[end:]
anchor = """    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
      const direction = document.getElementById('trade-rule-direction')?.value || 'trade';
      const good = document.getElementById('trade-rule-good')?.value || '*';
      const country = document.getElementById('trade-rule-country')?.value || '*';
      setTradeRestriction(player, {
        direction, goods: good === '*' ? null : [good],
        counterparties: country === '*' ? null : [country], allowed: false,
      }, this.regions, this.clock.tickIndex);
      this.render(false);
    });
"""
addition = anchor + """    const tariffInput = document.getElementById('trade-rule-tariff');
    tariffInput?.addEventListener('input', () => {
      const label = document.getElementById('trade-tariff-label');
      if (label) label.textContent = `${tariffInput.value}%`;
    });
    document.getElementById('add-trade-tariff')?.addEventListener('click', () => {
      const direction = document.getElementById('trade-rule-direction')?.value || 'import';
      const good = document.getElementById('trade-rule-good')?.value || '*';
      const country = document.getElementById('trade-rule-country')?.value || '*';
      const tariffRate = Math.max(0, Number(document.getElementById('trade-rule-tariff')?.value) || 0) / 100;
      setTradeRestriction(player, {
        direction, goods: good === '*' ? null : [good],
        counterparties: country === '*' ? null : [country], allowed: true, tariffRate,
      }, this.regions, this.clock.tickIndex);
      this.render(false);
    });
"""
s = replace_once(s, anchor, addition, 'advisor tariff action')
p.write_text(s)

# --- NPCs: same tariff lever, driven by actual imports and labour pressure ---
p = Path('js/ai/nationAi.js')
s = p.read_text()
s = replace_once(s,
    "import { activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';",
    "import { activeTariffs, activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';\nimport { TRADE_GOODS } from '../economy/tradeGoods.js?v=20260905-goods2';",
    'AI tariff imports')
s = replace_once(s,
    "    detail('trade embargo', () => maybeAdjustTradeEmbargo(region, regionsById, currentTick));\n",
    "    detail('trade embargo', () => maybeAdjustTradeEmbargo(region, regionsById, currentTick));\n    detail('labour tariff', () => maybeAdjustLabourTariff(region, regionsById, currentTick));\n",
    'AI tariff call')
insert_at = s.index('\nfunction maybeScout(', s.index('function maybeAdjustTradeEmbargo'))
fn = r'''
function maybeAdjustLabourTariff(region, regionsById, currentTick) {
  if (!Number.isFinite(currentTick)) return;
  const labour = region.labourRelations || {};
  const employment = region.employment || {};
  const trade = region.tradeEconomy || {};
  const grievance = clamp01(labour.grievance || 0);
  const unemployment = clamp01(employment.unemploymentRate || 0);
  const hardship = clamp01(employment.hardship || 0);
  const industrial = clamp01(region.structuralTransformation?.industrialShare || 0);
  const tariffBurden = clamp01(trade.importTariffBurdenEma || 0);
  const tariffs = activeTariffs(region).filter((rule) => rule.direction === 'import' || rule.direction === 'trade');

  // If duties themselves have become a major household/input burden, unwind the
  // highest one first. NPCs therefore face the same trade-off as the player.
  if ((tariffBurden > 0.14 || hardship > 0.55) && tariffs.length) {
    const highest = tariffs.slice().sort((a,b)=>(b.tariffRate||0)-(a.tariffRate||0))[0];
    const next = Math.max(0, (highest.tariffRate || 0) - 0.05);
    setTradeRestriction(region, { direction: highest.direction, goods: highest.goods, counterparties: highest.counterparties, allowed: true, tariffRate: next }, [...regionsById.values()], currentTick);
    return;
  }
  if (grievance < 0.28 || unemployment < 0.08 || industrial < 0.22 || tariffBurden > 0.10) return;

  const imports = Object.entries(trade.importSpendByResourceEma || {})
    .filter(([resource, value]) => value > 0.5 && ['manufactured','consumer_good','civilian_equipment'].includes(TRADE_GOODS[resource]?.category))
    .sort((a,b)=>b[1]-a[1]);
  if (!imports.length) return;
  const resource = imports[0][0];
  const existing = (region.tradePolicy?.rules || []).find((rule) => rule.direction === 'import' && rule.goods?.length === 1 && rule.goods[0] === resource && rule.counterparties === null);
  if (existing?.allowed === false) return;
  const desired = Math.min(0.30, 0.08 + unemployment * 0.55 + grievance * 0.20);
  if ((existing?.tariffRate || 0) >= desired - 0.01) return;
  setTradeRestriction(region, { direction: 'import', goods: [resource], counterparties: null, allowed: true, tariffRate: desired }, [...regionsById.values()], currentTick);
}
'''
s = s[:insert_at] + fn + s[insert_at:]
p.write_text(s)

print('Applied tariffs/labour v1 patches')
