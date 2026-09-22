// Lightweight startup picker. Scenario selection happens before world loading.
import { SCENARIOS, currentScenario, fetchScenarioAssetDirect, scenarioAssetUrl, selectScenario } from '../core/scenarios.js?v=20260922-picker-deadlock1';

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

function scenarioDetail(scenario) {
  const timing = `${scenario.targetRealHours}h target · ${scenario.targetSimYears.toLocaleString()} simulated years`;
  return `${scenario.subtitle} · ${timing}`;
}

async function loadMapEntries(scenario) {
  const [metaResponse, navResponse] = await Promise.all([
    fetchScenarioAssetDirect('regions.meta.json?v=20260922-picker-direct1', scenario, { cache: 'no-store' }),
    fetchScenarioAssetDirect('region-navigation.json?v=20260922-picker-direct1', scenario, { cache: 'no-store' }),
  ]);
  if (!metaResponse.ok) throw new Error(`region metadata HTTP ${metaResponse.status}`);
  if (!navResponse.ok) throw new Error(`navigation metadata HTTP ${navResponse.status}`);
  const metadata = await metaResponse.json();
  const navigation = await navResponse.json();
  const regions = [...(metadata.regions || [])].sort((a, b) => alphabetical(a.name, b.name));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const entries = [];
  for (const region of regions) {
    for (const membership of navigation.regions?.[region.id] || []) entries.push({ region, ...membership });
  }
  return { regions, regionById, entries };
}

