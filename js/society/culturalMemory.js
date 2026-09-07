import { chariotCoverage, cavalryCoverage } from '../military/chariotry.js?v=20260907-memory1';

const DAYS_PER_YEAR = 365.2425;
const MAX_MEMORIES = 24;
const MAX_DEFINING = 6;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const MONUMENT_MEMORY = Object.freeze({
  monumental_tomb: { label: 'monumental royal tomb', theme: 'rulership', legacy: 0.22 },
  great_temple: { label: 'great temple complex', theme: 'religion', legacy: 0.20 },
  ceremonial_complex: { label: 'ceremonial and assembly complex', theme: 'rulership', legacy: 0.15 },
  monumental_statue: { label: 'colossal monument', theme: 'achievement', legacy: 0.18 },
});

function ensure(region) {
  region.culturalMemory ||= { memories: [], nextSerial: 1, effects: {} };
  region.culturalMemory.memories ||= [];
  region.culturalMemory.nextSerial ||= 1;
  region.culturalMemory.effects ||= {};
  region.culturalMemory.observation ||= { seenMonuments: [], eventSerial: 1 };
  region.culturalMemory.observation.seenMonuments ||= [];
  region.culturalMemory.observation.eventSerial ||= 1;
  return region.culturalMemory;
}

function memoryLabel(region, campaign, role) {
  const other = role === 'attacker' ? campaign.defenderId : campaign.attackerId;
  const outcome = String(campaign.outcome || 'campaign').replaceAll('_', ' ');
  return `${role === 'attacker' ? 'Campaign' : 'Defence'} of ${region.name}: ${outcome} against ${other}`;
}

function militaryMotif(region) {
  const chariot = chariotCoverage(region);
  const cavalry = cavalryCoverage(region);
  if (chariot > Math.max(0.28, cavalry * 1.15)) return { motif: 'chariot', weight: chariot };
  if (cavalry > 0.32) return { motif: 'cavalry', weight: cavalry };
  return { motif: 'infantry', weight: 0.25 };
}

function outcomeValence(campaign, role) {
  const outcome = String(campaign.outcome || '');
  const attackerSuccess = ['punitive_success', 'liberated', 'submission', 'capital_lost', 'region_lost', 'devastated'].includes(outcome);
  const attackerFailure = ['attacker_broke', 'liberation_failed'].includes(outcome);
  if (role === 'attacker') return attackerSuccess ? 1 : attackerFailure ? -1 : 0;
  return attackerSuccess ? -1 : attackerFailure ? 1 : 0;
}

function salience(campaign, region, role) {
  const casualties = role === 'attacker' ? campaign.attackerCasualties : campaign.defenderCasualties;
  const ownForce = Math.max(25, role === 'attacker' ? campaign.initialPersonnel : (region.army?.personnel || 0) + (campaign.defenderCasualties || 0));
  const casualtyShock = clamp01((casualties || 0) / ownForce * 1.8);
  const duration = clamp01((campaign.weeksEngaged || 0) / 30);
  const pressure = clamp01(campaign.pressure || 0);
  const valence = Math.abs(outcomeValence(campaign, role));
  const civilianShock = clamp01((campaign.civilianDeaths || 0) / Math.max(1, region.population || 1) * 25);
  return clamp01(0.12 + valence * 0.25 + casualtyShock * 0.22 + duration * 0.13 + pressure * 0.14 + civilianShock * 0.14);
}

function addMemory(region, spec) {
  const state = ensure(region);
  const existing = state.memories.find((m) => m.sourceType === spec.sourceType && String(m.sourceId) === String(spec.sourceId) && (m.role || 'community') === (spec.role || 'community'));
  if (existing) return existing;
  const memory = {
    id: `${region.id}:memory:${state.nextSerial++}`,
    sourceType: spec.sourceType,
    sourceId: spec.sourceId,
    role: spec.role || 'community',
    label: spec.label,
    createdTick: spec.createdTick ?? null,
    ageYears: 0,
    theme: spec.theme || 'war',
    motif: spec.motif || null,
    valence: spec.valence || 0,
    historicalAccuracy: clamp01(spec.historicalAccuracy ?? 0.9),
    strength: clamp01(spec.strength || 0.1),
    practicalRelevance: clamp01(spec.practicalRelevance ?? 1),
    symbolicLegacy: clamp01(spec.symbolicLegacy ?? (spec.strength || 0.1) * 0.35),
    reinforcement: 0,
    artReinforcement: 0,
    defining: false,
  };
  state.memories.push(memory);
  if (state.memories.length > MAX_MEMORIES) {
    state.memories.sort((a, b) => (b.strength + b.symbolicLegacy * 0.5) - (a.strength + a.symbolicLegacy * 0.5));
    state.memories.length = MAX_MEMORIES;
  }
  return memory;
}

