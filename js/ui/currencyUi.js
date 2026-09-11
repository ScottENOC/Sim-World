import { currencyAvailability, currencyStatus, debaseCurrency, foundCurrency } from '../economy/currency.js?v=20260912-currency1';

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
  const description = document.createElement('p');
  description.className = 'save-status';

  if (!status.active) {
    const availability = currencyAvailability(polity, capital);
    description.textContent = availability.available
      ? `Your kingdom has enough legitimacy to found a currency. A trusted coin improves tax collection and trade settlement, but creates a reputation you can later damage.`
      : `Currency not yet available. ${availability.reason}`;
    host.appendChild(description);
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

  description.textContent = `${status.name} · trust ${(status.trust * 100).toFixed(0)}% · fineness ${(status.fineness * 100).toFixed(0)}% · total seigniorage ${fmt(status.seigniorageRaised)}.`;
  host.appendChild(description);

  const help = document.createElement('small');
  help.textContent = status.undisclosedDebasement > 0
    ? `The latest debasement has not yet become widely known. Merchants and administrators may discover it as scrutiny accumulates.`
    : `Debasement creates immediate treasury revenue by issuing more nominal money from the same metal. If discovered, trust falls and the tax/trade advantage can reverse.`;
  host.appendChild(help);

  const actions = document.createElement('div');
  actions.className = 'save-actions';
  const light = document.createElement('button');
  light.type = 'button';
  light.textContent = 'Debase 10%';
  light.addEventListener('click', () => {
    const result = debaseCurrency(polity, capital, world.regions, 0.1, currentTick(world));
    if (result.changed) light.textContent = `Raised ${fmt(result.windfall)}`;
    render(host);
  });
  const heavy = document.createElement('button');
  heavy.type = 'button';
  heavy.textContent = 'Debase 25%';
  heavy.addEventListener('click', () => {
    const result = debaseCurrency(polity, capital, world.regions, 0.25, currentTick(world));
    if (result.changed) heavy.textContent = `Raised ${fmt(result.windfall)}`;
    render(host);
  });
  actions.append(light, heavy);
  host.appendChild(actions);
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
