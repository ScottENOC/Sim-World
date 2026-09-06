// Broad cultural identities/traditions at the 1300 BCE start date.
// These are deliberately NOT modern nationalities. `kind: 'attested'` means
// a historically attested identity/name is reasonably defensible; `tradition`
// means an archaeological/regional cultural shorthand, not a claim that people
// necessarily used that label for themselves.

export const START_YEAR = -1300;

export const CULTURE_SEEDS = Object.freeze([
  { id: 'egyptian_lba', label: 'Egyptian', familyId: 'nile_lba', kind: 'attested', confidence: 0.95,
    test: (r) => inBox(r, 24, 36, 21, 32) || named(r, 'egypt', 'nile') },
  { id: 'assyrian_lba', label: 'Assyrian', familyId: 'mesopotamian_lba', kind: 'attested', confidence: 0.9,
    test: (r) => named(r, 'assyria', 'upper tigris', 'nineveh') || inBox(r, 41, 45, 34.5, 38) },
  { id: 'babylonian_lba', label: 'Babylonian', familyId: 'mesopotamian_lba', kind: 'attested', confidence: 0.9,
    test: (r) => named(r, 'babylon', 'sumer', 'lower tigris', 'lower euphrates') || inBox(r, 43, 48, 29, 34.5) },
  { id: 'zagros_highland_lba', label: 'Zagros highland traditions', familyId: 'iranian_highland_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => named(r, 'zagros') || inBox(r, 44, 50, 31, 37.5) },

  { id: 'ugaritic_lba', label: 'Ugaritic / north Levantine', familyId: 'levantine_lba', kind: 'attested', confidence: 0.8,
    test: (r) => named(r, 'ugarit', 'orontes') || inBox(r, 35, 37.5, 34.2, 36.8) },
  { id: 'canaanite_lba', label: 'Canaanite', familyId: 'levantine_lba', kind: 'attested', confidence: 0.85,
    test: (r) => inBox(r, 33, 36.5, 29, 34.5) || named(r, 'carmel', 'jezreel', 'galilee', 'jordan', 'damascus', 'hauran') },
  { id: 'cypriot_lba', label: 'Late Cypriot', familyId: 'east_mediterranean_lba', kind: 'tradition', confidence: 0.9,
    test: (r) => named(r, 'cyprus') || inBox(r, 32.1, 34.8, 34.3, 35.9) },

  { id: 'hittite_central_anatolian', label: 'Hittite central Anatolian', familyId: 'anatolian_lba', kind: 'attested', confidence: 0.9,
    test: (r) => named(r, 'cappadocia', 'central anatolia') || inBox(r, 30.5, 37.5, 38, 41.8) },
  { id: 'luwian_anatolian', label: 'Luwian / south-west Anatolian', familyId: 'anatolian_lba', kind: 'attested', confidence: 0.75,
    test: (r) => named(r, 'lydia', 'cilicia') || inBox(r, 27, 36.5, 35.5, 38.8) },
  { id: 'west_anatolian_lba', label: 'West Anatolian Late Bronze Age', familyId: 'anatolian_lba', kind: 'tradition', confidence: 0.65,
    test: (r) => named(r, 'troad', 'north anatolia') || inBox(r, 25, 31.5, 38, 42.5) },

  { id: 'mycenaean_greek', label: 'Mycenaean Greek', familyId: 'aegean_lba', kind: 'attested', confidence: 0.9,
    test: (r) => inBox(r, 19, 28.5, 34, 41.7) && !inBox(r, 25, 28.5, 40.8, 41.7) },
  { id: 'south_balkan_lba', label: 'South Balkan Late Bronze Age', familyId: 'balkan_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => inBox(r, 18, 30, 40.5, 44.5) },
  { id: 'adriatic_balkan_lba', label: 'Adriatic Late Bronze Age', familyId: 'balkan_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => inBox(r, 13, 21.5, 42, 47) },

  { id: 'terramare_po_lba', label: 'Terramare / Po Valley tradition', familyId: 'italian_lba', kind: 'tradition', confidence: 0.8,
    test: (r) => inBox(r, 7, 13.7, 43.5, 46.8) },
  { id: 'apennine_italian_lba', label: 'Apennine Late Bronze Age tradition', familyId: 'italian_lba', kind: 'tradition', confidence: 0.7,
    test: (r) => inBox(r, 8, 18.8, 36, 43.8) },

  { id: 'libyan_lba', label: 'Libyan / indigenous North African traditions', familyId: 'north_african_lba', kind: 'attested_broad', confidence: 0.65,
    test: (r) => inBox(r, 9, 25, 27, 34.5) },
  { id: 'central_north_african_lba', label: 'Central North African Late Bronze Age traditions', familyId: 'north_african_lba', kind: 'tradition', confidence: 0.45,
    test: (r) => inBox(r, -1, 12, 27, 38) },

  { id: 'iberian_southeast_lba', label: 'South-east Iberian Late Bronze Age traditions', familyId: 'iberian_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => inBox(r, -3.5, 1.5, 36, 40.5) },
  { id: 'iberian_atlantic_lba', label: 'Atlantic Iberian Late Bronze Age traditions', familyId: 'atlantic_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => inBox(r, -10.5, -3, 36, 43.8) },
  { id: 'iberian_interior_lba', label: 'Interior Iberian Late Bronze Age traditions', familyId: 'iberian_lba', kind: 'tradition', confidence: 0.45,
    test: (r) => inBox(r, -5.5, 3.5, 38.5, 44.5) },

  { id: 'urnfield_west_lba', label: 'Western Urnfield-associated traditions', familyId: 'central_europe_lba', kind: 'tradition', confidence: 0.65,
    test: (r) => inBox(r, 2.5, 13.5, 44, 51) },
  { id: 'atlantic_gaul_lba', label: 'Atlantic Gaul Late Bronze Age traditions', familyId: 'atlantic_lba', kind: 'tradition', confidence: 0.5,
    test: (r) => inBox(r, -5.5, 3.5, 43, 51.8) },
  { id: 'north_gaul_lba', label: 'Northern Gaul Late Bronze Age traditions', familyId: 'northwest_europe_lba', kind: 'tradition', confidence: 0.45,
    test: (r) => inBox(r, -1, 8.5, 49, 55.5) },

  { id: 'british_atlantic_lba', label: 'British Atlantic Late Bronze Age traditions', familyId: 'atlantic_lba', kind: 'tradition', confidence: 0.5,
    test: (r) => inBox(r, -6.8, 2, 49.5, 59.5) },
  { id: 'irish_atlantic_lba', label: 'Irish Atlantic Late Bronze Age traditions', familyId: 'atlantic_lba', kind: 'tradition', confidence: 0.55,
    test: (r) => inBox(r, -11, -5, 51, 56) },
]);

function inBox(region, minLon, maxLon, minLat, maxLat) {
  const [lon = 0, lat = 0] = region?.centroid || [];
  return lon >= minLon && lon < maxLon && lat >= minLat && lat < maxLat;
}

function named(region, ...terms) {
  const name = String(region?.name || '').toLowerCase();
  return terms.some((term) => name.includes(term));
}

export function startingCultureFor(region) {
  const match = CULTURE_SEEDS.find((seed) => seed.test(region));
  if (match) return match;
  return {
    id: `local_lba_${region.id}`,
    label: `${region.name} Late Bronze Age tradition`,
    familyId: 'local_lba',
    kind: 'tradition',
    confidence: 0.3,
    test: null,
  };
}
