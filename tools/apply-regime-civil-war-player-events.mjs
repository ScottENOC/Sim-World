import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Could not find ${label} patch point`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Found multiple ${label} patch points`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const path = 'js/main.js';
let source = fs.readFileSync(path, 'utf8');

const retreatBlock = `    for (const retreatEvent of campaignResult.events.filter((event) => event.type === 'claimant_retreat')) {\n      if (retreatEvent.defeatedPolityId === activePlayerPolityId && retreatEvent.newSeatRegionId) {\n        playerRegionId = retreatEvent.newSeatRegionId;\n        fogOfWar.setPlayerRegion(playerRegionId);\n        map.refreshLayer();\n      }\n    }`;
const captureHandoff = `${retreatBlock}\n    for (const captureEvent of campaignResult.events.filter((event) => event.type === 'regime_civil_war_region_captured')) {\n      if (captureEvent.fromPolityId !== activePlayerPolityId) continue;\n      const currentPlayerRegion = regionsById.get(playerRegionId);\n      const lostCurrentSeat = captureEvent.regionId === playerRegionId || captureEvent.wasCapital ||\n        currentPlayerRegion?.governance?.sovereignPolityId !== activePlayerPolityId;\n      if (!lostCurrentSeat) continue;\n      const nextSeat = captureEvent.newSeatRegionId || polityById(polities, activePlayerPolityId)?.continuity?.seatRegionId || null;\n      if (!nextSeat || !regionsById.has(nextSeat)) continue;\n      playerRegionId = nextSeat;\n      selectedRegion = regionsById.get(nextSeat);\n      map.selectedId = nextSeat;\n      fogOfWar.setPlayerRegion(nextSeat);\n      map.refreshLayer();\n    }`;
source = replaceOnce(source, retreatBlock, captureHandoff, 'civil-war capture handoff');

const filterNeedle = `        if (event.type === 'claimant_retreat') return event.conquerorPolityId === activePlayerPolityId || event.defeatedPolityId === activePlayerPolityId;`;
const filterReplacement = `${filterNeedle}\n        if (event.type === 'regime_civil_war_region_captured') return event.fromPolityId === activePlayerPolityId || event.toPolityId === activePlayerPolityId;`;
source = replaceOnce(source, filterNeedle, filterReplacement, 'civil-war capture event filter');

fs.writeFileSync(path, source);
console.log('Applied player-facing civil-war capture handoff.');