export function recordCampaignMemories(campaign, attacker, defender, currentTick = null) {
  if (!campaign || !campaign.completed || campaign._culturalMemoryRecorded) return [];
  campaign._culturalMemoryRecorded = true;
  const created = [];
  for (const [region, role] of [[attacker, 'attacker'], [defender, 'defender']]) {
    if (!region) continue;
    const s = salience(campaign, region, role);
    if (s < 0.28) continue;
    const motif = militaryMotif(region);
    created.push(addMemory(region, {
      sourceType: 'campaign', sourceId: campaign.id, role,
      label: memoryLabel(region, campaign, role), createdTick: currentTick,
      theme: outcomeValence(campaign, role) >= 0 ? 'victory' : 'defeat',
      motif: motif.motif, valence: outcomeValence(campaign, role),
      strength: s * (0.75 + motif.weight * 0.25), practicalRelevance: 1,
    }));
  }
  return created;
}

function dominantReligionId(region) {
  return Object.entries(region.religion?.shares || {})
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0]?.[0] || null;
}

function observeNonMilitaryEvents(region, state) {
  const observation = state.observation;
  const nextEventId = (kind) => `${kind}-${observation.eventSerial++}`;

  // Physical monuments are especially good memory anchors because the object
  // itself can outlive the political purpose for which it was built.
  const seen = new Set(observation.seenMonuments || []);
  for (const asset of region.construction?.assets || []) {
    const spec = MONUMENT_MEMORY[asset.typeId];
    if (!spec || seen.has(asset.id)) continue;
    seen.add(asset.id);
    const scale = Math.max(0.5, Number(asset.scale) || 1);
    addMemory(region, {
      sourceType: 'monument', sourceId: asset.id,
      label: `Building of the ${spec.label} in ${region.name}`,
      theme: spec.theme, motif: asset.typeId, valence: 1,
      strength: clamp01(0.13 + Math.log2(1 + scale) * 0.11),
      practicalRelevance: spec.theme === 'achievement' ? 0.45 : 0.72,
      symbolicLegacy: clamp01(spec.legacy * Math.sqrt(scale)),
    });
  }
  observation.seenMonuments = [...seen].slice(-80);

  const official = region.religion?.stateReligionId || null;
  const dominant = dominantReligionId(region);
  if (observation.initialised) {
    if (observation.stateReligionId !== official) {
      addMemory(region, {
        sourceType: 'religious_change', sourceId: nextEventId('state-faith'),
        label: official ? `Adoption of a new state faith in ${region.name}` : `End of the state faith in ${region.name}`,
        theme: 'religion', motif: official ? 'state_faith' : 'disestablishment',
        valence: 0, strength: 0.16, practicalRelevance: 0.88, symbolicLegacy: 0.045,
      });
    }
    if (observation.dominantReligionId && dominant && observation.dominantReligionId !== dominant) {
      const dominantShare = Number(region.religion?.shares?.[dominant]) || 0;
      if (dominantShare >= 0.45) {
        addMemory(region, {
          sourceType: 'religious_change', sourceId: nextEventId('dominant-faith'),
          label: `Religious realignment in ${region.name}`,
          theme: 'religion', motif: 'religious_realignment',
          valence: 0, strength: 0.13 + Math.min(0.12, dominantShare * 0.12),
          practicalRelevance: 0.8, symbolicLegacy: 0.035,
        });
      }
    }

    const sovereign = region.governance?.sovereignPolityId || region.controllingActorId || null;
    if (observation.sovereignPolityId && sovereign && observation.sovereignPolityId !== sovereign) {
      const autonomy = clamp01(region.governance?.autonomy ?? 0.5);
      addMemory(region, {
        sourceType: 'political_change', sourceId: nextEventId('sovereignty'),
        label: `Change of rule in ${region.name}`,
        theme: autonomy < 0.35 ? 'political_loss' : 'political_settlement',
        motif: autonomy < 0.35 ? 'direct_rule' : 'change_of_sovereignty',
        valence: autonomy < 0.35 ? -1 : -0.2,
        strength: autonomy < 0.35 ? 0.29 : 0.19,
        practicalRelevance: 0.92, symbolicLegacy: autonomy < 0.35 ? 0.09 : 0.05,
      });
    }

    const previousPopulation = Math.max(1, Number(observation.population) || 1);
    const populationChange = ((region.population || 0) - previousPopulation) / previousPopulation;
    if (previousPopulation >= 1000 && Math.abs(populationChange) >= 0.12) {
      addMemory(region, {
        sourceType: 'migration_shock', sourceId: nextEventId(populationChange > 0 ? 'arrival' : 'flight'),
        label: populationChange > 0 ? `The Great Arrival in ${region.name}` : `The Great Flight from ${region.name}`,
        theme: 'migration', motif: populationChange > 0 ? 'arrival' : 'displacement',
        valence: populationChange > 0 ? 0.2 : -0.8,
        strength: clamp01(0.12 + Math.min(0.3, Math.abs(populationChange) * 0.8)),
        practicalRelevance: 0.72, symbolicLegacy: 0.04 + Math.min(0.08, Math.abs(populationChange) * 0.15),
      });
    }
  }

  observation.stateReligionId = official;
  observation.dominantReligionId = dominant;
  observation.sovereignPolityId = region.governance?.sovereignPolityId || region.controllingActorId || null;
  observation.population = region.population || 0;
  observation.initialised = true;
}

