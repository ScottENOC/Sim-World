from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def repl(path, old, new):
 p=ROOT/path; t=p.read_text()
 if old not in t: raise RuntimeError(f'missing anchor {path}')
 p.write_text(t.replace(old,new,1))

repl('js/main.js',
'''      <label class="control-row">Scout by
        <select id="scouting-mode">
          <option value="auto">best available route</option>
          <option value="land">land patrol</option>
          ${region.isCoastal ? '<option value="sea">naval expedition</option>' : ''}
        </select>
      </label>
      <button id="btn-scout-launch" ${region.scouting?.active ? 'disabled' : ''}>Send scouting expedition</button>''',
'''      <label class="control-row">Scout by
        <select id="scouting-mode">
          <option value="auto">best available route</option>
          <option value="land">land patrol</option>
          ${region.isCoastal ? '<option value="sea">naval expedition</option>' : ''}
        </select>
      </label>
      ${region.isCoastal ? `<label class="control-row">Naval heading
        <select id="scouting-heading">
          <option value="">unspecified</option>
          <option value="N">north</option><option value="NE">north-east</option><option value="E">east</option><option value="SE">south-east</option>
          <option value="S">south</option><option value="SW">south-west</option><option value="W">west</option><option value="NW">north-west</option>
        </select>
      </label>` : ''}
      <button id="btn-scout-launch" ${region.scouting?.active ? 'disabled' : ''}>Send scouting expedition</button>''')

repl('js/main.js',
'''    const mode = document.getElementById('scouting-mode')?.value || 'auto';
    const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);
    const mission = startScoutingMission(region, regions, currentWeek, Math.random, mode);''',
'''    const mode = document.getElementById('scouting-mode')?.value || 'auto';
    const heading = document.getElementById('scouting-heading')?.value || null;
    const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);
    const mission = startScoutingMission(region, regions, currentWeek, Math.random, mode, heading);''')

repl('js/main.js',
'''    if (status) status.textContent = `${mission.mode === 'sea' ? 'Naval' : 'Land'} expedition dispatched · ${mission.armyCommitted} soldiers${mission.navyCommitted ? ' · 1 fleet boat' : ''}`;''',
'''    if (status) status.textContent = `${mission.mode === 'sea' ? 'Naval' : 'Land'} expedition dispatched${mission.heading ? ` ${mission.heading}` : ''} · ${mission.armyCommitted} soldiers${mission.navyCommitted ? ' · 1 fleet boat' : ''} · expected return in ${Math.max(1, Math.round(mission.completeTick-currentWeek))} weeks`;''')

# Scouting boats cannot simultaneously transport raiders.
repl('js/military/army.js',
'''export function navyTransportCapacity(region) {
  return basicNavyBoats(region) * 10 + usableAdvancedNavyBoats(region) * 18;
}''',
'''export function navyTransportCapacity(region) {
  const committed = Math.max(0, region.navy?.scoutingBoats || 0);
  const advanced = usableAdvancedNavyBoats(region);
  const basic = Math.max(0, basicNavyBoats(region));
  const committedAdvanced = Math.min(committed, advanced);
  const committedBasic = Math.max(0, committed - committedAdvanced);
  return Math.max(0, basic - committedBasic) * 10 + Math.max(0, advanced - committedAdvanced) * 18;
}''')
print('directional scouting UI patched')
