// Progressive map detail controller.
//
// The strategic map should stay visually quiet. Rich landscape/city/human detail
// appears only when the selected region occupies a substantial part of the
// viewport. This keeps the experience readable and avoids paying the rendering
// cost for dozens of tiny regions at once.

const LANDSCAPE_SHARE = 0.35;
const CITY_SHARE = 1.4;
const HUMAN_SHARE = 5.0;
const MAX_ZOOM = 128;
const TRADE_FRAME_MS = 66; // ~15 fps is plenty for tiny caravans/ships on mobile.

function projectedBounds(map, region) {
  map._progressiveBoundsCache ||= new Map();
  let bounds = map._progressiveBoundsCache.get(region.id);
  if (!bounds) {
    bounds = d3.geoPath(map.projection).bounds(region.feature);
    map._progressiveBoundsCache.set(region.id, bounds);
  }
  return bounds;
}

function regionScreenShare(map, region) {
  const bounds = projectedBounds(map, region);
  if (!bounds) return 0;
  const width = Math.max(0, bounds[1][0] - bounds[0][0]) * map.transform.k;
  const height = Math.max(0, bounds[1][1] - bounds[0][1]) * map.transform.k;
  return Math.max(width / Math.max(1, map.width), height / Math.max(1, map.height));
}

function detailStage(map, region) {
  if (region.id !== map.selectedId) return 'strategic';
  const share = regionScreenShare(map, region);
  if (share >= HUMAN_SHARE) return 'human';
  if (share >= CITY_SHARE) return 'city';
  if (share >= LANDSCAPE_SHARE) return 'landscape';
  return 'strategic';
}

function drawHouse(ctx, x, y, size) {
  ctx.fillRect(x - size, y - size * 0.3, size * 2, size * 1.3);
  ctx.beginPath();
  ctx.moveTo(x - size * 1.15, y - size * 0.3);
  ctx.lineTo(x, y - size * 1.25);
  ctx.lineTo(x + size * 1.15, y - size * 0.3);
  ctx.closePath();
  ctx.fill();
}