function workMatchesMemory(work, memory) {
  if (!work || work.lost) return 0;
  let match = 0;
  if (memory.theme === 'victory' && work.subject === 'victory') match += 0.7;
  if ((memory.theme === 'defeat' || memory.theme === 'famine' || memory.theme === 'political_loss' || memory.theme === 'migration') && work.subject === 'mourning') match += 0.6;
  if (memory.theme === 'religion' && work.subject === 'religion') match += 0.72;
  if ((memory.theme === 'rulership' || memory.theme === 'political_settlement') && work.subject === 'ruler') match += 0.58;
  if (memory.theme === 'achievement' && work.subject === 'city') match += 0.55;
  if (work.subject === 'ancestors') match += 0.25;
  if (memory.motif === 'chariot' && /chariot/i.test(`${work.title || ''} ${work.subject || ''}`)) match += 0.6;
  if (memory.motif === 'cavalry' && /horse|cavalry/i.test(`${work.title || ''} ${work.subject || ''}`)) match += 0.5;
  return clamp01(match);
}

function materialRelevance(region, memory) {
  if (memory.motif === 'chariot') {
    if (!region.unlockedTechIds?.has('light_chariotry')) return 0.05;
    const cavalry = region.unlockedTechIds?.has('mounted_cavalry') ? 0.55 : 1;
    return clamp01(0.35 + chariotCoverage(region) * 0.45 + cavalry * 0.2);
  }
  if (memory.motif === 'cavalry') return region.unlockedTechIds?.has('mounted_cavalry') ? 1 : 0.2;
  if (memory.theme === 'famine') {
    const currentShortfall = Math.max(0, Number(region.report?.foodPlan?.shortfall) || 0);
    const granaries = Math.max(0, Number(region.infrastructure?.publicGranaries) || 0);
    return clamp01(0.35 + Math.min(0.4, currentShortfall / Math.max(1, region.population || 1) * 20) + Math.max(0, 0.25 - granaries * 0.05));
  }
  if (memory.theme === 'religion') return region.religion?.stateReligionId ? 0.8 : 0.45;
  if (memory.theme === 'political_loss' || memory.theme === 'political_settlement') return 0.65;
  if (memory.theme === 'rulership') return 0.6;
  if (memory.theme === 'migration') return 0.5;
  return 0.5;
}

