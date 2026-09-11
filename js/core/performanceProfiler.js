const MAX_SAMPLES = 240;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMs(value) {
  if (value >= 1000) return `${value.toFixed(0)} ms`;
  if (value >= 100) return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} ms`;
}

export function createPerformanceProfiler() {
  let active = false;
  let current = null;
  let samples = [];
  let modal = null;
  let reportBox = null;
  let status = null;
  let openButton = null;
  let lastRenderAt = 0;

  const now = () => performance.now();

  function beginTick(time) {
    if (!active) return;
    current = {
      start: now(),
      endDay: time?.endDay ?? null,
      elapsedDays: time?.elapsedDays ?? null,
      stages: Object.create(null),
      details: Object.create(null),
      metrics: Object.create(null),
    };
  }

  function measure(label, fn) {
    if (!active || !current) return fn();
    const start = now();
    try {
      return fn();
    } finally {
      current.stages[label] = (current.stages[label] || 0) + (now() - start);
    }
  }

  function measureDetail(label, fn) {
    if (!active || !current) return fn();
    const start = now();
    try { return fn(); }
    finally { current.details[label] = (current.details[label] || 0) + (now() - start); }
  }

  function metric(label, value) {
    if (!active || !current) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) current.metrics[label] = numeric;
  }

  function endTick() {
    if (!active || !current) return;
    const total = now() - current.start;
    const measured = Object.values(current.stages).reduce((sum, value) => sum + value, 0);
    samples.push({
      total,
      unattributed: Math.max(0, total - measured),
      endDay: current.endDay,
      elapsedDays: current.elapsedDays,
      stages: current.stages,
      details: current.details,
      metrics: current.metrics,
    });
    if (samples.length > MAX_SAMPLES) samples = samples.slice(samples.length - MAX_SAMPLES);
    current = null;
    scheduleRender();
  }

  function reset() {
    samples = [];
    current = null;
    render();
  }

  function setActive(enabled) {
    active = Boolean(enabled);
    if (!active) current = null;
    render();
  }

  function summaryRows() {
    const totals = samples.map((sample) => sample.total);
    const labels = new Set();
    for (const sample of samples) {
      for (const label of Object.keys(sample.stages)) labels.add(label);
    }
    const totalAverage = average(totals);
    const rows = [...labels].map((label) => {
      const values = samples.map((sample) => sample.stages[label] || 0);
      const avg = average(values);
      return {
        label,
        avg,
        p95: percentile(values, 95),
        max: Math.max(0, ...values),
        share: totalAverage > 0 ? (avg / totalAverage) * 100 : 0,
      };
    });
    rows.sort((a, b) => b.avg - a.avg);
    return rows;
  }

  function detailRows() {
    const labels = new Set(samples.flatMap((sample) => Object.keys(sample.details || {})));
    return [...labels].map((label) => {
      const values = samples.map((sample) => sample.details?.[label] || 0);
      return { label, avg: average(values), p95: percentile(values,95), max: Math.max(0,...values) };
    }).sort((a,b) => b.avg-a.avg);
  }

  function metricRows() {
    const labels = new Set(samples.flatMap((sample) => Object.keys(sample.metrics || {})));
    return [...labels].map((label) => {
      const values = samples.map((sample) => sample.metrics?.[label]).filter(Number.isFinite);
      return { label, last: values.at(-1) ?? 0, avg: average(values), max: Math.max(0,...values) };
    }).sort((a,b) => b.last-a.last);
  }

  function buildReport() {
    const totals = samples.map((sample) => sample.total);
    const unattributed = samples.map((sample) => sample.unattributed);
    const lines = [];
    lines.push('SIM-WORLD IOS TICK PROFILE');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Profiler: ${active ? 'RUNNING' : 'STOPPED'}`);
    lines.push(`Samples: ${samples.length}${samples.length === MAX_SAMPLES ? ` (rolling last ${MAX_SAMPLES})` : ''}`);
    lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight} CSS px`);
    lines.push(`Device pixel ratio: ${window.devicePixelRatio || 1}`);
    lines.push(`CPU logical cores: ${navigator.hardwareConcurrency || 'unknown'}`);
    lines.push(`User agent: ${navigator.userAgent}`);
    lines.push('');

    if (!samples.length) {
      lines.push('No tick samples yet. Press Start profiling and let the simulation run for at least 10-20 ticks.');
      return lines.join('\n');
    }

    lines.push('TOTAL TICK');
    lines.push(`  last: ${formatMs(totals[totals.length - 1])}`);
    lines.push(`  avg:  ${formatMs(average(totals))}`);
    lines.push(`  p50:  ${formatMs(percentile(totals, 50))}`);
    lines.push(`  p95:  ${formatMs(percentile(totals, 95))}`);
    lines.push(`  max:  ${formatMs(Math.max(...totals))}`);
    lines.push('');
    lines.push('SUBSYSTEMS (sorted by average time)');
    lines.push('  avg | p95 | max | % total | subsystem');
    for (const row of summaryRows()) {
      lines.push(
        `  ${formatMs(row.avg).padStart(10)} | ${formatMs(row.p95).padStart(10)} | ${formatMs(row.max).padStart(10)} | ${row.share.toFixed(1).padStart(6)}% | ${row.label}`
      );
    }
    lines.push(
      `  ${formatMs(average(unattributed)).padStart(10)} | ${formatMs(percentile(unattributed, 95)).padStart(10)} | ${formatMs(Math.max(...unattributed)).padStart(10)} | ${((average(unattributed) / Math.max(0.0001, average(totals))) * 100).toFixed(1).padStart(6)}% | Unattributed/event plumbing`
    );
    lines.push('');
    lines.push('HOTSPOT DETAILS (nested inside subsystem totals)');
    lines.push('  avg | p95 | max | detail');
    for (const row of detailRows()) lines.push(`  ${formatMs(row.avg).padStart(10)} | ${formatMs(row.p95).padStart(10)} | ${formatMs(row.max).padStart(10)} | ${row.label}`);
    lines.push('');
    lines.push('STATE METRICS');
    lines.push('  last | avg | max | metric');
    for (const row of metricRows()) lines.push(`  ${row.last.toFixed(0).padStart(8)} | ${row.avg.toFixed(1).padStart(8)} | ${row.max.toFixed(0).padStart(8)} | ${row.label}`);
    lines.push('');
    lines.push('RECENT TICKS');
    for (const sample of samples.slice(-20)) {
      const m = sample.metrics || {};
      const state = [`rel=${m['Diplomacy relationship records'] ?? '-'}`, `ventures=${m['Trade active ventures'] ?? '-'}`, `known=${m['Trade known-region links'] ?? '-'}`, `candidates=${m['Trade candidate markets checked'] ?? '-'}`].join(' ');
      lines.push(`  ${formatMs(sample.total)}${sample.endDay == null ? '' : ` at sim day ${sample.endDay}`} · ${state}`);
    }
    lines.push('');
    lines.push('Interpretation: if one subsystem has a much larger share/p95 on iOS than expected, optimise that path first. If most rows scale up similarly, the issue is broader JavaScript/device/browser throughput rather than one system.');
    return lines.join('\n');
  }

  function scheduleRender() {
    if (!modal || modal.classList.contains('hidden')) return;
    const timestamp = now();
    if (timestamp - lastRenderAt < 400) return;
    lastRenderAt = timestamp;
    requestAnimationFrame(render);
  }

  function render() {
    if (!modal || !reportBox || !status) return;
    status.textContent = `${active ? 'Profiling' : 'Stopped'} · ${samples.length} tick${samples.length === 1 ? '' : 's'} sampled`;
    reportBox.value = buildReport();
    const startButton = modal.querySelector('#perf-profiler-start');
    const stopButton = modal.querySelector('#perf-profiler-stop');
    if (startButton) startButton.disabled = active;
    if (stopButton) stopButton.disabled = !active;
  }

  function copyReport() {
    if (!reportBox) return;
    const text = reportBox.value;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        status.textContent = `Copied report · ${samples.length} ticks sampled`;
      }).catch(() => {
        reportBox.focus();
        reportBox.select();
        status.textContent = 'Report selected — use Copy from the iOS selection menu.';
      });
      return;
    }
    reportBox.focus();
    reportBox.select();
    status.textContent = 'Report selected — use Copy from the iOS selection menu.';
  }

  async function shareReport() {
    if (!navigator.share) {
      reportBox?.focus();
      reportBox?.select();
      status.textContent = 'Share sheet unavailable — report selected instead.';
      return;
    }
    try {
      await navigator.share({ title: 'Sim-World performance profile', text: buildReport() });
      status.textContent = `Shared report · ${samples.length} ticks sampled`;
    } catch (error) {
      if (error?.name !== 'AbortError') status.textContent = 'Could not open share sheet; use Select text instead.';
    }
  }

  function mount() {
    if (document.getElementById('performance-profiler-modal')) return;

    const style = document.createElement('style');
    style.id = 'performance-profiler-style';
    style.textContent = `
      .perf-profiler-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.perf-profiler-actions button{min-height:44px;flex:1 1 120px}
      .perf-profiler-status{font-size:.9rem;opacity:.8;margin:6px 0 10px}
      .perf-profiler-help{font-size:.9rem;line-height:1.35;opacity:.85}
      .perf-profiler-report{width:100%;min-height:46vh;box-sizing:border-box;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;white-space:pre;overflow:auto;-webkit-overflow-scrolling:touch}
      .perf-profiler-open{width:100%;min-height:44px;margin-top:8px}
    `;
    document.head.appendChild(style);

    const menuCard = document.querySelector('#menu-modal .menu-card');
    if (menuCard) {
      const development = [...menuCard.querySelectorAll('.menu-section')].find((section) => section.querySelector('h3')?.textContent?.trim() === 'Development');
      const host = development || menuCard;
      openButton = document.createElement('button');
      openButton.id = 'btn-performance-profiler';
      openButton.className = 'perf-profiler-open';
      openButton.type = 'button';
      openButton.textContent = 'Performance profiler';
      host.appendChild(openButton);
    }

    modal = document.createElement('div');
    modal.id = 'performance-profiler-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card">
        <button id="perf-profiler-close" class="menu-close" aria-label="Close profiler">&times;</button>
        <h2>Performance profiler</h2>
        <p class="perf-profiler-help">Measures real tick time on this device. Profiling is off unless you start it. For a useful comparison, run 20-50 ticks at 1× without interacting, then stop and share the report.</p>
        <div id="perf-profiler-status" class="perf-profiler-status"></div>
        <div class="perf-profiler-actions">
          <button id="perf-profiler-start" type="button">Start profiling</button>
          <button id="perf-profiler-stop" type="button">Stop</button>
          <button id="perf-profiler-reset" type="button">Reset</button>
          <button id="perf-profiler-copy" type="button">Copy report</button>
          <button id="perf-profiler-share" type="button">Share report</button>
          <button id="perf-profiler-select" type="button">Select text</button>
        </div>
        <textarea id="perf-profiler-report" class="perf-profiler-report" readonly spellcheck="false" aria-label="Copyable performance report"></textarea>
      </div>`;
    document.getElementById('app')?.appendChild(modal);

    reportBox = modal.querySelector('#perf-profiler-report');
    status = modal.querySelector('#perf-profiler-status');
    openButton?.addEventListener('click', () => {
      document.getElementById('menu-modal')?.classList.add('hidden');
      modal.classList.remove('hidden');
      render();
    });
    modal.querySelector('#perf-profiler-close')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelector('#perf-profiler-start')?.addEventListener('click', () => setActive(true));
    modal.querySelector('#perf-profiler-stop')?.addEventListener('click', () => setActive(false));
    modal.querySelector('#perf-profiler-reset')?.addEventListener('click', reset);
    modal.querySelector('#perf-profiler-copy')?.addEventListener('click', copyReport);
    modal.querySelector('#perf-profiler-share')?.addEventListener('click', shareReport);
    modal.querySelector('#perf-profiler-select')?.addEventListener('click', () => {
      reportBox.focus();
      reportBox.select();
      status.textContent = 'Report selected — use Copy from the iOS selection menu.';
    });
    render();
  }

  return {
    mount,
    beginTick,
    measure,
    measureDetail,
    metric,
    endTick,
    reset,
    setActive,
    buildReport,
    get active() { return active; },
    get sampleCount() { return samples.length; },
  };
}
