import { artistPopulation, ensureCulturalLife } from './arts.js?v=20260907-art1';

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const DISCIPLINES = Object.freeze(['sculpture', 'painting', 'music', 'poetry']);
const SUBJECTS = Object.freeze(['ruler', 'religion', 'victory', 'mourning', 'love', 'city', 'nature', 'ancestors']);
const PHYSICAL = new Set(['sculpture', 'painting']);

export const STATE_PATRONAGE_LEVELS = Object.freeze({
  minimal: { label: 'Minimal patronage', budgetShare: 0.0005, commissionRate: 0.10, schoolBias: 0.00 },
  occasional: { label: 'Occasional commissions', budgetShare: 0.002, commissionRate: 0.30, schoolBias: 0.08 },
  active: { label: 'Active court patronage', budgetShare: 0.006, commissionRate: 0.60, schoolBias: 0.35 },
  major: { label: 'Major public patronage', budgetShare: 0.015, commissionRate: 0.95, schoolBias: 0.70 },
});

function hashString(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick(list, seed) { return list[seed % list.length]; }

export function ensureStatePatronage(region) {
  const c = ensureCulturalLife(region);
  if (!c.statePatronage) c.statePatronage = { level: 'occasional', manual: false, annualSpend: 0 };
  if (!STATE_PATRONAGE_LEVELS[c.statePatronage.level]) c.statePatronage.level = 'occasional';
  if (!Number.isFinite(c.statePatronage.annualSpend)) c.statePatronage.annualSpend = 0;
  if (!c.artSchool) c.artSchool = {
    founded: false, quality: 0, teachers: 0, students: 0,
    annualUpkeep: 0, foundedTick: null, fundingRatio: 1,
  };
  return c.statePatronage;
}

export function setStatePatronagePolicy(region, level) {
  if (!STATE_PATRONAGE_LEVELS[level]) return false;
  const policy = ensureStatePatronage(region);
  policy.level = level;
  policy.manual = true;
  return true;
}

export function foundArtSchool(region, currentTick = null) {
  const c = ensureCulturalLife(region); ensureStatePatronage(region);
  if (c.artSchool.founded) return false;
  const urban = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  if (urban < 5000 || (region.treasury || 0) < 80) return false;
  region.treasury -= 80;
  c.artSchool = {
    founded: true, quality: 0.12, teachers: 2, students: 8,
    annualUpkeep: 12, foundedTick: currentTick, fundingRatio: 1,
  };
  return true;
}

export function closeArtSchool(region) {
  const c = ensureCulturalLife(region); ensureStatePatronage(region);
  if (!c.artSchool.founded) return false;
  c.artSchool.founded = false;
  c.artSchool.teachers = 0;
  c.artSchool.students = 0;
  c.artSchool.annualUpkeep = 0;
  c.artSchool.fundingRatio = 0;
  return true;
}

function materialSpec(region, discipline, scale) {
  if (discipline === 'sculpture') {
    const material = (region.stockpile?.fineStone || 0) >= 0.5 + 3 * scale ? 'fineStone' : 'stone';
    const amount = 0.5 + 3 * scale;
    if ((region.stockpile?.[material] || 0) < amount) return null;
    return { material, amount, cost: 1.5 + amount * 0.8 };
  }
  if (discipline === 'painting') {
    const wood = 0.2 + scale * 0.5;
    const pottery = 0.1 + scale * 0.25;
    if ((region.stockpile?.wood || 0) < wood || (region.stockpile?.pottery || 0) < pottery) return null;
    return { material: 'mixed pigments', wood, pottery, cost: 1 + scale * 3 };
  }
  return { material: discipline === 'music' ? 'performance' : 'oral/literary composition', cost: 0.8 + scale * 2.2 };
}

function spendMaterials(region, spec) {
  if (spec.material === 'fineStone' || spec.material === 'stone') region.stockpile[spec.material] -= spec.amount;
  if (spec.wood) region.stockpile.wood -= spec.wood;
  if (spec.pottery) region.stockpile.pottery -= spec.pottery;
}

function workTitle(region, discipline, subject, serial) {
  const place = region.settlements?.principalId
    ? region.settlements.places?.find((p) => p.id === region.settlements.principalId)?.name || region.name
    : region.name;
  const noun = {
    sculpture: subject === 'ruler' ? 'Royal Portrait' : subject === 'victory' ? 'Victory Monument' : 'Public Figure',
    painting: subject === 'religion' ? 'Sacred Painting' : 'Commissioned Painting',
    music: subject === 'victory' ? 'Victory Hymn' : subject === 'mourning' ? 'State Lament' : 'Court Song',
    poetry: subject === 'victory' ? 'Victory Ode' : subject === 'ancestors' ? 'Dynastic Lay' : 'Court Verse',
  }[discipline];
  return `${noun} of ${place}${serial > 1 ? ` ${serial}` : ''}`;
}

export function commissionGovernmentWork(region, discipline, subject = 'ruler', scale = 0.7, patronType = 'state') {
  const c = ensureCulturalLife(region); ensureStatePatronage(region);
  if (!DISCIPLINES.includes(discipline) || !SUBJECTS.includes(subject)) return null;
  const cohort = c.artists?.[discipline];
  if (!cohort || (cohort.people || 0) < 0.5) return null;
  const s = clamp01(scale);
  const materials = materialSpec(region, discipline, s);
  if (!materials) return null;
  const budget = materials.cost * (1.4 + s * 2.8);
  if ((region.treasury || 0) < budget) return null;
  region.treasury -= budget;
  spendMaterials(region, materials);

  const serial = c.nextWorkSerial++;
  const skill = clamp01(cohort.skill || 0);
  const quality = clamp01(0.22 + skill * 0.55 + clamp01(budget / 14) * 0.15 + (Math.random() - 0.5) * 0.18);
  const innovation = clamp01(0.08 + skill * 0.22 + Math.random() * 0.35);
  const literacy = clamp01(region.educationLevel || 0);
  const transmission = PHYSICAL.has(discipline) ? 'physical'
    : discipline === 'poetry' && literacy > 0.3 ? 'written-and-oral' : 'oral';
  const settlementId = region.settlements?.principalId || null;
  const work = {
    id: `${region.id}:work:${serial}`,
    title: workTitle(region, discipline, subject, serial),
    discipline, subject,
    originRegionId: region.id, currentRegionId: region.id, settlementId,
    creatorTradition: region.id,
    patronType,
    scale: s, quality, innovation, condition: 1,
    fame: Math.max(0.015, quality * 0.1), transmission,
    material: materials.material, ageYears: 0,
  };
  c.works.push(work);
  if (c.works.length > 120) {
    c.works.sort((a, b) => (b.fame + b.quality) - (a.fame + a.quality));
    c.works.length = 120;
  }
  cohort.experience = (cohort.experience || 0) + 40 + s * 85;
  cohort.skill = clamp01(0.12 + Math.log1p(cohort.experience) / 12);
  c.statePatronage.annualSpend += budget;
  return work;
}

function automaticPolicy(region) {
  const c = ensureCulturalLife(region); const p = ensureStatePatronage(region);
  if (p.manual) return p.level;
  const treasury = Math.max(0, region.treasury || 0);
  const urban = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  const stability = clamp01(region.stability ?? 1);
  if (treasury > 1000 && urban > 15000 && stability > 0.7) return 'major';
  if (treasury > 350 && urban > 8000 && stability > 0.55) return 'active';
  if (treasury > 80 && urban > 4000) return 'occasional';
  return 'minimal';
}

function tickArtSchool(region, years) {
  const c = ensureCulturalLife(region); ensureStatePatronage(region);
  const school = c.artSchool;
  if (!school.founded) return;
  const totalArtists = artistPopulation(region);
  const desiredTeachers = Math.max(2, Math.min(18, totalArtists * 0.08));
  const desiredStudents = Math.max(8, Math.min(100, totalArtists * 0.5 + (region.urbanisation?.urbanPopulation || 0) / 900));
  school.teachers += (desiredTeachers - school.teachers) * (1 - Math.exp(-years / 3));
  school.students += (desiredStudents - school.students) * (1 - Math.exp(-years / 2));
  school.annualUpkeep = 8 + school.teachers * 1.8 + school.students * 0.15;
  const due = school.annualUpkeep * years;
  const paid = Math.min(Math.max(0, region.treasury || 0), due);
  region.treasury = Math.max(0, (region.treasury || 0) - paid);
  school.fundingRatio = due > 0 ? paid / due : 1;
  const masterSkill = DISCIPLINES.reduce((sum, d) => sum + (c.artists[d]?.skill || 0), 0) / DISCIPLINES.length;
  school.quality = clamp01(school.quality + (masterSkill * school.fundingRatio - school.quality) * (1 - Math.exp(-years / 8)));
  for (const discipline of DISCIPLINES) {
    const cohort = c.artists[discipline];
    cohort.experience = (cohort.experience || 0) + school.students * school.quality * school.fundingRatio * years * 2.5;
    cohort.skill = clamp01(0.12 + Math.log1p(cohort.experience) / 12);
  }
}

export function tickStatePatronage(region, elapsedDays = 7, rng = Math.random) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const c = ensureCulturalLife(region); const policy = ensureStatePatronage(region);
  const level = automaticPolicy(region);
  if (!policy.manual) policy.level = level;
  const spec = STATE_PATRONAGE_LEVELS[level];
  policy.annualSpend *= Math.exp(-years);

  if (!c.artSchool.founded && spec.schoolBias > 0 && artistPopulation(region) >= 8 &&
      (region.treasury || 0) > 160 && rng() < 1 - Math.exp(-spec.schoolBias * years * 0.2)) {
    foundArtSchool(region);
  }
  tickArtSchool(region, years);

  const artistFactor = clamp01(artistPopulation(region) / 25);
  if (rng() < 1 - Math.exp(-spec.commissionRate * artistFactor * years)) {
    const seed = hashString(`${region.id}:${c.nextWorkSerial}:state`);
    const discipline = pick(DISCIPLINES, seed);
    const subject = pick(['ruler', 'religion', 'victory', 'city', 'ancestors'], seed >>> 3);
    const maxAnnual = Math.max(2, Math.max(0, region.treasury || 0) * spec.budgetShare);
    const before = region.treasury || 0;
    const work = commissionGovernmentWork(region, discipline, subject, 0.45 + rng() * 0.5,
      subject === 'religion' ? 'state-sponsored temple' : 'state');
    const spent = Math.max(0, before - (region.treasury || 0));
    if (work && spent > maxAnnual * Math.max(years, 0.08)) {
      // The commission remains a real object, but this prevents automatic policy
      // from repeatedly draining a small treasury in accelerated time.
      policy.level = policy.manual ? policy.level : 'minimal';
    }
  }
}

