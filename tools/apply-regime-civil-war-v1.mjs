import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Could not find ${label} patch point`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Found multiple ${label} patch points`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const campaignsPath = 'js/military/campaigns.js';
let campaigns = fs.readFileSync(campaignsPath, 'utf8');

campaigns = replaceOnce(campaigns,
`  const reach = canCampaign(attacker, defender, options.campaigns, options.regions, options.polities);\n  if (!reach.possible) return null;`,
`  let reach = canCampaign(attacker, defender, options.campaigns, options.regions, options.polities);\n  // Rival governments created by an internal revolution know their own frontier.\n  // Do not let fog-of-war contact bookkeeping prevent adjacent civil-war forces\n  // from fighting through the normal campaign engine.\n  if (!reach.possible && options.regimeConflict && attacker.neighbors?.includes(defender.id)) {\n    reach = { possible: true, viaSea: false, stagingRegionId: attacker.id };\n  }\n  if (!reach.possible) return null;`,
'civil-war reach');

campaigns = replaceOnce(campaigns,
`    beneficiaryPolityId: options.beneficiaryPolityId || null,\n    pressure: 0, damage: 0, attackerMorale: 1, defenderMorale: 1, supply: 1,`,
`    beneficiaryPolityId: options.beneficiaryPolityId || null,\n    regimeConflict: options.regimeConflict ? { ...options.regimeConflict } : null,\n    pressure: 0, damage: 0, attackerMorale: 1, defenderMorale: 1, supply: 1,`,
'campaign regime metadata');

const tickNeedle = `export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random, options = {}) {`;
const captureHelper = `export function resolveRegimeConflictCapture(campaign, attacker, defender, polities, regions, currentTick = 0) {\n  const conflict = campaign?.regimeConflict;\n  if (!conflict || !attacker || !defender) return { resolved: false, reason: 'not_regime_conflict' };\n  const attackerPolity = sovereignPolity(attacker, polities);\n  const defenderPolity = sovereignPolity(defender, polities);\n  const sides = new Set([conflict.incumbentPolityId, conflict.revolutionaryPolityId]);\n  if (!attackerPolity || !defenderPolity || attackerPolity.id === defenderPolity.id ||\n      !sides.has(attackerPolity.id) || !sides.has(defenderPolity.id)) {\n    return { resolved: false, reason: 'conflict_sides_changed' };\n  }\n  const wasCapital = defenderPolity.capitalRegionId === defender.id;\n  const result = transferRegion(defender, defenderPolity, attackerPolity, regions, polities, currentTick, 'regime_civil_war');\n  if (!result.transferred) return { resolved: false, reason: result.reason || 'transfer_failed' };\n\n  // Civil-war territory is held by a rival central government, not granted as\n  // a near-independent vassal. Administration is contested but direct.\n  defender.governance.relationship = defender.id === attackerPolity.capitalRegionId ? 'core' : 'integrated';\n  defender.governance.autonomy = defender.id === attackerPolity.capitalRegionId ? 0 : 0.42;\n  defender.governance.administrativeControl = defender.id === attackerPolity.capitalRegionId ? 1 : 0.52;\n  defender.governance.tributeRate = 0;\n  defender.controllingActorId = attackerPolity.capitalRegionId;\n\n  let newSeatRegionId = null;\n  const remaining = regions.filter((region) => region.governance?.sovereignPolityId === defenderPolity.id);\n  if (wasCapital && remaining.length) {\n    const newSeat = [...remaining].sort((a, b) => (b.population || 0) - (a.population || 0))[0];\n    defenderPolity.capitalRegionId = newSeat.id;\n    defenderPolity.rulerRegionId = newSeat.id;\n    defenderPolity.continuity ||= {};\n    defenderPolity.continuity.seatRegionId = newSeat.id;\n    defenderPolity.continuity.status = 'claimant';\n    newSeatRegionId = newSeat.id;\n  }\n\n  campaign.settlementResolved = true;\n  campaign.settlementQueued = true;\n  campaign.outcome = 'region_lost';\n  campaign.regimeConflictCapture = {\n    tick: currentTick,\n    regionId: defender.id,\n    fromPolityId: defenderPolity.id,\n    toPolityId: attackerPolity.id,\n    wasCapital,\n    newSeatRegionId,\n  };\n  return { resolved: true, ...campaign.regimeConflictCapture };\n}\n\n${tickNeedle}`;
campaigns = replaceOnce(campaigns, tickNeedle, captureHelper, 'regime capture helper');

const settlementNeedle = `    if (campaign.phase === 'returning' && campaign.outcome === 'submission_pending' && !campaign.settlementResolved && !campaign.settlementQueued) {`;
const settlementInsert = `    if (campaign.phase === 'returning' && campaign.outcome === 'submission_pending' && !campaign.settlementResolved && !campaign.settlementQueued && campaign.regimeConflict) {\n      const capture = resolveRegimeConflictCapture(campaign, attacker, defender, polities, regionList, currentTick);\n      if (capture.resolved) {\n        events.push({\n          type: 'regime_civil_war_region_captured',\n          campaign,\n          ...capture,\n          attackerName: attacker.name,\n          defenderName: defender.name,\n          summary: \`${'${attacker.name}'} captured ${'${defender.name}'} for its side of the revolutionary civil war.\`,\n        });\n      } else {\n        campaign.settlementResolved = true;\n        campaign.settlementQueued = true;\n        campaign.outcome = 'withdrawn';\n      }\n    }\n${settlementNeedle}`;
campaigns = replaceOnce(campaigns, settlementNeedle, settlementInsert, 'regime settlement');
fs.writeFileSync(campaignsPath, campaigns);

const mainPath = 'js/main.js';
let main = fs.readFileSync(mainPath, 'utf8');
const continuityImport = `import { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, lobbyForRestoration, plausibleGovernedRegions, rejectSettlementOffer, restorationBacking, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';`;
main = replaceOnce(main, continuityImport,
`${continuityImport}\nimport { tickRegimeCivilWars } from './politics/regimeCivilWar.js?v=20260917-regime-war1';`,
'civil war import');

const medievalNeedle = `    const medievalPoliticalEvents = profiler.measure('Medieval politics', () => tickMedievalInstitutions(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));`;
const civilWarBlock = `    const regimeCivilWarEvents = profiler.measure('Regime civil wars', () =>\n      tickRegimeCivilWars(polities, regions, activeCampaigns, calendarWeek, Math.random, { playerPolityId: activePlayerPolityId }));\n    for (const civilWarEvent of regimeCivilWarEvents) {\n      if (civilWarEvent.type !== 'regime_civil_war_resolved' || civilWarEvent.loserPolityId !== activePlayerPolityId) continue;\n      const exileSeat = civilWarEvent.hostRegionId || polityById(polities, activePlayerPolityId)?.continuity?.seatRegionId || null;\n      if (exileSeat && regionsById.has(exileSeat)) {\n        playerRegionId = exileSeat;\n        selectedRegion = regionsById.get(exileSeat);\n        map.selectedId = exileSeat;\n        fogOfWar.setPlayerRegion(exileSeat);\n        map.refreshLayer();\n      }\n    }\n${medievalNeedle}`;
main = replaceOnce(main, medievalNeedle, civilWarBlock, 'civil war tick');

const playerEventsNeedle = `      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),`;
main = replaceOnce(main, playerEventsNeedle,
`${playerEventsNeedle}\n      ...regimeCivilWarEvents.filter((event) => event.playerRelevant),`,
'civil war player events');
fs.writeFileSync(mainPath, main);

console.log('Applied revolutionary civil-war campaign integration.');
