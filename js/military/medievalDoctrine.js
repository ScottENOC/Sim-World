import { ensureSubregionalControl } from './subregionalControl.js?v=20260908-subregion1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function hasTech(region, id) {
  return Boolean(region.unlockedTechIds?.has?.(id) || region.breakthroughs?.has?.(id) || region.technology?.breakthroughs?.has?.(id) || region.technology?.known?.has?.(id));
}

function horseSignal(region) {
  return clamp((region.horseEconomy?.horses || region.stockpile?.horses || 0) / Math.max(50, (region.population || 1) * 0.01));
}

function metalSignal(region) {
  return clamp(((region.stockpile?.iron || 0) + (region.stockpile?.steel || 0) * 1.8 + (region.stockpile?.bronze || 0) * 0.6) / 500);
}

export function ensureMedievalDoctrine(region) {
  region.medievalDoctrine ||= {};
  const d = region.medievalDoctrine;
  d.composition ||= { spearPike: 0.15, archers: 0.08, crossbows: 0, heavyCavalry: 0, horseArchers: 0, lightCavalry: 0.05, professionalInfantry: 0.05, militia: 0.25, firearms: 0, artillery: 0 };
  d.practice ||= { combinedArms: 0, antiCavalry: 0, missileDiscipline: 0, cavalryShock: 0, mountedSkirmish: 0, firearmDrill: 0 };
  d.fortress ||= { castleNetwork: 0, fortifiedTowns: 0, passControl: 0, supplyStorage: 0, siegeResistance: 0 };
  return d;
}

function normaliseComposition(c) {
  const keys = Object.keys(c); let total = keys.reduce((sum,k)=>sum+Math.max(0,c[k]||0),0);
  if (total <= 0) return c;
  if (total > 1.25) for (const k of keys) c[k] = c[k] / total * 1.25;
  return c;
}

function updateComposition(region, years) {
  const d = ensureMedievalDoctrine(region); const c = d.composition;
  const society = region.medievalSociety || {}; const paths = region.medievalPolityPaths || region._institutionalPaths || {};
  const metal = metalSignal(region); const horses = horseSignal(region);
  const crossbow = hasTech(region, 'crossbows') || hasTech(region, 'crossbow');
  const gunpowder = hasTech(region, 'gunpowder');
  const steel = hasTech(region, 'steelmaking') || (region.stockpile?.steel || 0) > 0;
  const professional = clamp(region.militaryProfessionalisation?.level || region.professionalisation?.level || region.formations?.experience || 0);
  const landed = clamp(paths.landedRetinues ?? society.paths?.landedRetinues ?? 0);
  const clan = clamp(paths.clanRetinues ?? society.paths?.clanRetinues ?? 0);
  const urban = clamp(paths.urbanCivic ?? society.paths?.urbanCivic ?? society.urban?.militia ?? 0);
  const bureaucracy = clamp(paths.bureaucraticService ?? society.paths?.bureaucraticService ?? 0);

  const targets = {
    spearPike: clamp(0.12 + urban * 0.25 + professional * 0.18 + metal * 0.12),
    archers: clamp(0.07 + professional * 0.12 + (region.terrain?.includes?.('forest') ? 0.08 : 0)),
    crossbows: crossbow ? clamp(0.06 + urban * 0.16 + metal * 0.14 + professional * 0.15) : 0,
    heavyCavalry: clamp((landed * 0.3 + horses * 0.25 + metal * 0.18 + (steel ? 0.08 : 0)) * (hasTech(region,'heavy_cavalry') || hasTech(region,'knightly_retinues') ? 1 : 0.55)),
    horseArchers: clamp(clan * 0.3 + horses * 0.28 + (region.terrain?.includes?.('steppe') ? 0.16 : 0)),
    lightCavalry: clamp(0.04 + horses * 0.2 + clan * 0.12),
    professionalInfantry: clamp(0.04 + professional * 0.26 + bureaucracy * 0.14 + metal * 0.1),
    militia: clamp(0.28 - professional * 0.12 + urban * 0.18),
    firearms: gunpowder ? clamp((region.firearms?.adoption || region.gunpowder?.firearmAdoption || 0) * 0.75 + professional * 0.12) : 0,
    artillery: gunpowder ? clamp((region.stockpile?.gunpowder || 0) / 600 * 0.08 + (region.stockpile?.steel || region.stockpile?.iron || 0) / 1200 * 0.06) : 0,
  };
  for (const [key,target] of Object.entries(targets)) c[key] += (target - c[key]) * clamp(years * 0.2);
  normaliseComposition(c);
  d.practice.antiCavalry += (clamp(c.spearPike * 1.5 + c.crossbows * 0.35) - d.practice.antiCavalry) * clamp(years * 0.18);
  d.practice.missileDiscipline += (clamp(c.archers * 0.7 + c.crossbows * 1.1 + c.firearms * 0.8) - d.practice.missileDiscipline) * clamp(years * 0.18);
  d.practice.cavalryShock += (clamp(c.heavyCavalry * 1.8) - d.practice.cavalryShock) * clamp(years * 0.18);
  d.practice.mountedSkirmish += (clamp(c.horseArchers * 1.6 + c.lightCavalry * 0.45) - d.practice.mountedSkirmish) * clamp(years * 0.18);
  d.practice.firearmDrill += (clamp(c.firearms * 1.6) - d.practice.firearmDrill) * clamp(years * 0.2);
  d.practice.combinedArms += (clamp((Object.values(c).filter(v=>v>0.08).length - 2) / 6 + professional * 0.3) - d.practice.combinedArms) * clamp(years * 0.14);
}

