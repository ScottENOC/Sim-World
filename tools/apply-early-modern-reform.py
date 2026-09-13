from pathlib import Path
import subprocess
import sys


def insert_after(path, anchor, addition):
    p = Path(path)
    text = p.read_text()
    if addition in text:
        return False
    if anchor not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {anchor[:160]!r}')
    p.write_text(text.replace(anchor, anchor + addition, 1))
    return True


# First install the already-tested Renaissance information/patronage layer on
# whatever current main looks like. Its helper is idempotent.
subprocess.run([sys.executable, 'tools/apply-renaissance-networks.py'], check=True)

insert_after(
    'js/main.js',
    "import { tickRenaissanceNetworks } from './society/renaissanceNetworks.js?v=20260913-renaissance1';\n",
    "import { tickEarlyModernReform } from './society/earlyModernReform.js?v=20260914-reform1';\n",
)

insert_after(
    'js/main.js',
    "    const renaissanceEvents = profiler.measure('Renaissance networks', () => tickRenaissanceNetworks(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n",
    "    const earlyModernReformEvents = profiler.measure('Early-modern religious reform', () => tickEarlyModernReform(regions, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n",
)

insert_after(
    'js/main.js',
    "      ...renaissanceEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
    "      ...earlyModernReformEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
)

print('Early Modern information and religious reform runtime integration applied')
