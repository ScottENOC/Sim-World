import { Clock } from './core/clock.js';
import { EventBus } from './core/eventBus.js';
import { loadWorld } from './world/region.js';
import { MapRenderer } from './ui/mapRenderer.js';

const START_YEAR = -1200; // Bronze Age start, mid-collapse-era — tune later

async function main() {
  const bus = new EventBus();
  const clock = new Clock();

  const regions = await loadWorld();
  console.log(`Loaded ${regions.length} regions:`, regions.map((r) => r.name).join(', '));

  const canvas = document.getElementById('map-canvas');
  const map = new MapRenderer(canvas, regions, {
    onSelect: (region) => showRegionSheet(region),
  });

  wireHud(clock);
  clock.onTick(() => {
    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
  });
  document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);

  clock.start();

  // Expose for console poking during development.
  window.__worldsim = { bus, clock, regions, map };
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

function showRegionSheet(region) {
  const sheet = document.getElementById('region-sheet');
  document.getElementById('region-name').textContent = region.name;
  document.getElementById('region-details').innerHTML = `
    <div>Area: ${Math.round(region.areaSqKm).toLocaleString()} km&sup2;</div>
    <div>Neighbours: ${region.neighbors.length ? region.neighbors.join(', ') : 'none by land'}</div>
    <div>Controlled by: ${region.controllingActorId}</div>
  `;
  sheet.classList.remove('hidden');
}

main().catch((err) => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<pre style="color:#e8e1cf;padding:20px;">Failed to load: ${err.message}\n\nIf you opened this file directly (file://), that's why — fetch() of local JSON needs a real server. Run: python3 -m http.server, then open localhost.</pre>`;
});
