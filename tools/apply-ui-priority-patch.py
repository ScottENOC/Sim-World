from pathlib import Path

path = Path('js/main.js')
text = path.read_text()

old = """  const deferSimulationForInput = () => clock.deferForInteraction(350);
  document.addEventListener('pointerdown', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('touchstart', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('input', deferSimulationForInput, true);
  document.addEventListener('keydown', deferSimulationForInput, true);
"""
new = """  const deferSimulationForInput = () => clock.deferForInteraction(350);
  let pointerInteractionActive = false;
  document.addEventListener('pointerdown', () => { pointerInteractionActive = true; deferSimulationForInput(); }, { passive: true, capture: true });
  document.addEventListener('pointermove', () => { if (pointerInteractionActive) deferSimulationForInput(); }, { passive: true, capture: true });
  const endPointerInteraction = () => { pointerInteractionActive = false; deferSimulationForInput(); };
  document.addEventListener('pointerup', endPointerInteraction, { passive: true, capture: true });
  document.addEventListener('pointercancel', endPointerInteraction, { passive: true, capture: true });
  document.addEventListener('touchstart', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('wheel', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('input', deferSimulationForInput, true);
  document.addEventListener('keydown', deferSimulationForInput, true);
"""
if text.count(old) != 1:
    raise SystemExit('input-priority block did not match exactly once')
text = text.replace(old, new)

old = """  let communicationElapsedDays = 0;
  let languageChangeElapsedDays = 0;
  let diplomacyRelationshipElapsedDays = 0;

  clock.onTick((time) => {
"""
new = """  let communicationElapsedDays = 0;
  let languageChangeElapsedDays = 0;
  let diplomacyRelationshipElapsedDays = 0;

  // Simulation work is intentionally cooperative. A turn may take seconds on
  // a large world, but it must not own the browser main thread for those seconds.
  // Yield between heavy phases; if the player is actively panning, scrolling or
  // editing, keep yielding until the short interaction quiet-period expires.
  const nextUiFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const yieldForUi = async () => {
    do { await nextUiFrame(); } while (clock.isInteractionDeferred());
  };

  clock.onTick(async (time) => {
"""
if text.count(old) != 1:
    raise SystemExit('tick header did not match exactly once')
text = text.replace(old, new)

replacements = [
    ("    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));\n",
     "    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));\n    await yieldForUi();\n"),
    ("    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements, profiler));\n",
     "    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements, profiler));\n    await yieldForUi();\n"),
    ("    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));\n",
     "    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));\n    await yieldForUi();\n"),
    ("    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));\n    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions, profiler }));\n",
     "    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));\n    await yieldForUi();\n    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions, profiler }));\n    await yieldForUi();\n"),
]
for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f'heavy-phase insertion did not match exactly once: {old[:60]!r}')
    text = text.replace(old, new)

path.write_text(text)
Path('.github/workflows/performance-ui-priority-patch-main.yml').unlink()
Path('tools/apply-ui-priority-patch.py').unlink()
