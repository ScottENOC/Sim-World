// Lightweight startup picker. Modern countries are navigation metadata only;
// simulation regions remain geography-first and can appear under more than one
// country when a modern border crosses them.

const PICKER_META_URL = 'data/world/regions.meta.json?v=20260913-country-picker1';
const PICKER_NAV_URL = 'data/world/region-navigation.json?v=20260913-country-picker1';
const CLOCK_MS_PER_TICK_AT_1X = 2200;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const alphabetical = (a, b) => collator.compare(a, b);

function buttonByStrongText(host, text) {
  return [...host.querySelectorAll('button')].find((button) =>
    button.querySelector('strong')?.textContent?.trim() === text);
}

function handOffPendingRegion(regionId) {
  const sim = window.__worldsim;
  const picker = document.getElementById('picker-list');
  if (!sim?.regions || !picker) return false;
  const region = sim.regions.find((candidate) => candidate.id === regionId);
  if (!region) return false;

  const preferred = window.__pendingStartNavigation || null;
  if (preferred) {
    const continentButton = buttonByStrongText(picker, preferred.continent);
    if (!continentButton) return false;
    continentButton.click();
    const countryButton = buttonByStrongText(picker, preferred.country);
    if (!countryButton) return false;
    countryButton.click();
  }

  const regionButton = picker.querySelector(`button[data-id="${CSS.escape(regionId)}"]`);
  if (!regionButton) return false;
  regionButton.click();
  return true;
}

function installRuntimeCompatibilityPatches() {
  const sim = window.__worldsim;
  if (!sim) return false;

  if (sim.clock && !sim.clock._startupCadencePatched) {
    sim.clock._startupCadencePatched = true;
    sim.clock._targetIntervalMs = (speed = sim.clock.speed) => CLOCK_MS_PER_TICK_AT_1X / speed;
  }

  if (sim.map && !sim.map._progressiveDetailInstalled && !window.__lateProgressiveImportStarted) {
    window.__lateProgressiveImportStarted = true;
    import('./progressiveVisuals.js?v=20260907-progressive3').catch((error) => {
      console.error('Could not install progressive map detail', error);
      window.__lateProgressiveImportStarted = false;
    });
  }

  if (sim.map && !sim.map._stableOverlayScalesInstalled && !window.__stableOverlayImportStarted) {
    window.__stableOverlayImportStarted = true;
    import('./mapOverlayStability.js?v=20260907-overlay2').catch((error) => {
      console.error('Could not install stable map overlays', error);
      window.__stableOverlayImportStarted = false;
    });
  }
  return true;
}

function makeButton(className, label, detail, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = detail
    ? `<strong>${label}</strong><span class="picker-count">${detail}</span>`
    : `<strong>${label}</strong>`;
  button.addEventListener('click', onClick);
  return button;
}

function makeBackButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'picker-back';
  button.textContent = `← ${label}`;
  button.addEventListener('click', onClick);
  return button;
}

