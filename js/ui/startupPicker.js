// Lightweight startup experience. The full world currently has to initialise
// geography, resources, populations, politics, religion, knowledge and map
// rendering before main.js can start the game. Region choice should not wait
// for all of that work: regions.meta.json is enough to let the player start
// browsing names while the real world initialises in parallel.

const PICKER_META_URL = 'data/world/regions.meta.json?v=20260907-startup1';
const CLOCK_MS_PER_TICK_AT_1X = 2200;

function byName(a, b) {
  return new Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare(a.name, b.name);
}

function navigationForRegion(region) {
  const sourceGroup = region.feature?.properties?.sourceGroup;
  const name = region.name;

  if (sourceGroup === 'ESP' && (name === 'Ceuta' || name === 'Melilla')) {
    return { continent: 'Africa', country: 'Spain' };
  }

  const groups = {
    'GBR-ENG': { continent: 'Europe', country: 'England' },
    'GBR-WLS': { continent: 'Europe', country: 'Wales' },
    'GBR-SCT': { continent: 'Europe', country: 'Scotland' },
    'FRA': { continent: 'Europe', country: 'France' },
    'ESP': { continent: 'Europe', country: 'Spain' },
    'PRT': { continent: 'Europe', country: 'Portugal' },
    'IRL': { continent: 'Europe', country: 'Ireland' },
    'GIB': { continent: 'Europe', country: 'Gibraltar' },
    'AND': { continent: 'Europe', country: 'Andorra' },
    'IMN': { continent: 'Europe', country: 'Isle of Man' },
    'JEY': { continent: 'Europe', country: 'Jersey' },
    'GGY': { continent: 'Europe', country: 'Guernsey' },
    'ITA': { continent: 'Europe', country: 'Italy' },
    'GRC': { continent: 'Europe', country: 'Greece' },
    'ALB': { continent: 'Europe', country: 'Albania' },
    'MKD': { continent: 'Europe', country: 'Macedonia' },
    'BGR': { continent: 'Europe', country: 'Bulgaria' },
    'SRB': { continent: 'Europe', country: 'Serbia' },
    'MNE': { continent: 'Europe', country: 'Montenegro' },
    'BIH': { continent: 'Europe', country: 'Bosnia & Herzegovina' },
    'HRV': { continent: 'Europe', country: 'Croatia' },
    'TUR': { continent: 'Asia', country: 'Anatolia' },
    'CYP': { continent: 'Asia', country: 'Cyprus' },
    'SYR': { continent: 'Asia', country: 'Syria' },
    'LBN': { continent: 'Asia', country: 'Levant' },
    'ISR': { continent: 'Asia', country: 'Southern Levant' },
    'PSE': { continent: 'Asia', country: 'Southern Levant' },
    'JOR': { continent: 'Asia', country: 'Transjordan' },
    'IRQ': { continent: 'Asia', country: 'Mesopotamia' },
    'IRN': { continent: 'Asia', country: 'Western Iran' },
    'EGY': { continent: 'Africa', country: 'Egypt' },
    'LBY': { continent: 'Africa', country: 'Libya' },
    'TUN': { continent: 'Africa', country: 'Tunisia' },
  };
  return groups[sourceGroup] || { continent: 'Other', country: sourceGroup || 'Other' };
}

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

  const { continent, country } = navigationForRegion(region);
  const continentButton = buttonByStrongText(picker, continent);
  if (!continentButton) return false;
  continentButton.click();
  const countryButton = buttonByStrongText(picker, country);
  if (!countryButton) return false;
  countryButton.click();
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
  try {
    const response = await fetch(PICKER_META_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const metadata = await response.json();
    regions = [...(metadata.regions || [])].sort(byName);
  } catch (error) {
    pickerHelp.textContent = 'The world is loading. Region choices will appear shortly.';
    return;
  }

  if (window.__worldsim) return;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'startup-region-search';
  search.placeholder = `Search ${regions.length.toLocaleString()} regions`;
  search.autocomplete = 'off';
  search.spellcheck = false;
  Object.assign(search.style, {
    boxSizing: 'border-box', width: '100%', padding: '10px 12px', marginBottom: '8px',
    borderRadius: '7px', border: '1px solid #7a5a34', background: '#171d29', color: '#eee3cc',
    fontSize: '16px',
  });

  const results = document.createElement('div');
  results.className = 'startup-region-results';
  const status = document.createElement('div');
  status.className = 'startup-picker-status';
  Object.assign(status.style, { margin: '5px 0 10px', color: '#a8a08c', fontSize: '12px' });

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = query
      ? regions.filter((region) => region.name.toLocaleLowerCase().includes(query)).slice(0, 80)
      : regions.slice(0, 80);

    results.replaceChildren(...matches.map((region) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'picker-option startup-picker-option';
      button.dataset.id = region.id;
      button.innerHTML = `<strong>${region.name}</strong><span>Choose while the world finishes loading</span>`;
      button.addEventListener('click', () => {
        window.__pendingStartRegionId = region.id;
        window.__pendingStartRegionName = region.name;
        search.disabled = true;
        results.replaceChildren();
        status.textContent = `Loading world… ${region.name} is selected and will start automatically when ready.`;
        pickerTitle.textContent = region.name;
        pickerHelp.textContent = 'Finishing world setup in the background.';
      });
      return button;
    }));

    status.textContent = query
      ? `${matches.length}${matches.length === 80 ? '+' : ''} matching regions`
      : `Showing the first ${matches.length}. Type a name to search all ${regions.length.toLocaleString()} regions.`;
  };

  search.addEventListener('input', render);
  pickerList.replaceChildren(search, status, results);
  pickerHelp.textContent = 'Pick now; the rest of the world will keep loading while you choose.';
  render();
  search.focus({ preventScroll: true });
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
        return;
      }
      if (!pending) return;
    }
    if (attempts < 1200) setTimeout(poll, 100);
  };
  setTimeout(poll, 50);
}
