import { Clock } from './core/clock.js';
import { EventBus } from './core/eventBus.js';
import { loadWorld } from './world/region.js';
import { seedCensus, densityPerKm2 } from './society/census.js';
import { tickEconomy } from './economy/labor.js';
import { MapRenderer } from './ui/mapRenderer.js';

const START_YEAR = -1200; // Bronze Age start, mid-collapse-era — tune later

const LAYERS = {
  density: {
    valueFn: (r) => densityPerKm2(r),
    label: 'Population / km²',
    format: (v) => v.toFixed(1),
  },
  stability: {
    valueFn: (r) => r.stability,
    label: 'Stability',
    format: (v) => v.toFixed(2),
    colorLow: '#a4453a', // red: collapsing
    colorHigh: '#3a4a3e', // back to the neutral land tone: fine
  },
};

async function main() {
  const bus = new EventBus();
  const clock = new Clock();

  const regions = await loadWorld();
  seedCensus(regions);
  console.log(
    `Loaded ${regions.length} regions:`,
    regions.map((r) => `${r.name} (pop ${r.population.toLocaleString()})`).join(', ')
  );

  const canvas = document.getElementById('map-canvas');
  const map = new MapRenderer(canvas, regions, {
    onSelect: (region) => showRegionSheet(region),
  });

  let selectedRegion = null;
  const originalOnSelect = map.onSelect;
  map.onSelect = (region) => {
    selectedRegion = region;
    originalOnSelect(region);
  };

  wireLayerToggle(map);
  map.setLayer(LAYERS.density);
  showLegend(map);

  wireHud(clock);
  clock.onTick(() => {
    tickEconomy(regions);
    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
    map.draw();
    if (selectedRegion) showRegionSheet(selectedRegion); // keep the open sheet live
  });
  document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);

  clock.start();

  // Expose for console poking during development.
  window.__worldsim = { bus, clock, regions, map };
}

function wireLayerToggle(map) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      map.setLayer(LAYERS[btn.dataset.layer]);
      showLegend(map);
      document.querySelectorAll('.layer-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function wireHud(clock) {
  const pauseBtn = document.getElementById('btn-pause');
  pauseBtn.addEventListener('click', () => {
    clock.togglePause();
    pauseBtn.textContent = clock.speed === 0 ? '►' : 'II';
  });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed);
      clock.setSpeed(speed);
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      pauseBtn.textContent = 'II';
    });
  });
}

function showLegend(map) {
  const info = map.getLegendInfo();
  if (!info) return;
  document.getElementById('legend-label').textContent = info.label;
  document.getElementById('legend-min').textContent = info.min;
  document.getElementById('legend-max').textContent = info.max;
  document.getElementById('legend').classList.remove('hidden');
}

function showRegionSheet(region) {
  const sheet = document.getElementById('region-sheet');
  document.getElementById('region-name').textContent = region.name;

  const density = densityPerKm2(region).toFixed(1);
  const culture = region.cultureGroups[0]; // monoculture at game start
  const occ = region.occupations;
  const occLine = occ.farmer === undefined
    ? 'not yet ticked'
    : `farmers ${occ.farmer.toLocaleString()} &middot; lumberjacks ${occ.lumberjack} &middot; miners ${occ.miner} &middot; smiths ${occ.smith} &middot; general ${occ.general.toLocaleString()}`;

  const stock = region.stockpile;
  const stockLine = Object.keys(stock).length
    ? Object.entries(stock)
        .filter(([, v]) => v > 0.05)
        .map(([k, v]) => `${k} ${v.toFixed(k === 'bronze' ? 1 : 0)}`)
        .join(' &middot; ') || 'none yet'
    : 'none yet';

  document.getElementById('region-details').innerHTML = `
    <div>Population: ${region.population.toLocaleString()} (${density}/km&sup2;)</div>
    <div>Stability: ${(region.stability * 100).toFixed(0)}%</div>
    <div>Working as: ${occLine}</div>
    <div>Stockpile: ${stockLine}</div>
    <div>Culture: ${culture.cultureId} &middot; identity strength ${(culture.identityStrength * 100).toFixed(0)}%</div>
    <div>Neighbours: ${region.neighbors.length ? region.neighbors.join(', ') : 'none by land'}</div>
    <div>Controlled by: ${region.controllingActorId}</div>
  `;
  sheet.classList.remove('hidden');
}

main().catch((err) => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<pre style="color:#e8e1cf;padding:20px;">Failed to load: ${err.message}\n\nIf you opened this file directly (file://), that's why — fetch() of local JSON needs a real server. Run: python3 -m http.server, then open localhost.</pre>`;
});
