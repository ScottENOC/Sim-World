from pathlib import Path

p = Path('js/main.js')
s = p.read_text()

anchor = """  clock.onTick((time) => {
    profiler.beginTick(time);
"""
replacement = """  let communicationElapsedDays = 0;
  let languageChangeElapsedDays = 0;

  clock.onTick((time) => {
    profiler.beginTick(time);
"""
assert anchor in s
s = s.replace(anchor, replacement, 1)

old = """    profiler.measure('Communication practices', () => tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, time.elapsedDays));
    const languageChangeEvents = profiler.measure('Language change', () => tickGenerationalLanguageChange(regions, time.elapsedDays));
"""
new = """    // These are slow-moving social processes. The world clock may tick monthly
    // (and later weekly/daily), but recomputing them on every world tick wastes
    // CPU without adding meaningful temporal resolution.
    communicationElapsedDays += time.elapsedDays;
    if (communicationElapsedDays >= 90) {
      const elapsedCommunicationDays = communicationElapsedDays;
      communicationElapsedDays = 0;
      profiler.measure('Communication practices', () => tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, elapsedCommunicationDays));
    }

    languageChangeElapsedDays += time.elapsedDays;
    let languageChangeEvents = [];
    if (languageChangeElapsedDays >= 365.2425) {
      const elapsedLanguageDays = languageChangeElapsedDays;
      languageChangeElapsedDays = 0;
      languageChangeEvents = profiler.measure('Language change', () => tickGenerationalLanguageChange(regions, elapsedLanguageDays));
    }
"""
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
print('Applied quarterly communication / annual generational-language cadence')
