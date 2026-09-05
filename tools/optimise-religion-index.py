from pathlib import Path
p=Path('js/society/religion.js'); s=p.read_text()
old="""  if (!Number.isFinite(world.nextReligionId)) world.nextReligionId = world.religions.length + 1;
  if (!Number.isFinite(world.nextDirectiveId)) world.nextDirectiveId = world.directives.length + 1;
  for (const religion of world.religions) ensureSpreadMode(religion);
  return world;"""
new="""  if (!Number.isFinite(world.nextReligionId)) world.nextReligionId = world.religions.length + 1;
  if (!Number.isFinite(world.nextDirectiveId)) world.nextDirectiveId = world.directives.length + 1;
  // Old saves may predate spreadMode, but checking every religion on every
  // religionById lookup makes lookups effectively O(number of religions).
  // Re-run the migration only when the collection size changes; newly created
  // religions already specify their spread mode explicitly.
  if (world._spreadModeCheckedCount !== world.religions.length) {
    for (const religion of world.religions) ensureSpreadMode(religion);
    world._spreadModeCheckedCount = world.religions.length;
  }
  return world;"""
if old not in s: raise SystemExit('ensure religious world anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