async function installEarlyPicker() {
  const pickerModal = document.getElementById('picker-modal');
  const pickerList = document.getElementById('picker-list');
  const pickerTitle = document.getElementById('picker-title');
  const pickerHelp = document.getElementById('picker-help');
  if (!pickerModal || !pickerList || !pickerTitle || !pickerHelp) return;

  const resetList = (...nodes) => {
    pickerList.replaceChildren(...nodes);
    pickerList.scrollTop = 0;
  };

  const markPendingStart = (scenario, region, continent, country, countryFirst = false) => {
    // Keep the lightweight picker responsive. Only release the full world loader once
    // the player has actually chosen a starting region/country.
    selectScenario(scenario.id);
    window.__pendingStartRegionId = region.id;
    window.__pendingStartRegionName = region.name;
    window.__pendingStartNavigation = { continent, country };
    window.__pendingStartCountryName = countryFirst ? country : null;
    pickerList.replaceChildren();
    pickerTitle.textContent = countryFirst ? country : region.name;
    pickerHelp.textContent = `${scenario.name} · finishing world setup in the background.`;
    const status = document.createElement('div');
    status.className = 'startup-picker-status';
    const startedAt = performance.now();
    const reportWorldStartup = (message) => {
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      status.textContent = `${elapsed}s · ${message}`;
      pickerHelp.textContent = `${scenario.name} · ${message}`;
      console.info('[world-startup]', message);
    };
    window.__reportWorldStartup = reportWorldStartup;
    window.addEventListener('error', (event) => reportWorldStartup(`Startup error: ${event.message || 'unknown error'}`), { once: true });
    window.addEventListener('unhandledrejection', (event) => reportWorldStartup(`Startup rejection: ${event.reason?.message || event.reason || 'unknown rejection'}`), { once: true });
    reportWorldStartup(countryFirst
      ? `Loading world… ${country} is selected. Preparing ${region.name}.`
      : `Loading world… ${region.name} is selected.`);
    pickerList.appendChild(status);
  };

  const renderFocusedCountryPicker = async (scenario) => {
    pickerTitle.textContent = 'Choose your country';
    pickerHelp.textContent = `${scenario.name} · every mapped sovereign country is playable.`;
    pickerList.innerHTML = '<div class="startup-picker-status">Preparing countries…</div>';
    try {
      const { entries } = await loadMapEntries(scenario);
      if (window.__worldsim) return;
      const groups = new Map();
      for (const entry of entries) {
        if (!entry.country) continue;
        const key = `${entry.continent || 'Other'}\u0000${entry.country}`;
        if (!groups.has(key)) groups.set(key, { continent: entry.continent || 'Other', country: entry.country, regions: [] });
        if (!groups.get(key).regions.some((region) => region.id === entry.region.id)) groups.get(key).regions.push(entry.region);
      }
      const countries = [...groups.values()].sort((a, b) => alphabetical(a.country, b.country));
      resetList(...countries.map((group) => {
        const startRegion = [...group.regions].sort((a, b) => alphabetical(a.name, b.name))[0];
        return makeButton('picker-group startup-country-option', group.country, group.continent, () =>
          markPendingStart(scenario, startRegion, group.continent, group.country, true));
      }));
    } catch (error) {
      console.error('Could not prepare focused country picker', error);
      pickerHelp.textContent = 'The scenario map could not be loaded.';
      pickerList.innerHTML = `<div class="startup-picker-status">${error.message}</div>`;
    }
  };

  const renderRegionPicker = async (scenario) => {
    pickerTitle.textContent = 'Choose your region';
    pickerHelp.textContent = `${scenario.name} · loading region names…`;
    pickerList.innerHTML = '<div class="startup-picker-status">Preparing region list…</div>';

    let entries;
    let regionById;
    try {
      ({ entries, regionById } = await loadMapEntries(scenario));
    } catch (error) {
      console.error('Could not prepare early country picker', error);
      pickerHelp.textContent = 'The scenario map could not be loaded.';
      pickerList.innerHTML = `<div class="startup-picker-status">${error.message}</div>`;
      return;
    }

    if (window.__worldsim) return;

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
        const button = makeButton('picker-option startup-picker-option', region.name, 'Simulation region', () =>
          markPendingStart(scenario, region, continent, country));
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
      pickerHelp.textContent = `${scenario.name} · choose a continent.`;
      const continents = [...new Set(entries.map((entry) => entry.continent))].sort(alphabetical);
      resetList(...continents.map((continent) => {
        const continentEntries = entries.filter((entry) => entry.continent === continent);
        const countryCount = new Set(continentEntries.map((entry) => entry.country)).size;
        return makeButton('picker-group', continent, `${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`, () => renderCountries(continent));
      }));
    };

    for (let i = entries.length - 1; i >= 0; i--) if (!regionById.has(entries[i].region.id)) entries.splice(i, 1);
    renderContinents();
  };

  const chooseScenario = (scenario) => {
    try {
      // Do not lock/release the scenario yet: main.js holds heavy map fetches until
      // the player chooses a start. The picker can read its small metadata directly.
      if (scenario.rulesProfile === 'modern-crisis') renderFocusedCountryPicker(scenario);
      else renderRegionPicker(scenario);
    } catch (error) {
      pickerHelp.textContent = error.message;
    }
  };

  pickerTitle.textContent = 'Choose a scenario';
  pickerHelp.textContent = 'Each scenario can use its own map, starting world state, technology emphasis, timescale and victory rules.';
  const scenarioNodes = SCENARIOS.map((scenario) => {
    const button = makeButton('picker-group scenario-option', scenario.name, scenarioDetail(scenario), () => chooseScenario(scenario));
    const description = document.createElement('span');
    description.className = 'scenario-description';
    description.textContent = scenario.description;
    button.appendChild(description);
    if (!scenario.available) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      const status = document.createElement('span');
      status.className = 'scenario-status';
      status.textContent = `Coming later · ${scenario.status}`;
      button.appendChild(status);
    }
    return button;
  });
  resetList(...scenarioNodes);
}

if (typeof window !== 'undefined') {
  installEarlyPicker();

  let attempts = 0;
  const poll = () => {
    attempts += 1;
    if (window.__worldsim) {
      installRuntimeCompatibilityPatches();
      const pending = window.__pendingStartRegionId;
      const scenario = currentScenario();
      if (pending && scenario?.id !== 'grand-campaign') {
        const runtime = window.__worldsimScenarioRuntime;
        if (runtime?.error) {
          const help = document.getElementById('picker-help');
          if (help) help.textContent = `Scenario setup failed: ${runtime.error}`;
          return;
        }
        if (!runtime?.attached) {
          if (attempts < 1200) setTimeout(poll, 100);
          return;
        }
      }
      if (pending && handOffPendingRegion(pending)) {
        delete window.__pendingStartRegionId;
        delete window.__pendingStartRegionName;
        delete window.__pendingStartNavigation;
        delete window.__pendingStartCountryName;
        return;
      }
      if (!pending) return;
    }
    if (attempts < 1200) setTimeout(poll, 100);
  };
  setTimeout(poll, 50);
}
