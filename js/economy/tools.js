import { localPrice } from './prices.js?v=20260903-iron1';

// Tools are durable counts, not a development score. Bronze and iron are
// alternative materials: bronze remains the better tool, while iron becomes
// attractive when abundant ore makes it substantially cheaper.
const MAX_ADOPTION_RATE_PER_WEEK = 0.02;
const IRON_MAX_RELATIVE_VALUE_COST = 0.65;
const IRON_SMELTING_COST_MULTIPLIER = 2.5;

function availableDefinitions(toolDefs, unlockedTechIds) {
  return toolDefs.filter((definition) => (
    definition.requiredTechId === null || unlockedTechIds.has(definition.requiredTechId)
  ));
}

function definitionMaterial(definition) {
  return definition.material || (definition.bronzeCost !== undefined ? 'bronze' : null);
}

function definitionMaterialCost(definition) {
  return definition.materialCost ?? definition.bronzeCost ?? 0;
}

// Raw-input scarcity is the closest thing the current economy has to a
// production price. Iron includes a smelting difficulty premium; even so,
// abundant iron ore can make it much cheaper than scarce copper plus tin.
export function materialUnitCost(region, material) {
  if (material === 'bronze') {
    return localPrice(region, 'copper') * 2 + localPrice(region, 'tin');
  }
  if (material === 'iron') {
    return localPrice(region, 'ironOre') * IRON_SMELTING_COST_MULTIPLIER;
  }
  return Infinity;
}

function chooseMaterialDefinition(region, definitions, materialAvailability) {
  const candidates = definitions
    .filter((definition) => materialAvailability[definitionMaterial(definition)] !== false)
    .map((definition) => {
      const material = definitionMaterial(definition);
      const productivity = Math.max(0.001, definition.productivityBonus || 0);
      const valueCost = definitionMaterialCost(definition) * materialUnitCost(region, material) / productivity;
      return { definition, material, valueCost };
    });

  const bronze = candidates.find((candidate) => candidate.material === 'bronze');
  const iron = candidates.find((candidate) => candidate.material === 'iron');
  if (!bronze) return iron || candidates[0] || null;
  if (!iron) return bronze;
  return iron.valueCost <= bronze.valueCost * IRON_MAX_RELATIVE_VALUE_COST ? iron : bronze;
}

// Equipment of different materials can coexist. Workers use the strongest
// tools first, then progressively weaker ones; owning iron never makes a
// region discard superior bronze equipment.
export function toolEfficiencyMultiplier(region, occupation, toolDefs, unlockedTechIds) {
  const definitions = availableDefinitions(toolDefs, unlockedTechIds)
    .slice()
    .sort((a, b) => b.productivityBonus - a.productivityBonus);
  const prevHeadcount = region.occupations?.[occupation] || 0;
  if (prevHeadcount <= 0) return 1;

  let workersRemaining = prevHeadcount;
  let bonus = 0;
  for (const definition of definitions) {
    const owned = region.equipment[occupation]?.[definition.id] || 0;
    const used = Math.min(workersRemaining, owned);
    bonus += (used / prevHeadcount) * definition.productivityBonus;
    workersRemaining -= used;
    if (workersRemaining <= 0) break;
  }
  return 1 + bonus;
}

export function desiredToolInvestment(
  region,
  occupation,
  headcount,
  toolDefs,
  unlockedTechIds,
  materialAvailability = { bronze: true, iron: true }
) {
  if (headcount <= 0) return { materialWanted: 0, material: null, tier: null, newToolsWanted: 0 };
  const definitions = availableDefinitions(toolDefs, unlockedTechIds);
  const choice = chooseMaterialDefinition(region, definitions, materialAvailability);
  if (!choice) return { materialWanted: 0, material: null, tier: null, newToolsWanted: 0 };

  const totalEquipped = definitions.reduce(
    (sum, definition) => sum + (region.equipment[occupation]?.[definition.id] || 0),
    0
  );
  const unequipped = Math.max(0, headcount - totalEquipped);
  const adoptionCap = Math.max(1, Math.round(headcount * MAX_ADOPTION_RATE_PER_WEEK));
  const newToolsWanted = Math.min(unequipped, adoptionCap);
  const materialCost = definitionMaterialCost(choice.definition);
  return {
    materialWanted: newToolsWanted * materialCost,
    material: choice.material,
    tier: choice.definition,
    newToolsWanted,
  };
}

export function investInTools(region, occupation, want, materialAvailableForThis) {
  if (!want.tier || want.materialWanted <= 0 || materialAvailableForThis <= 0) return 0;
  const materialCost = definitionMaterialCost(want.tier);
  const materialSpent = Math.min(want.materialWanted, materialAvailableForThis);
  const toolsBought = Math.floor(materialSpent / materialCost);
  if (toolsBought <= 0) return 0;
  if (!region.equipment[occupation]) region.equipment[occupation] = {};
  region.equipment[occupation][want.tier.id] = (region.equipment[occupation][want.tier.id] || 0) + toolsBought;
  return toolsBought * materialCost;
}
