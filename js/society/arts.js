import { principalSettlement } from './settlements.js?v=20260907-art1';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const DISCIPLINES = Object.freeze(['sculpture', 'painting', 'music', 'poetry']);
const PHYSICAL = new Set(['sculpture', 'painting']);
const SUBJECTS = Object.freeze(['ruler', 'religion', 'victory', 'mourning', 'love', 'city', 'nature', 'ancestors']);
const MAX_WORKS_PER_REGION = 120;

function hashString(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pick(list, seed) { return list[seed % list.length]; }

export function ensureCulturalLife(region) {
  if (!region.culturalLife) region.culturalLife = {};
  const c = region.culturalLife;
  if (!c.artists) c.artists = {};
  for (const discipline of DISCIPLINES) {
    if (!c.artists[discipline]) c.artists[discipline] = { people: 0, skill: 0.15, experience: 0 };
  }
  if (!Array.isArray(c.works)) c.works = [];
  if (!Number.isFinite(c.nextWorkSerial)) c.nextWorkSerial = 1;
  if (!Number.isFinite(c.reputation)) c.reputation = 0;
  if (!Number.isFinite(c.publicAmenity)) c.publicAmenity = 0;
  if (!Number.isFinite(c.patronageSpendLastYear)) c.patronageSpendLastYear = 0;
  return c;
}

function artisticDemand(region) {
  const urban = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  const householdWealth = Math.max(0, region.wallet || 0);
  const market = (region.construction?.assets || []).some((a) => a.typeId === 'market_customs' && (a.condition ?? 1) > 0.35) ? 1 : 0;
  const temples = (region.construction?.assets || []).filter((a) => a.typeId === 'great_temple' && (a.condition ?? 1) > 0.35).length;
  const monuments = (region.construction?.assets || []).filter((a) =>
    ['monumental_tomb', 'great_temple', 'ceremonial_complex', 'monumental_statue'].includes(a.typeId) &&
    (a.condition ?? 1) > 0.35).length;
  const urbanDemand = clamp01((urban - 2500) / 25000);
  const wealthDemand = clamp01(Math.log1p(householdWealth) / Math.log(25000));
  return clamp01(urbanDemand * 0.48 + wealthDemand * 0.34 + market * 0.08 + Math.min(0.16, temples * 0.05 + monuments * 0.025));
}

function targetArtists(region, demand) {
  const working = Math.max(0, region.demographics?.workingAge || 0);
  return Math.min(working * 0.006, Math.max(0, (region.urbanisation?.urbanPopulation || 0) * 0.0045 * demand));
}

function distributeArtists(cultural, total, region) {
  const literacy = clamp01(region.educationLevel || 0);
  const templeSignal = (region.construction?.assets || []).some((a) => a.typeId === 'great_temple') ? 1 : 0;
  const weights = {
    sculpture: 1 + templeSignal * 0.45,
    painting: 0.9 + templeSignal * 0.25,
    music: 1.05,
    poetry: 0.55 + literacy * 1.6,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const discipline of DISCIPLINES) cultural.artists[discipline].people = total * weights[discipline] / totalWeight;
}

function commissionChance(region, discipline, years) {
  const cultural = ensureCulturalLife(region);
  const artists = cultural.artists[discipline];
  const wealth = Math.max(0, region.wallet || 0);
  const patronCapacity = clamp01(Math.log1p(wealth) / Math.log(40000));
  const artistCapacity = clamp01(artists.people / 20);
  const baseAnnual = PHYSICAL.has(discipline) ? 0.45 : 0.8;
  return 1 - Math.exp(-baseAnnual * patronCapacity * artistCapacity * Math.max(0, years));
}

function materialAndCost(region, discipline, scale) {
  if (discipline === 'sculpture') {
    const fineStone = Math.max(0, region.stockpile?.fineStone || 0);
    const material = fineStone > 0.5 * scale ? 'fineStone' : 'stone';
    const amount = 0.5 + 3.5 * scale;
    if ((region.stockpile?.[material] || 0) < amount) return null;
    return { material, amount, cost: 1.5 + amount * 0.8 };
  }
  if (discipline === 'painting') {
    const wood = 0.2 + scale * 0.5;
    const pottery = 0.1 + scale * 0.25;
    if ((region.stockpile?.wood || 0) < wood || (region.stockpile?.pottery || 0) < pottery) return null;
    return { material: 'mixed pigments', amount: wood + pottery, wood, pottery, cost: 1 + scale * 3 };
  }
  return { material: discipline === 'music' ? 'performance' : 'oral/literary composition', amount: 0, cost: 0.8 + scale * 2.2 };
}

function spendMaterials(region, spec) {
  if (!spec) return false;
  if (spec.material === 'fineStone' || spec.material === 'stone') region.stockpile[spec.material] -= spec.amount;
  if (spec.wood) region.stockpile.wood -= spec.wood;
  if (spec.pottery) region.stockpile.pottery -= spec.pottery;
  return true;
}

function workTitle(region, discipline, subject, serial) {
  const place = principalSettlement(region)?.name || region.name;
  const noun = {
    sculpture: subject === 'ruler' ? 'Portrait' : subject === 'victory' ? 'Victory Stele' : subject === 'mourning' ? 'Memorial Figure' : 'Figure',
    painting: subject === 'religion' ? 'Sacred Painting' : subject === 'mourning' ? 'Memorial Scene' : 'Painted Scene',
    music: subject === 'mourning' ? 'Lament' : subject === 'victory' ? 'Victory Hymn' : subject === 'religion' ? 'Sacred Hymn' : 'Song',
    poetry: subject === 'victory' ? 'Ode' : subject === 'ancestors' ? 'Lay of the Ancestors' : subject === 'mourning' ? 'Lament' : 'Verse',
  }[discipline];
  return `${noun} of ${place}${serial > 1 ? ` ${serial}` : ''}`;
}

function memorySubjectWeights(region) {
  const weights = Object.fromEntries(SUBJECTS.map((subject) => [subject, 1]));
  const memories = [...(region.culturalMemory?.memories || [])]
    .sort((a, b) => ((b.strength || 0) + (b.symbolicLegacy || 0) * 0.4) -
      ((a.strength || 0) + (a.symbolicLegacy || 0) * 0.4))
    .slice(0, 8);
  for (const memory of memories) {
    const influence = clamp01((memory.strength || 0) * (0.55 + (memory.practicalRelevance || 0) * 0.25) +
      (memory.symbolicLegacy || 0) * 0.2) * 3.2;
    if (memory.theme === 'victory' || memory.theme === 'military_tradition') weights.victory += influence;
    else if (memory.theme === 'defeat' || memory.theme === 'famine' || memory.theme === 'political_loss') {
      weights.mourning += influence * 0.75; weights.ancestors += influence * 0.35;
    } else if (memory.theme === 'migration') {
      weights.ancestors += influence * 0.65; weights.mourning += influence * 0.35;
    } else if (memory.theme === 'religion') weights.religion += influence;
    else if (memory.theme === 'rulership' || memory.theme === 'political_settlement') weights.ruler += influence * 0.8;
    else if (memory.theme === 'achievement') weights.city += influence * 0.8;
  }
  return weights;
}

function chooseSubject(region, rng = Math.random, fallbackSeed = 0) {
  const weights = memorySubjectWeights(region);
  const entries = SUBJECTS.map((subject) => [subject, Math.max(0.05, Number(weights[subject]) || 1)]);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  if (!Number.isFinite(roll)) return pick(SUBJECTS, fallbackSeed);
  for (const [subject, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return subject;
  }
  return pick(SUBJECTS, fallbackSeed);
}

function createWork(region, discipline, rng = Math.random) {
  const cultural = ensureCulturalLife(region);
  const artists = cultural.artists[discipline];
  if (artists.people < 0.5) return null;
  const serial = cultural.nextWorkSerial++;
  const seed = hashString(`${region.id}:${discipline}:${serial}`);
  const subject = chooseSubject(region, rng, seed);
  const scale = clamp01(0.18 + rng() * 0.82);
  const material = materialAndCost(region, discipline, scale);
  if (!material) return null;
  const budget = material.cost * (1.2 + scale * 2.4);
  if ((region.wallet || 0) < budget) return null;
  region.wallet = Math.max(0, region.wallet - budget);
  spendMaterials(region, material);

  const skill = clamp01(artists.skill);
  const patronBudget = clamp01(budget / 12);
  const quality = clamp01(0.18 + skill * 0.5 + patronBudget * 0.18 + (rng() - 0.5) * 0.24);
  const innovation = clamp01(0.08 + skill * 0.22 + rng() * 0.4);
  const literacy = clamp01(region.educationLevel || 0);
  const transmission = PHYSICAL.has(discipline) ? 'physical'
    : discipline === 'poetry' && literacy > 0.3 ? 'written-and-oral' : 'oral';
  const settlement = principalSettlement(region);
  const work = {
    id: `${region.id}:work:${serial}`,
    title: workTitle(region, discipline, subject, serial),
    discipline, subject,
    originRegionId: region.id,
    currentRegionId: region.id,
    settlementId: settlement?.id || null,
    creatorTradition: region.id,
    patronType: 'wealthy household',
    scale, quality, innovation,
    condition: 1,
    fame: Math.max(0.01, quality * 0.08),
    transmission,
    material: material.material,
    ageYears: 0,
  };
  cultural.works.push(work);
  if (cultural.works.length > MAX_WORKS_PER_REGION) {
    cultural.works.sort((a, b) => (b.fame + b.quality) - (a.fame + a.quality));
    cultural.works.length = MAX_WORKS_PER_REGION;
  }
  artists.experience += 30 + scale * 70;
  artists.skill = clamp01(0.12 + Math.log1p(artists.experience) / 12);
  return work;
}

function ageAndSpreadFame(region, regionsById, years) {
  const c = ensureCulturalLife(region);
  const contacts = [...(region.tradePartnerIds || [])]
    .map((id) => regionsById?.get(id))
    .filter(Boolean);
  const contactReach = clamp01(contacts.length / 8);
  let localReputation = 0;
  for (const work of c.works) {
    work.ageYears = Math.max(0, (work.ageYears || 0) + years);
    const preservation = PHYSICAL.has(work.discipline) ? 0.997 : work.transmission === 'oral' ? 0.97 : 0.992;
    work.condition = clamp01((work.condition ?? 1) * Math.pow(preservation, years));
    const intrinsic = work.quality * (0.65 + work.innovation * 0.35) * (0.4 + work.condition * 0.6);
    const fameGrowth = intrinsic * (0.015 + contactReach * 0.025) * years;
    work.fame = clamp01((work.fame || 0) + fameGrowth * (1 - (work.fame || 0)));
    if (work.transmission === 'oral' && work.condition < 0.12) work.lost = true;
    if (!work.lost) localReputation += work.fame * work.quality;
  }
  c.works = c.works.filter((work) => !work.lost);
  c.reputation = clamp01(localReputation / 12);
  c.publicAmenity = clamp01(c.works.reduce((sum, work) => {
    const publicForm = work.discipline === 'music' || work.discipline === 'sculpture' ? 1 : 0.65;
    return sum + work.quality * work.fame * publicForm;
  }, 0) / 18);
}

export function tickArts(region, regionsById = null, elapsedDays = 7, rng = Math.random) {
  const years = Math.max(0, elapsedDays) / 365.2425;
  const c = ensureCulturalLife(region);
  const demand = artisticDemand(region);
  const target = targetArtists(region, demand);
  const current = DISCIPLINES.reduce((sum, discipline) => sum + c.artists[discipline].people, 0);
  const adjustment = 1 - Math.exp(-years / 6);
  distributeArtists(c, Math.max(0, current + (target - current) * adjustment), region);

  let spent = 0;
  for (const discipline of DISCIPLINES) {
    if (rng() < commissionChance(region, discipline, years)) {
      const before = region.wallet || 0;
      createWork(region, discipline, rng);
      spent += Math.max(0, before - (region.wallet || 0));
    }
  }
  c.patronageSpendLastYear = c.patronageSpendLastYear * Math.exp(-years) + spent;
  ageAndSpreadFame(region, regionsById, years);
  return c;
}

export function artistPopulation(region) {
  const c = ensureCulturalLife(region);
  return DISCIPLINES.reduce((sum, discipline) => sum + Math.max(0, c.artists[discipline].people || 0), 0);
}

export function notableWorks(region, limit = 5) {
  return [...ensureCulturalLife(region).works]
    .filter((work) => !work.lost)
    .sort((a, b) => (b.fame * 0.65 + b.quality * 0.35) - (a.fame * 0.65 + a.quality * 0.35))
    .slice(0, limit);
}

export function artisticEffects(region) {
  const c = ensureCulturalLife(region);
  return {
    urbanDesirabilityBonus: c.publicAmenity * 0.025,
    foreignPrestige: c.reputation,
    religiousWorks: c.works.filter((work) => work.subject === 'religion').length,
    rulerWorks: c.works.filter((work) => work.subject === 'ruler').length,
  };
}
