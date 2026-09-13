from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))
    return True


# Use the actual court centralisation drive created by State Administration v2.
p = Path('js/politics/medievalCompletion.js')
text = p.read_text()
text = text.replace("polity?.administration?.centralisation || 0", "polity?.stateAdministration?.court?.centralisationDrive || 0")
p.write_text(text)

replace_once(
    'js/main.js',
    "import { tickCorporateCapital } from './economy/corporateCapital.js?v=20260913-capital2';\n",
    "import { tickCorporateCapital } from './economy/corporateCapital.js?v=20260913-capital2';\nimport { tickMedievalCompletion } from './politics/medievalCompletion.js?v=20260913-medieval-completion1';\n",
)

replace_once(
    'js/main.js',
    "    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n",
    "    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n    const medievalCompletionEvents = profiler.measure('Medieval completion', () => tickMedievalCompletion(regions, polities, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n",
)

replace_once(
    'js/main.js',
    "      ...capitalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
    "      ...capitalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n      ...medievalCompletionEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
)

print('Medieval completion integration applied')