function updateFortresses(region, years) {
  const d = ensureMedievalDoctrine(region); const f = d.fortress;
  const local = region.medievalPolitics || {}; const urban = region.medievalSociety?.urban || {};
  const walls = Math.max(0, region.infrastructure?.settlement_walls?.condition || region.projects?.settlement_walls?.condition || 0);
  const forts = Math.max(0, region.infrastructure?.hill_fort?.condition || region.projects?.hill_fort?.condition || 0);
  const targetCastle = clamp((local.fortification || 0) * 0.6 + (local.localDefence || 0) * 0.25 + forts * 0.15);
  const targetTowns = clamp((urban.council || 0) * 0.35 + (urban.militia || 0) * 0.25 + walls * 0.25 + urban.guilds * 0.15);
  f.castleNetwork += (targetCastle - f.castleNetwork) * clamp(years * 0.13);
  f.fortifiedTowns += (targetTowns - f.fortifiedTowns) * clamp(years * 0.13);
  f.passControl += (clamp(f.castleNetwork * 0.45 + (region.medievalCommerce?.trade?.caravanNetwork || 0) * 0.25 + (region.infrastructure?.watchtowers?.condition || 0) * 0.3) - f.passControl) * clamp(years * 0.1);
  f.supplyStorage += (clamp(f.castleNetwork * 0.25 + f.fortifiedTowns * 0.25 + Math.log1p(region.stockpile?.food || 0) / 12) - f.supplyStorage) * clamp(years * 0.12);
  f.siegeResistance = clamp(f.castleNetwork * 0.4 + f.fortifiedTowns * 0.35 + f.supplyStorage * 0.25);

  if (f.castleNetwork >= 0.35) {
    const control = ensureSubregionalControl(region);
    if (!control.places.some(p=>p.kind==='castle')) control.places.push({ id:`${region.id}:castle`, name:`${region.name} fortress`, kind:'castle', population:Math.round((region.population||0)*0.006), strategicValue:0.92, nativeControllerActorId:control.sovereignActorId, controllerActorId:control.sovereignActorId, occupationMode:'fortified', garrisonActorId:control.sovereignActorId, garrisonPersonnel:Math.round((region.population||0)*0.002*f.castleNetwork), contested:false, capturedTick:null });
  }
}

export function medievalMilitaryCombatMultiplier(region, opponent, terrain = 'plains', role = 'attacker') {
  const d = ensureMedievalDoctrine(region); const o = ensureMedievalDoctrine(opponent); const c=d.composition, oc=o.composition;
  let m = 1;
  m *= 1 + d.practice.combinedArms * 0.1;
  // Matchups: capabilities arise from composition and practice, not era labels.
  const enemyCavalry = clamp((oc.heavyCavalry||0)+(oc.lightCavalry||0)+(oc.horseArchers||0));
  m *= 1 + d.practice.antiCavalry * enemyCavalry * 0.22;
  m *= 1 + c.crossbows * (oc.heavyCavalry + (opponent.steelMilitary?.adoption || 0)) * 0.18;
  m *= 1 + d.practice.cavalryShock * Math.max(0, 0.28 - o.practice.antiCavalry) * (terrain === 'plains' ? 0.22 : 0.08);
  m *= 1 + d.practice.mountedSkirmish * (terrain === 'plains' || terrain === 'steppe' ? 0.16 : 0.05);
  m *= 1 + d.practice.firearmDrill * (1 - (opponent.firearmExposure || opponent.gunpowder?.firearmExposure || 0)) * 0.12;
  if (role === 'defender') m *= 1 + d.fortress.siegeResistance * 0.24;
  return clamp(m, 0.8, 1.65);
}

export function medievalCampaignFriction(region, role = 'attacker') {
  const f = ensureMedievalDoctrine(region).fortress;
  return role === 'defender' ? 1 + f.passControl * 0.18 + f.supplyStorage * 0.08 : 1;
}

export function tickMedievalDoctrine(regions, elapsedDays = 30) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  for (const region of regions) { updateComposition(region, years); updateFortresses(region, years); }
  return [];
}
