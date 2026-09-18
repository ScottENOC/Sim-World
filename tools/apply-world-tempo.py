from pathlib import Path

p = Path('js/main.js')
text = p.read_text()
replacements = [
    ("import { calendarWeekIndex } from './core/simTime.js?v=20260905-time2';",
     "import { calendarWeekIndex } from './core/simTime.js?v=20260905-time2';\nimport { assessWorldTempo } from './core/worldTempo.js?v=20260918-world-tempo1';"),
    ("  const regions = await loadWorld();\n  console.log(`Simulation map loaded: ${regions.length} permanent land regions`);",
     "  const regions = await loadWorld();\n  clock.setWorldTempo(assessWorldTempo(regions));\n  console.log(`Simulation map loaded: ${regions.length} permanent land regions`);"),
    ("    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    clock.start();",
     "    clock.setWorldTempo(assessWorldTempo(regions));\n    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    clock.start();"),
    ("    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    profiler.measure('UI world-map draw', () => map.draw());",
     "    // Reassess after this turn's construction, technology and infrastructure\n    // changes. The result applies to the next turn, so historical time contracts\n    // smoothly as fast transport/communications become established.\n    clock.setWorldTempo(assessWorldTempo(regions));\n    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    profiler.measure('UI world-map draw', () => map.draw());"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing main.js integration pattern: {old[:100]!r}')
    text = text.replace(old, new, 1)
p.write_text(text)
print('world tempo integration applied')