export function tickArtistMigration(regions, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  if (years <= 0) return;
  const byId = new Map(regions.map((r) => [r.id, r]));
  const moves = [];
  for (const origin of regions) {
    const c = ensureCulturalLife(origin); ensureStatePatronage(origin);
    const originPull = c.reputation * 0.5 + (c.artSchool?.quality || 0) * 0.35 +
      clamp01(Math.log1p(origin.wallet || 0) / Math.log(30000)) * 0.15;
    const destinations = [...new Set([...(origin.neighbors || []), ...(origin.tradePartnerIds || [])])]
      .map((id) => byId.get(id)).filter(Boolean);
    let best = null; let bestPull = originPull;
    for (const dest of destinations) {
      const dc = ensureCulturalLife(dest); ensureStatePatronage(dest);
      const pull = dc.reputation * 0.5 + (dc.artSchool?.quality || 0) * 0.35 +
        clamp01(Math.log1p(dest.wallet || 0) / Math.log(30000)) * 0.15;
      if (pull > bestPull + 0.12) { best = dest; bestPull = pull; }
    }
    if (!best) continue;
    for (const discipline of DISCIPLINES) {
      const cohort = c.artists[discipline];
      const amount = Math.min((cohort.people || 0) * 0.025 * years, (cohort.people || 0) * 0.1);
      if (amount > 0.02) moves.push({ origin, dest: best, discipline, amount, skill: cohort.skill || 0 });
    }
  }
  for (const move of moves) {
    const from = ensureCulturalLife(move.origin).artists[move.discipline];
    const to = ensureCulturalLife(move.dest).artists[move.discipline];
    const actual = Math.min(move.amount, from.people || 0);
    if (actual <= 0) continue;
    const combined = (to.people || 0) + actual;
    to.skill = combined > 0 ? clamp01(((to.skill || 0) * (to.people || 0) + move.skill * actual) / combined) : to.skill;
    to.people = (to.people || 0) + actual;
    from.people = Math.max(0, (from.people || 0) - actual);
  }
}
