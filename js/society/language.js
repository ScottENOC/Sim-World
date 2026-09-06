// Broad spoken-language layer for the 1300 BCE simulation.
// This deliberately models communication friction, not modern national languages.
// Regions get a stable local speech community from geography; repeated trade builds
// route-specific bilingual/interpreter capacity that can outgrow the initial barrier.

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function baseLanguageFor(region) {
  const [lon = 0, lat = 0] = region?.centroid || [];
  const name = String(region?.name || '').toLowerCase();

  // Egypt / Nile
  if ((lon >= 24 && lon <= 36 && lat >= 21 && lat <= 32) || name.includes('nile') || name.includes('egypt')) {
    return { id: 'egyptian', familyId: 'afroasiatic', label: 'Egyptian' };
  }
  // Mesopotamia: by 1300 BCE Akkadian is the main spoken administrative language;
  // Sumerian remains important as a learned/liturgical language but is not treated
  // as the majority vernacular here.
  if ((lon >= 38 && lon <= 49 && lat >= 28 && lat <= 38) || ['sumer', 'babylon', 'assyria', 'zagros'].some((x) => name.includes(x))) {
    return { id: 'akkadian', familyId: 'east-semitic', label: 'Akkadian and related East Semitic speech' };
  }
  // Levant
  if (lon >= 32 && lon < 38.5 && lat >= 29 && lat <= 38) {
    return { id: 'northwest-semitic', familyId: 'semitic', label: 'Northwest Semitic' };
  }
  // Anatolia
  if (lon >= 25 && lon < 44 && lat >= 36 && lat <= 43) {
    return { id: 'anatolian', familyId: 'indo-european', label: 'Anatolian Indo-European' };
  }
  // Aegean / Greece
  if (lon >= 19 && lon < 30 && lat >= 34 && lat < 42) {
    return { id: 'greek', familyId: 'indo-european', label: 'Greek' };
  }
  // Balkans north of Greece
  if (lon >= 13 && lon < 30 && lat >= 40 && lat < 48) {
    return { id: 'balkan-indo-european', familyId: 'indo-european', label: 'Balkan Indo-European' };
  }
  // Italy
  if (lon >= 6 && lon < 19 && lat >= 36 && lat < 48) {
    return { id: 'proto-italic-zone', familyId: 'indo-european', label: 'Proto-Italic and neighbouring speech' };
  }
  // Iberia
  if (lon >= -10.5 && lon < 4 && lat >= 35 && lat < 44.5) {
    return { id: 'iberian-zone', familyId: 'western-mediterranean', label: 'Iberian and western Mediterranean speech' };
  }
  // Britain and Ireland. Avoid anachronistically labelling all of this "Celtic" in 1300 BCE.
  if (lon >= -11 && lon < 3 && lat >= 49 && lat <= 59.5) {
    return { id: 'atlantic-indo-european', familyId: 'indo-european', label: 'Atlantic Indo-European speech' };
  }
  // France / Low Countries / western central Europe represented on current map.
  if (lon >= -5 && lon < 13 && lat >= 43 && lat <= 55) {
    return { id: 'western-indo-european', familyId: 'indo-european', label: 'Western Indo-European speech' };
  }
  // North Africa west of Egypt.
  if (lat >= 27 && lat < 38 && lon >= -10 && lon < 24) {
    return { id: 'libyco-berber-zone', familyId: 'afroasiatic', label: 'Libyco-Berber and related speech' };
  }
  return { id: 'local-speech', familyId: 'unclassified', label: 'Local speech tradition' };
}

export function ensureLanguage(region) {
  if (!region) return null;
  if (!region.language || typeof region.language !== 'object') region.language = {};
  if (!region.language.primaryId) {
    const base = baseLanguageFor(region);
    region.language.primaryId = base.id;
    region.language.familyId = base.familyId;
    region.language.label = base.label;
  }
  if (!region.language.tradeFamiliarity || typeof region.language.tradeFamiliarity !== 'object') {
    region.language.tradeFamiliarity = {};
  }
  return region.language;
}

export function baseLanguageCompatibility(regionA, regionB) {
  const a = ensureLanguage(regionA);
  const b = ensureLanguage(regionB);
  if (!a || !b) return 0.5;
  if (a.primaryId === b.primaryId) return 1;
  if (a.familyId === b.familyId && a.familyId !== 'unclassified') return 0.78;
  return 0.42;
}

export function tradeCommunicationMultiplier(regionA, regionB) {
  const base = baseLanguageCompatibility(regionA, regionB);
  const familiarity = clamp(ensureLanguage(regionA)?.tradeFamiliarity?.[regionB.id] || 0);
  // Established bilingual brokers/interpreters can overcome most, but not all,
  // of an initial linguistic barrier.
  return clamp(base + (0.96 - base) * familiarity, 0.35, 1);
}

export function recordTradeLanguageContact(regionA, regionB, successWeight = 1) {
  if (!regionA || !regionB) return;
  const a = ensureLanguage(regionA);
  const b = ensureLanguage(regionB);
  const gain = 0.025 * clamp(successWeight, 0.2, 2);
  a.tradeFamiliarity[regionB.id] = clamp((a.tradeFamiliarity[regionB.id] || 0) + gain);
  b.tradeFamiliarity[regionA.id] = clamp((b.tradeFamiliarity[regionA.id] || 0) + gain * 0.7);
}

export function decayTradeLanguageFamiliarity(region, years = 0) {
  const language = ensureLanguage(region);
  if (!language || years <= 0) return;
  const archive = clamp(region.education?.archiveLevel || 0);
  // Spoken bilingual networks die faster than written route records. Archives
  // help preserve vocabulary/names but cannot fully preserve living fluency.
  const halfLifeYears = 18 + archive * 22;
  const retention = Math.pow(0.5, years / halfLifeYears);
  for (const [id, value] of Object.entries(language.tradeFamiliarity)) {
    const next = value * retention;
    if (next < 0.01) delete language.tradeFamiliarity[id];
    else language.tradeFamiliarity[id] = next;
  }
}
