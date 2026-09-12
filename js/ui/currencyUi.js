import { abandonCurrency, currencyAvailability, currencyStatus, debaseCurrency, foundCurrency, reformCurrency } from '../economy/currency.js?v=20260912-currency2';
import { knownForexQuotes, moneyChangerCapability } from '../economy/forex.js?v=20260912-forex1';

function fmt(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function playerState() {
  const world = window.__worldsim;
  if (!world) return null;
  const polity = world.polities?.find((item) => item.id === world.activePlayerPolityId);
  const capital = polity ? world.regions?.find((region) => region.id === polity.capitalRegionId) : null;
  return polity && capital ? { world, polity, capital } : null;
}

function currentTick(world) {
  return Math.floor((world.clock?.elapsedDays || 0) / 7);
}

function addText(host, text, className = 'save-status') {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  host.appendChild(p);
  return p;
}

function appendForex(host, capital) {
  const market = capital.currencyUse;
  if (!market?.active) return;
  const quotes = knownForexQuotes(capital);
  const capability = moneyChangerCapability(capital);
  addText(host, `Money changing capability ${(capability * 100).toFixed(0)}%. Quotes improve with coinage knowledge, customs houses, mints and active trade.`, 'save-status');
  if (!quotes.length) {
    addText(host, 'No foreign currency quotes yet. Merchants learn foreign coins through actual trade contact.', 'save-status');
    return;
  }
  for (const { currency, quote } of quotes) {
    addText(host,
      `1 ${market.name} → ${quote.rate.toFixed(2)} ${currency.name} · changer spread ${(quote.spread * 100).toFixed(1)}% · ${currency.name} trust ${(currency.trust * 100).toFixed(0)}%.`,
      'save-status');
  }
}

function render(host) {
  const state = playerState();
  host.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = 'Currency';
  host.appendChild(title);

  if (!state) {
    host.append('Choose a starting region first.');
    return;
  }
  const { world, polity, capital } = state;
  const status = currencyStatus(polity);

  if (!status.active) {
    const availability = currencyAvailability(polity, capital);
    addText(host, availability.available
      ? 'Your kingdom has enough legitimacy to found its own currency. Merchants can still use trusted foreign money instead.'
      : `No domestic currency. Merchants may barter or use foreign money they encounter through trade. ${availability.reason}`);
    const market = capital.currencyUse;
    if (market?.active) addText(host, `Capital markets currently use ${market.name} · trust ${(market.trust * 100).toFixed(0)}%.`, 'save-status');
    appendForex(host, capital);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Found currency';
    button.disabled = !availability.available;
    button.addEventListener('click', () => {
      foundCurrency(polity, capital, world.regions, currentTick(world));
      render(host);
    });
    host.appendChild(button);
    return;
  }

  addText(host, `${status.name} · issuer trust ${(status.trust * 100).toFixed(0)}% · fineness ${(status.fineness * 100).toFixed(0)}% · total seigniorage ${fmt(status.seigniorageRaised)}.`);

  const market = capital.currencyUse;
  if (!market?.active) {
    addText(host, 'Capital markets have fallen back to barter/commodity settlement.', 'save-status');
  } else if (market.id !== status.id) {
    addText(host, `Capital markets prefer foreign money: ${market.name} · trust ${(market.trust * 100).toFixed(0)}%. Your state still issues ${status.name}.`, 'save-status');
  } else {
    addText(host, 'Capital markets currently accept the domestic currency.', 'save-status');
  }
  appendForex(host, capital);

  const help = document.createElement('small');
  help.textContent = status.undisclosedDebasement > 0
    ? 'The latest debasement is still hidden. Once merchants discover it, trust can fall enough that markets switch to foreign money or barter. Foreign exchange quotes will also worsen as changers discount the coin.'
    : 'Currency trust belongs to this monetary regime, not permanently to the kingdom. Reform can replace a failed currency with a new generation if legitimacy and treasury capacity are sufficient.';
  host.appendChild(help);

  const actions = document.createElement('div');
  actions.className = 'save-actions';
  const light = document.createElement('button');
  light.type = 'button';
  light.textContent = 'Debase 10%';
  light.addEventListener('click', () => {
    debaseCurrency(polity, capital, world.regions, 0.1, currentTick(world));
    render(host);
  });
  const heavy = document.createElement('button');
  heavy.type = 'button';
  heavy.textContent = 'Debase 25%';
  heavy.addEventListener('click', () => {
    debaseCurrency(polity, capital, world.regions, 0.25, currentTick(world));
    render(host);
  });
  actions.append(light, heavy);
  host.appendChild(actions);

  const regimeActions = document.createElement('div');
  regimeActions.className = 'save-actions';
  const reform = document.createElement('button');
  reform.type = 'button';
  reform.textContent = 'Reform currency';
  reform.addEventListener('click', () => {
    const result = reformCurrency(polity, capital, world.regions, currentTick(world));
    if (!result.changed) reform.textContent = result.reason || 'Reform unavailable';
    render(host);
  });
  const abandon = document.createElement('button');
  abandon.type = 'button';
  abandon.textContent = 'Stop issuing';
  abandon.addEventListener('click', () => {
    abandonCurrency(polity, world.regions, currentTick(world));
    render(host);
  });
  regimeActions.append(reform, abandon);
  host.appendChild(regimeActions);

  if (status.history?.length) {
    const latest = status.history[status.history.length - 1];
    addText(host, `Previous regime: ${latest.name} ended at ${(latest.endingTrust * 100).toFixed(0)}% trust (${latest.reason}).`, 'save-status');
  }
}

function mount() {
  const menuCard = document.querySelector('#menu-modal .menu-card');
  if (!menuCard || document.getElementById('currency-menu-section')) return;
  const section = document.createElement('div');
  section.id = 'currency-menu-section';
  section.className = 'menu-section';
  menuCard.insertBefore(section, menuCard.querySelector('.menu-section:last-of-type'));
  render(section);
  document.getElementById('btn-menu')?.addEventListener('click', () => render(section));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 0));
else setTimeout(mount, 0);
