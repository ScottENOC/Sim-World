import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Could not find ${label} patch point`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Found multiple ${label} patch points`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const mainPath = 'js/main.js';
let main = fs.readFileSync(mainPath, 'utf8');
const continuityLine = "    const continuityEvents = profiler.measure('Political continuity', () => tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId }));";
const handoff = `${continuityLine}\n    // A successful player coup/revolution keeps the displaced government as the\n    // player's political actor. Move the private player-region pointer to its\n    // exile host, or to the surviving incumbent seat when a revolution splits\n    // the country, before any later UI/AI phase reads the old capital.\n    for (const politicalEvent of continuityEvents) {\n      if (politicalEvent.polityId !== activePlayerPolityId) continue;\n      let nextPlayerRegionId = null;\n      if (politicalEvent.type === 'coup_succeeded' || politicalEvent.type === 'revolution_succeeded') {\n        nextPlayerRegionId = politicalEvent.hostRegionId || polityById(polities, activePlayerPolityId)?.continuity?.seatRegionId || null;\n      } else if (politicalEvent.type === 'revolution_civil_war_started') {\n        const currentPlayerRegion = regionsById.get(playerRegionId);\n        if (currentPlayerRegion?.governance?.sovereignPolityId !== activePlayerPolityId) {\n          nextPlayerRegionId = politicalEvent.incumbentSeatRegionId || polityById(polities, activePlayerPolityId)?.continuity?.seatRegionId || null;\n        }\n      }\n      if (nextPlayerRegionId && regionsById.has(nextPlayerRegionId)) {\n        playerRegionId = nextPlayerRegionId;\n        selectedRegion = regionsById.get(nextPlayerRegionId);\n        map.selectedId = nextPlayerRegionId;\n        fogOfWar.setPlayerRegion(nextPlayerRegionId);\n        map.refreshLayer();\n      }\n    }`;
main = replaceOnce(main, continuityLine, handoff, 'main political-continuity');
fs.writeFileSync(mainPath, main);

const regimePath = 'js/politics/regimeChange.js';
let regime = fs.readFileSync(regimePath, 'utf8');
const playerSuppression = `\n    // The direct resolver is symmetric and fully supports the player polity.\n    // Automatic live overthrow of the player is deferred until main.js has an\n    // explicit handoff that can move the player's private current-region pointer\n    // into exile/civil-war territory. NPCs can safely resolve immediately now.\n    if (polity.id === options.playerPolityId) {\n      if (Math.max(revolutionHazard, coupHazard) > 0) {\n        events.push({\n          type: 'player_regime_crisis',\n          polityId: polity.id,\n          assessment,\n          summary: \`Political crisis is acute: revolution risk \${Math.round(assessment.revolutionRisk * 100)}%, coup risk \${Math.round(assessment.coupRisk * 100)}%. A player-facing regime-change handoff is required before automatic overthrow is enabled.\`,\n          playerRelevant: true,\n        });\n      }\n      continue;\n    }\n`;
regime = replaceOnce(regime, playerSuppression, '\n', 'player regime suppression');
regime = replaceOnce(regime, '    event.playerRelevant = false;', '    event.playerRelevant = polity.id === options.playerPolityId;', 'player relevance');
fs.writeFileSync(regimePath, regime);

const continuityPath = 'js/politics/continuity.js';
let continuity = fs.readFileSync(continuityPath, 'utf8');
continuity = replaceOnce(continuity, '\nconst PLAYER_REGIME_WARNING_INTERVAL_WEEKS = 52;\n', '\n', 'warning interval');
const warningFilter = `  const rawRegimeEvents = tickRegimeChange(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);\n  const regimeEvents = rawRegimeEvents.filter((event) => {\n    if (event.type !== 'player_regime_crisis') return true;\n    const polity = (polities || []).find((candidate) => candidate.id === event.polityId);\n    if (!polity) return false;\n    polity.institutionalCrisis ||= {};\n    const lastWarning = polity.institutionalCrisis.lastPlayerRegimeWarningTick;\n    if (Number.isFinite(lastWarning) && currentTick - lastWarning < PLAYER_REGIME_WARNING_INTERVAL_WEEKS) return false;\n    polity.institutionalCrisis.lastPlayerRegimeWarningTick = currentTick;\n    return true;\n  });`;
continuity = replaceOnce(continuity, warningFilter, '  const regimeEvents = tickRegimeChange(polities, regions, currentTick, elapsedDays, options.rng || Math.random, options);', 'player warning filter');
fs.writeFileSync(continuityPath, continuity);

console.log('Applied player regime handoff patches.');