export function tickCulturalMemory(region, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const state = ensure(region);
  observeNonMilitaryEvents(region, state);
  if (years <= 0 || state.memories.length === 0) {
    state.effects = culturalMemoryEffects(region);
    return state;
  }
  const works = region.culturalLife?.works || [];
  for (const memory of state.memories) {
    memory.ageYears += years;
    const artSignal = works.reduce((sum, work) => sum + workMatchesMemory(work, memory) * (work.fame || 0) * (work.quality || 0), 0);
    memory.artReinforcement = clamp01(artSignal / 3);
    const oralInstitutional = clamp01((region.educationLevel || 0) * 0.18 + (region.culturalLife?.reputation || 0) * 0.14);
    const reinforcement = clamp01(memory.artReinforcement * 0.5 + oralInstitutional * 0.25 + Math.max(0, memory.valence) * 0.08);
    memory.reinforcement = reinforcement;

    const fadeYears = 130 + reinforcement * 900;
    const naturalFade = Math.exp(-years / fadeYears);
    memory.strength = clamp01(memory.strength * naturalFade + reinforcement * (1 - naturalFade) * 0.55);

    const relevanceTarget = materialRelevance(region, memory);
    memory.practicalRelevance = clamp01(memory.practicalRelevance + (relevanceTarget - memory.practicalRelevance) * (1 - Math.exp(-years / 25)));
    const legacyGain = memory.strength * (0.012 + memory.artReinforcement * 0.025) * years;
    const legacyFade = Math.exp(-years / 1400);
    memory.symbolicLegacy = clamp01(memory.symbolicLegacy * legacyFade + legacyGain * (1 - memory.symbolicLegacy));
    memory.historicalAccuracy = clamp01(memory.historicalAccuracy - years * memory.strength * 0.00018 +
      (region.educationLevel || 0) * years * 0.00004);
  }
  state.memories = state.memories.filter((m) => m.strength > 0.015 || m.symbolicLegacy > 0.06);
  const ranked = [...state.memories].sort((a, b) => (b.strength + b.symbolicLegacy * 0.35) - (a.strength + a.symbolicLegacy * 0.35));
  const definingIds = new Set(ranked.slice(0, MAX_DEFINING).filter((m) => m.strength > 0.28).map((m) => m.id));
  for (const memory of state.memories) memory.defining = definingIds.has(memory.id);
  state.effects = culturalMemoryEffects(region);
  return state;
}

export function culturalMemoryEffects(region) {
  const state = ensure(region);
  let chariot = 0, cavalry = 0, martial = 0, symbolic = 0, tourism = 0;
  let foodSecurity = 0, religiousIdentity = 0, politicalTradition = 0, monumentalTradition = 0, migrationIdentity = 0;
  for (const m of state.memories) {
    const active = m.strength * (0.35 + m.practicalRelevance * 0.65);
    if (m.motif === 'chariot') chariot += active;
    if (m.motif === 'cavalry') cavalry += active;
    if (m.theme === 'victory' || m.theme === 'defeat' || m.theme === 'military_tradition') martial += active * 0.5;
    if (m.theme === 'famine') foodSecurity += active;
    if (m.theme === 'religion') religiousIdentity += active;
    if (m.theme === 'political_loss' || m.theme === 'political_settlement' || m.theme === 'rulership') politicalTradition += active;
    if (m.theme === 'achievement' || m.sourceType === 'monument') monumentalTradition += active;
    if (m.theme === 'migration') migrationIdentity += active;
    symbolic += m.symbolicLegacy * m.strength;
    tourism += m.symbolicLegacy * (0.35 + m.artReinforcement * 0.65);
  }
  return {
    chariotPrestige: clamp01(chariot / 2.2),
    cavalryPrestige: clamp01(cavalry / 2.2),
    martialTradition: clamp01(martial / 2.8),
    foodSecurityTradition: clamp01(foodSecurity / 1.8),
    religiousIdentity: clamp01(religiousIdentity / 1.8),
    politicalTradition: clamp01(politicalTradition / 2.2),
    monumentalTradition: clamp01(monumentalTradition / 2.2),
    migrationIdentity: clamp01(migrationIdentity / 1.8),
    symbolicLegacy: clamp01(symbolic / 3.5),
    tourismPotential: clamp01(tourism / 3.0),
  };
}

export function definingMemories(region, limit = MAX_DEFINING) {
  return [...ensure(region).memories]
    .sort((a, b) => (b.strength + b.symbolicLegacy * 0.35) - (a.strength + a.symbolicLegacy * 0.35))
    .slice(0, limit);
}