function drawPerson(ctx, x, y, u, role = 'civilian') {
  const r = 1.5 * u;
  ctx.fillStyle = role === 'soldier' ? '#c94f43' : role === 'priest' ? '#d6c7a6' : '#b99d78';
  ctx.beginPath();
  ctx.arc(x, y - 3.2 * u, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.moveTo(x, y - 1.6 * u);
  ctx.lineTo(x, y + 3.2 * u);
  ctx.moveTo(x - 2.3 * u, y + 0.3 * u);
  ctx.lineTo(x + 2.3 * u, y + 0.3 * u);
  ctx.stroke();
}

function drawProgressiveRegion(region) {
  const map = this;
  const stage = detailStage(map, region);
  if (stage === 'strategic' || !map._regionOnScreen(region, 240)) return;

  const ctx = map.ctx;
  const profile = map._profile(region);
  const centre = map.projection(region.centroid);
  const bounds = projectedBounds(map, region);
  if (!centre || !bounds) return;

  const k = map.transform.k;
  const u = 1 / k; // dimensions below are expressed mostly in screen pixels.
  const rand = (() => {
    let state = 2166136261;
    for (const ch of String(`${region.id}:progressive`)) {
      state ^= ch.charCodeAt(0);
      state = Math.imul(state, 16777619);
    }
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const bw = Math.max(10 * u, bounds[1][0] - bounds[0][0]);
  const bh = Math.max(10 * u, bounds[1][1] - bounds[0][1]);
  const landscapeRadiusX = bw * 0.32;
  const landscapeRadiusY = bh * 0.32;
  const urbanPopulation = profile.population * profile.urbanFraction;

  ctx.save();
  map._clipRegion(region);

  // LANDSCAPE SCALE ---------------------------------------------------------
  // Farms, forests, mines and dispersed settlement appear only once the
  // selected region is large enough to inspect as a place rather than an icon.
  const farmMarks = Math.min(16, Math.max(0, Math.round(Math.sqrt(
    Math.max(0, profile.population * profile.agricultureShare)) * 0.045)));
  ctx.strokeStyle = '#8a7848';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2 * u;
  for (let i = 0; i < farmMarks; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 0.35 + rand() * 0.65;
    const x = centre[0] + Math.cos(angle) * landscapeRadiusX * dist;
    const y = centre[1] + Math.sin(angle) * landscapeRadiusY * dist;
    const s = (5 + rand() * 5) * u;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s, y + s * 0.18);
    ctx.stroke();
  }

  const trees = Math.round(14 * profile.forestFraction);
  ctx.fillStyle = '#20382b';
  ctx.globalAlpha = 0.88;
  for (let i = 0; i < trees; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 0.45 + rand() * 0.55;
    const x = centre[0] + Math.cos(angle) * landscapeRadiusX * dist;
    const y = centre[1] + Math.sin(angle) * landscapeRadiusY * dist;
    const s = (3.5 + rand() * 2) * u;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.8);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.closePath();
    ctx.fill();
  }

  if (profile.infrastructure.road > 0) {
    ctx.strokeStyle = '#9c835e';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.4 * u;
    for (let i = 0; i < 3; i++) {
      const angle = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centre[0], centre[1]);
      ctx.lineTo(
        centre[0] + Math.cos(angle) * landscapeRadiusX,
        centre[1] + Math.sin(angle) * landscapeRadiusY
      );
      ctx.stroke();
    }
  }

  const ruralPopulation = profile.population * Math.max(0, 1 - profile.urbanFraction);
  const hamlets = Math.min(8, Math.max(ruralPopulation > 500 ? 1 : 0,
    Math.round(Math.sqrt(Math.max(0, ruralPopulation * profile.agricultureShare)) * 0.035)));
  ctx.fillStyle = '#715b42';
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < hamlets; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 0.35 + rand() * 0.6;
    drawHouse(ctx,
      centre[0] + Math.cos(angle) * landscapeRadiusX * dist,
      centre[1] + Math.sin(angle) * landscapeRadiusY * dist,
      (2.5 + rand() * 1.5) * u);
  }

  const mineMarks = Math.min(3, profile.productiveDeposits.length,
    Math.max(0, Math.round(profile.extractiveShare * 8)));
  ctx.fillStyle = '#80746b';
  ctx.strokeStyle = '#c4b8a7';
  for (let i = 0; i < mineMarks; i++) {
    const angle = rand() * Math.PI * 2;
    const x = centre[0] + Math.cos(angle) * landscapeRadiusX * 0.85;
    const y = centre[1] + Math.sin(angle) * landscapeRadiusY * 0.85;
    const s = 5 * u;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6 * u, y - 4 * u);
    ctx.lineTo(x + 6 * u, y + 4 * u);
    ctx.stroke();
  }

  // At landscape scale a city is a place, not yet a pile of tiny buildings.
  if (urbanPopulation > 120) {
    const cityPx = stage === 'landscape' ? 14 : stage === 'city' ? 90 : 210;
    const cityRadius = cityPx * u;
    ctx.fillStyle = '#d1b987';
    ctx.strokeStyle = '#715b42';
    ctx.globalAlpha = 0.96;

    if (stage === 'landscape') {
      ctx.beginPath();
      ctx.arc(centre[0], centre[1], cityRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // CITY SCALE ----------------------------------------------------------
      // Resolve the settlement marker into streets and buildings only when the
      // wider region is already larger than the screen.
      const blocks = Math.min(30, Math.max(8, Math.round(Math.sqrt(urbanPopulation) / 24)));
      ctx.lineWidth = 1 * u;

      ctx.strokeStyle = '#8f7658';
      ctx.globalAlpha = 0.65;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(centre[0] - cityRadius, centre[1] + i * cityRadius * 0.22);
        ctx.lineTo(centre[0] + cityRadius, centre[1] + i * cityRadius * 0.22);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centre[0] + i * cityRadius * 0.22, centre[1] - cityRadius);
        ctx.lineTo(centre[0] + i * cityRadius * 0.22, centre[1] + cityRadius);
        ctx.stroke();
      }

      ctx.fillStyle = '#d1b987';
      ctx.strokeStyle = '#715b42';
      ctx.globalAlpha = 0.95;
      for (let i = 0; i < blocks; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * cityRadius * 0.8;
        const s = (4 + rand() * 4) * u;
        const x = centre[0] + Math.cos(angle) * dist;
        const y = centre[1] + Math.sin(angle) * dist;
        ctx.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4);
        ctx.strokeRect(x - s, y - s * 0.7, s * 2, s * 1.4);
      }

      if (profile.infrastructure.walls > 0) {
        ctx.beginPath();
        ctx.arc(centre[0], centre[1], cityRadius * 0.93, 0, Math.PI * 2);
        ctx.strokeStyle = '#bca878';
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
      }

      // Civic buildings are only shown at city scale. A temple therefore does
      // not appear as a tiny square while the player is merely looking at Cyprus.
      const temple = profile.monumentAssets.find((asset) => asset.typeId === 'great_temple');
      const tomb = profile.monumentAssets.find((asset) => asset.typeId === 'monumental_tomb');
      const civicX = centre[0] + cityRadius * 0.15;
      const civicY = centre[1] - cityRadius * 0.12;
      const templePx = stage === 'human' ? 70 : 24;
      const ts = templePx * u;
      ctx.globalAlpha = 0.98;
      if (temple) {
        ctx.fillStyle = '#d6c7a6';
        ctx.fillRect(civicX - ts, civicY - ts * 0.45, ts * 2, ts * 0.9);
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(civicX + i * ts * 0.32 - 1.5 * u, civicY - ts * 0.85, 3 * u, ts * 1.45);
        }
      }
      if (tomb) {
        const x = centre[0] - cityRadius * 0.42;
        const y = centre[1] - cityRadius * 0.25;
        const s = (stage === 'human' ? 45 : 18) * u;
        ctx.fillStyle = '#d4c7a4';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.lineTo(x + s, y + s);
        ctx.closePath();
        ctx.fill();
      }

      if (profile.infrastructure.market > 0) {
        const x = centre[0] - cityRadius * 0.12;
        const y = centre[1] + cityRadius * 0.18;
        const s = 14 * u;
        ctx.fillStyle = '#b59063';
        ctx.fillRect(x - s, y - s * 0.6, s * 2, s * 1.2);
      }

      if (profile.infrastructure.harbour > 0 && region.isCoastal) {
        const x = centre[0] + cityRadius * 0.72;
        const y = centre[1] + cityRadius * 0.5;
        ctx.strokeStyle = '#b99c70';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(x - 25 * u, y);
        ctx.lineTo(x + 25 * u, y);
        ctx.stroke();
        const boats = Math.min(4, Math.max(1, Math.round(Math.sqrt(
          Math.max(0, (region.navy?.boats || 0) + (region.fishingBoats || 0))) * 0.2)));
        for (let i = 0; i < boats; i++) {
          map._drawBoat(x + (i - 1.5) * 18 * u, y + 10 * u, 2.2 * u,
            Boolean(region.navy?.advancedBoats));
        }
      }

      // HUMAN SCALE ---------------------------------------------------------
      // Representative agents appear only after the city/temple itself has
      // become large on screen. They reflect actual economic/military mix but
      // are deliberately not one sprite per simulated person.
      if (stage === 'human') {
        const people = Math.min(42, Math.max(12, Math.round(Math.sqrt(urbanPopulation) * 0.12)));
        for (let i = 0; i < people; i++) {
          const angle = rand() * Math.PI * 2;
          const dist = Math.sqrt(rand()) * cityRadius * 0.75;
          const x = centre[0] + Math.cos(angle) * dist;
          const y = centre[1] + Math.sin(angle) * dist;
          let role = 'civilian';
          const roll = rand();
          if (roll < Math.min(0.22, (region.army?.personnel || 0) / Math.max(1, profile.working))) role = 'soldier';
          else if (temple && roll > 0.92) role = 'priest';
          drawPerson(ctx, x, y, u, role);
        }

        // A couple of carts make highly commercial/agrarian places feel busy
        // without creating a permanent animation burden.
        const carts = Math.min(3, Math.round((profile.commercialShare + profile.agricultureShare * 0.25) * 6));
        ctx.fillStyle = '#8d6545';
        for (let i = 0; i < carts; i++) {
          const x = centre[0] - cityRadius * 0.55 + i * 34 * u;
          const y = centre[1] + cityRadius * 0.42;
          ctx.fillRect(x - 8 * u, y - 4 * u, 16 * u, 8 * u);
          ctx.beginPath();
          ctx.arc(x - 5 * u, y + 6 * u, 3 * u, 0, Math.PI * 2);
          ctx.arc(x + 5 * u, y + 6 * u, 3 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function installProgressiveDetail() {
  const sim = window.__worldsim;
  const map = sim?.map;
  if (!map || map._progressiveDetailInstalled) return Boolean(map);

  map._progressiveDetailInstalled = true;
  map.detailStageForRegion = (region) => detailStage(map, region);
  map.regionScreenShare = (region) => regionScreenShare(map, region);

  // Deep zoom is intentional: strategic -> landscape -> city -> human scale.
  if (map._zoom?.scaleExtent) {
    map._zoom.scaleExtent([1, MAX_ZOOM]);
    d3.select(map.canvas).call(map._zoom);
  }

  // Replace the original all-at-once detail renderer with the staged one.
  map._drawRegionalDetail = drawProgressiveRegion.bind(map);

  // Trade animation used to redraw the entire canvas every animation frame.
  // Throttle to ~15 fps: enough motion to read direction while substantially
  // reducing CPU/GPU pressure and battery drain on phones.
  map._syncAnimationLoop = function syncProgressiveAnimationLoop() {
    const shouldAnimate = this.layer?.visualOverlay === 'trade';
    if (!shouldAnimate && this._animationHandle !== null) {
      cancelAnimationFrame(this._animationHandle);
      this._animationHandle = null;
      return;
    }
    if (!shouldAnimate || this._animationHandle !== null) return;

    let lastDraw = 0;
    const animate = (now) => {
      if (this.layer?.visualOverlay !== 'trade') {
        this._animationHandle = null;
        return;
      }
      if (!document.hidden && now - lastDraw >= TRADE_FRAME_MS) {
        lastDraw = now;
        this.draw();
      }
      this._animationHandle = requestAnimationFrame(animate);
    };
    this._animationHandle = requestAnimationFrame(animate);
  };
  map._syncAnimationLoop();
  map.draw();
  return true;
}

if (typeof window !== 'undefined') {
  let attempts = 0;
  const tryInstall = () => {
    attempts += 1;
    if (installProgressiveDetail() || attempts >= 100) return;
    setTimeout(tryInstall, 100);
  };
  setTimeout(tryInstall, 0);
}
