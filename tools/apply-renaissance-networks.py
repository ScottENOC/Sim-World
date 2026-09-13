from pathlib import Path


def insert_after(path, anchor, addition):
    p = Path(path)
    text = p.read_text()
    if addition in text:
        return False
    if anchor not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {anchor[:160]!r}')
    p.write_text(text.replace(anchor, anchor + addition, 1))
    return True


insert_after(
    'js/main.js',
    "import { tickMedievalCompletion } from './politics/medievalCompletion.js?v=20260913-medieval-completion1';\n",
    "import { tickRenaissanceNetworks } from './society/renaissanceNetworks.js?v=20260913-renaissance1';\n",
)

insert_after(
    'js/main.js',
    "    const medievalCompletionEvents = profiler.measure('Medieval completion', () => tickMedievalCompletion(regions, polities, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n",
    "    const renaissanceEvents = profiler.measure('Renaissance networks', () => tickRenaissanceNetworks(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n",
)

insert_after(
    'js/main.js',
    "      ...medievalCompletionEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
    "      ...renaissanceEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
)

print('Renaissance information/university runtime integration applied')
