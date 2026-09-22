import { tickCryptographyProgression } from './cryptographyProgression.js?v=20260923-crypto1';
import { tickInternationalAiStatecraft } from './aiStatecraft.js?v=20260923-ai-statecraft1';
import { applyAdditionalAiGovernanceMeasures } from './aiGovernanceMeasures.js?v=20260923-ai-governance2';
import { tickAiIncidentDiplomacy } from './aiIncidentDiplomacy.js?v=20260923-ai-incidents1';

export function tickAiStatecraftRuntime(world,currentTick=0,elapsedDays=7,rng=Math.random){
  const cryptoEvents=tickCryptographyProgression(world.regions||[],currentTick,elapsedDays,rng);
  const statecraftEvents=tickInternationalAiStatecraft(world,currentTick,elapsedDays,rng);
  applyAdditionalAiGovernanceMeasures(world,elapsedDays);
  const incidentEvents=tickAiIncidentDiplomacy(world,currentTick,elapsedDays,rng);
  world.aiStatecraftRecentEvents=[...cryptoEvents,...statecraftEvents,...incidentEvents].slice(-40);
  return [...cryptoEvents,...statecraftEvents,...incidentEvents];
}
