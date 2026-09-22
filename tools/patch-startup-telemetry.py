from pathlib import Path

p = Path('js/ui/startupPicker.js')
s = p.read_text()
old = """async function loadMapEntries(scenario) {
  const [metaResponse, navResponse] = await Promise.all([
    fetch(scenarioAssetUrl('regions.meta.json?v=20260921-scenario-picker1', scenario)),
    fetch(scenarioAssetUrl('region-navigation.json?v=20260921-scenario-picker1', scenario)),
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
"""
new = """async function loadMapEntries(scenario, report = () => {}) {
  const fetchJson = async (relativePath, label) => {
    const url = scenarioAssetUrl(relativePath, scenario);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const started = performance.now();
    report(`Requesting ${label}…`);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      const length = response.headers.get('content-length');
      report(`${label}: HTTP ${response.status} after ${elapsed}s${length ? ` · ${Number(length).toLocaleString()} bytes` : ''}`);
      if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
      report(`${label}: downloading body…`);
      const text = await response.text();
      report(`${label}: received ${text.length.toLocaleString()} characters · parsing JSON…`);
      const parsed = JSON.parse(text);
      report(`${label}: JSON parsed.`);
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${label} timed out after 15 seconds (${url})`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const [metadata, navigation] = await Promise.all([
    fetchJson('regions.meta.json?v=20260922-picker-telemetry1', 'Region metadata'),
    fetchJson('region-navigation.json?v=20260922-picker-telemetry1', 'Region navigation'),
  ]);
  report('Both map files parsed · building region index…');
  const regions = [...(metadata.regions || [])].sort((a, b) => alphabetical(a.name, b.name));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const entries = [];
  for (const region of regions) {
    for (const membership of navigation.regions?.[region.id] || []) entries.push({ region, ...membership });
  }
  report(`Region index ready: ${regions.length.toLocaleString()} regions · ${entries.length.toLocaleString()} navigation memberships.`);
  return { regions, regionById, entries };
}
"""
if old not in s:
    raise SystemExit('loadMapEntries anchor not found')
s = s.replace(old, new, 1)
old2 = """    pickerTitle.textContent = 'Choose your region';
    pickerHelp.textContent = `${scenario.name} · loading region names…`;
    pickerList.innerHTML = '<div class=\"startup-picker-status\">Preparing region list…</div>';

    let entries;
    let regionById;
    try {
      ({ entries, regionById } = await loadMapEntries(scenario));
"""
new2 = """    pickerTitle.textContent = 'Choose your region';
    pickerHelp.textContent = `${scenario.name} · loading region names…`;
    const status = document.createElement('div');
    status.className = 'startup-picker-status';
    pickerList.replaceChildren(status);
    const telemetryStarted = performance.now();
    const telemetryLines = [];
    const report = (message) => {
      const elapsed = ((performance.now() - telemetryStarted) / 1000).toFixed(1);
      telemetryLines.push(`${elapsed}s · ${message}`);
      status.replaceChildren(...telemetryLines.slice(-10).map((line) => {
        const row = document.createElement('div');
        row.textContent = line;
        return row;
      }));
      pickerHelp.textContent = `${scenario.name} · ${message}`;
      console.info('[startup-picker]', message);
    };
    report('Preparing region list…');

    let entries;
    let regionById;
    try {
      ({ entries, regionById } = await loadMapEntries(scenario, report));
"""
if old2 not in s:
    raise SystemExit('renderRegionPicker anchor not found')
s = s.replace(old2, new2, 1)
p.write_text(s)
