import { localPrice } from './prices.js?v=20260905-goods1';

// Tools are physical counts, not a permanent development score. NEW tools sit
// in region.stockpile under their tool id and can be traded. Once issued they
// move to region.equipment and ordinary merchants can no longer sell them.
const MAX_ADOPTION_RATE_PER_WEEK = 0.02;
const IRON_MAX_RELATIVE_VALUE_COST = 0.65;
const IRON_SMELTING_COST_MULTIPLIER = 2.5;
const EXPORT_ORDER_SHARE_PER_WEEK = 0.25;
const ANNUAL_TOOL_ATTRITION = {
  farmer: 0.08,
  miner: 0.08,
  lumberjack: 0.07,
  soldier: 0.10,
};

export function wearOutTools(region) {
  let lost = 0;
  for (const [occupation, equipment] of Object.entries(region.equipment || {})) {
    const annualRate = ANNUAL_TOOL_ATTRITION[occupation] ?? 0.04;
    const weeklyRate = 1 - Math.pow(1 - annualRate, 1 / 52);
    for (const [toolId, count] of Object.entries(equipment || {})) {
      const wornOut = Math.max(0, count) * weeklyRate;
      equipment[toolId] = Math.max(0, count - wornOut);
      lost += wornOut;
    }
  }
  return lost;
}

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

function workersPerTool(definition) {
  return Math.max(1, definition.workersPerTool || 1);
}

export function materialUnitCost(region, material) {
  if (material === 'bronze') return localPrice(region, 'copper') * 2 + localPrice(region, 'tin');
  if (material === 'iron') return localPrice(region, 'ironOre') * IRON_SMELTING_COST_MULTIPLIER;
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

export function toolEfficiencyMultiplier(region, occupation, toolDefs, unlockedTechIds) {
  const definitions = availableDefinitions(toolDefs, unlockedTechIds)
    .slice().sort((a, b) => b.productivityBonus - a.productivityBonus);
  const prevHeadcount = region.occupations?.[occupation] || 0;
  if (prevHeadcount <= 0) return 1;
  let workersRemaining = prevHeadcount;
  let bonus = 0;
  for (const definition of definitions) {
    const owned = region.equipment[occupation]?.[definition.id] || 0;
    const used = Math.min(workersRemaining, owned * workersPerTool(definition));
    bonus += (used / prevHeadcount) * definition.productivityBonus;
    workersRemaining -= used;
    if (workersRemaining <= 0) break;
  }
  return 1 + bonus;
}

export function desiredToolInvestment(region, occupation, headcount, toolDefs, unlockedTechIds,
  materialAvailability = { bronze: true, iron: true }) {
  if (headcount <= 0) return { materialWanted: 0, material: null, tier: null, newToolsWanted: 0, manufactureWanted: 0 };
  const definitions = availableDefinitions(toolDefs, unlockedTechIds);
  const choice = chooseMaterialDefinition(region, definitions, materialAvailability);
  if (!choice) return { materialWanted: 0, material: null, tier: null, newToolsWanted: 0, manufactureWanted: 0 };

  const totalEquipped = definitions.reduce((sum, definition) => sum +
    (region.equipment[occupation]?.[definition.id] || 0) * workersPerTool(definition), 0);
  const unequipped = Math.max(0, headcount - totalEquipped);
  const adoptionCap = Math.max(1, Math.round(headcount * MAX_ADOPTION_RATE_PER_WEEK));
  const workersToEquip = Math.min(unequipped, adoptionCap);
  const newToolsWanted = Math.ceil(workersToEquip / workersPerTool(choice.definition));

  // Neighbouring unmet demand is an order signal to workshops. Only a share is
  // chased each week so one reported shortage cannot instantly redirect a whole
  // smithing economy.
  const externalOrders = Math.max(0, region._externalManufacturedDemand?.[choice.definition.id] || 0);
  const exportToolsWanted = Math.ceil(externalOrders * EXPORT_ORDER_SHARE_PER_WEEK);
  const inventory = Math.max(0, region.stockpile?.[choice.definition.id] || 0);
  const manufactureWanted = Math.max(0, newToolsWanted + exportToolsWanted - inventory);
  const materialCost = definitionMaterialCost(choice.definition);
  return {
    materialWanted: manufactureWanted * materialCost,
    material: choice.material,
    tier: choice.definition,
    newToolsWanted,
    manufactureWanted,
  };
}

export function investInTools(region, occupation, want, materialAvailableForThis) {
  if (!want.tier) return 0;
  const toolId = want.tier.id;
  if (!region.stockpile) region.stockpile = {};
  if (!region.equipment[occupation]) region.equipment[occupation] = {};

  // First issue already-manufactured stock, including imported tools.
  let localNeed = Math.max(0, want.newToolsWanted || 0);
  const issuedFromInventory = Math.min(localNeed, Math.max(0, region.stockpile[toolId] || 0));
  if (issuedFromInventory > 0) {
    region.stockpile[toolId] -= issuedFromInventory;
    region.equipment[occupation][toolId] = (region.equipment[occupation][toolId] || 0) + issuedFromInventory;
    localNeed -= issuedFromInventory;
  }

  const materialCost = definitionMaterialCost(want.tier);
  if (materialCost <= 0 || materialAvailableForThis <= 0 || (want.manufactureWanted || 0) <= 0) return 0;
  const maxByMaterial = Math.floor(materialAvailableForThis / materialCost);
  const toolsMade = Math.min(Math.max(0, want.manufactureWanted || 0), maxByMaterial);
  if (toolsMade <= 0) return 0;
  region.stockpile[toolId] = (region.stockpile[toolId] || 0) + toolsMade;

  // Local users get first claim on newly made stock. Anything beyond current
  // local adoption remains NEW inventory and is available to merchants.
  const newlyIssued = Math.min(localNeed, toolsMade);
  if (newlyIssued > 0) {
    region.stockpile[toolId] -= newlyIssued;
    region.equipment[occupation][toolId] = (region.equipment[occupation][toolId] || 0) + newlyIssued;
  }
  return toolsMade * materialCost;
}