async function installEarlyPicker() {
  const pickerModal = document.getElementById('picker-modal');
  const pickerList = document.getElementById('picker-list');
  const pickerTitle = document.getElementById('picker-title');
  const pickerHelp = document.getElementById('picker-help');
  if (!pickerModal || !pickerList || !pickerTitle || !pickerHelp) return;

  pickerTitle.textContent = 'Choose your region';
  pickerHelp.textContent = 'Loading region names…';
  pickerList.innerHTML = '<div class="startup-picker-status">Preparing region list…</div>';

  let regions;
  let navigation;
  try {
    const [metaResponse, navResponse] = await Promise.all([fetch(PICKER_META_URL), fetch(PICKER_NAV_URL)]);
    if (!metaResponse.ok) throw new Error(`region metadata HTTP ${metaResponse.status}`);
    if (!navResponse.ok) throw new Error(`navigation metadata HTTP ${navResponse.status}`);
    const metadata = await metaResponse.json();
    navigation = await navResponse.json();
    regions = [...(metadata.regions || [])].sort((a, b) => alphabetical(a.name, b.name));
  } catch (error) {
    console.error('Could not prepare early country picker', error);
    pickerHelp.textContent = 'The world is loading. Region choices will appear shortly.';
    return;
  }

  if (window.__worldsim) return;

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const entries = [];
  for (const region of regions) {
    const memberships = navigation.regions?.[region.id] || [];
    for (const membership of memberships) entries.push({ region, ...membership });
  }

  const resetList = (...nodes) => {
    pickerList.replaceChildren(...nodes);
    pickerList.scrollTop = 0;
  };

  const selectRegion = (region, continent, country) => {
    window.__pendingStartRegionId = region.id;
    window.__pendingStartRegionName = region.name;
    window.__pendingStartNavigation = { continent, country };
    pickerList.replaceChildren();
    pickerTitle.textContent = region.name;
    pickerHelp.textContent = 'Finishing world setup in the background.';
    const status = document.createElement('div');
    status.className = 'startup-picker-status';
    status.textContent = `Loading world… ${region.name} is selected and will start automatically when ready.`;
    pickerList.appendChild(status);
  };

  const renderRegions = (continent, country) => {
    pickerTitle.textContent = country;
    pickerHelp.textContent = `${continent} · choose the simulation region you will govern.`;
    const matches = entries
      .filter((entry) => entry.continent === continent && entry.country === country)
      .map((entry) => entry.region)
      .filter((region, index, array) => array.findIndex((other) => other.id === region.id) === index)
      .sort((a, b) => alphabetical(a.name, b.name));
    const nodes = [makeBackButton(continent, () => renderCountries(continent))];
    for (const region of matches) {
      const button = makeButton('picker-option startup-picker-option', region.name, 'Simulation region', () => selectRegion(region, continent, country));
      button.dataset.id = region.id;
      nodes.push(button);
    }
    resetList(...nodes);
  };

  const renderCountries = (continent) => {
    pickerTitle.textContent = continent;
    pickerHelp.textContent = 'Choose a modern country or territory to find a region.';
    const countries = [...new Set(entries.filter((entry) => entry.continent === continent).map((entry) => entry.country))].sort(alphabetical);
    const nodes = [makeBackButton('Continents', renderContinents)];
    for (const country of countries) {
      const count = new Set(entries.filter((entry) => entry.continent === continent && entry.country === country).map((entry) => entry.region.id)).size;
      nodes.push(makeButton('picker-group', country, `${count} ${count === 1 ? 'region' : 'regions'}`, () => renderRegions(continent, country)));
    }
    resetList(...nodes);
  };

  const renderContinents = () => {
    pickerTitle.textContent = 'Choose where to begin';
    pickerHelp.textContent = 'Choose a continent.';
    const continents = [...new Set(entries.map((entry) => entry.continent))].sort(alphabetical);
    resetList(...continents.map((continent) => {
      const continentEntries = entries.filter((entry) => entry.continent === continent);
      const countryCount = new Set(continentEntries.map((entry) => entry.country)).size;
      return makeButton('picker-group', continent, `${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`, () => renderCountries(continent));
    }));
  };

  // Drop any orphaned navigation IDs rather than presenting a broken choice.
  for (let i = entries.length - 1; i >= 0; i--) if (!regionById.has(entries[i].region.id)) entries.splice(i, 1);
  renderContinents();
}

if (typeof window !== 'undefined') {
  installEarlyPicker();

  let attempts = 0;
  const poll = () => {
    attempts += 1;
    if (window.__worldsim) {
      installRuntimeCompatibilityPatches();
      const pending = window.__pendingStartRegionId;
      if (pending && handOffPendingRegion(pending)) {
        delete window.__pendingStartRegionId;
        delete window.__pendingStartRegionName;
        delete window.__pendingStartNavigation;
        return;
      }
      if (!pending) return;
    }
    if (attempts < 1200) setTimeout(poll, 100);
  };
  setTimeout(poll, 50);
}
