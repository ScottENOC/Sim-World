from pathlib import Path
p=Path('js/economy/laborCore.js')
s=p.read_text()
def rep(old,new):
    global s
    if old not in s: raise SystemExit('missing patch anchor: '+old[:100])
    s=s.replace(old,new,1)

rep("const ORE_YIELD_PER_MINER = 3.0;\nconst BRONZE_PER_SMITH = 2.0;", """const ORE_YIELD_PER_MINER = 3.0;
const COPPER_ORE_PER_METAL = 8;
const TIN_ORE_PER_METAL = 10;
const NONFERROUS_METAL_PER_SMELTER = 1.5;
const SMELTING_WOOD_PER_METAL = 0.5;
const BRONZE_COPPER_PER_UNIT = 0.9;
const BRONZE_TIN_PER_UNIT = 0.1;
const BRONZE_PER_SMITH = 2.0;""")
rep("const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };", "const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };\nconst METAL_SALE_BUFFER = { copper: 200, tin: 100 };")
rep("const TEXTILES_PER_WORKER = 0.4;", """const TEXTILES_PER_WORKER = 0.4;
const CLOTHES_PER_TAILOR = 0.5;
const TEXTILES_PER_CLOTHING = 1;
const CLOTHING_PER_PERSON_TARGET = 0.4;
const CLOTHING_ANNUAL_WEAR = 0.45;""")
rep("  textileWorker: { enter: 0.02, exit: 0.015, deadband: 0.07 },\n  smith:", "  textileWorker: { enter: 0.02, exit: 0.015, deadband: 0.07 },\n  tailor:        { enter: 0.02, exit: 0.015, deadband: 0.07 },\n  smelter:       { enter: 0.015, exit: 0.010, deadband: 0.08 },\n  smith:")
rep("  'basic_boat', 'advanced_boat'\n];", "  'basic_boat', 'advanced_boat', 'clothes'\n];")
rep("  const potteryBroken = (region.stockpile.pottery || 0) * weeklyAttrition(POTTERY_ANNUAL_BREAKAGE);\n  region.stockpile.pottery = Math.max(0, (region.stockpile.pottery || 0) - potteryBroken);\n  report.maintenance = { boatLosses: navyWear.lost + fishingWear.lost, potteryBroken };", """  const potteryBroken = (region.stockpile.pottery || 0) * weeklyAttrition(POTTERY_ANNUAL_BREAKAGE);
  region.stockpile.pottery = Math.max(0, (region.stockpile.pottery || 0) - potteryBroken);
  const clothesWornOut = (region.stockpile.clothes || 0) * weeklyAttrition(CLOTHING_ANNUAL_WEAR);
  region.stockpile.clothes = Math.max(0, (region.stockpile.clothes || 0) - clothesWornOut);
  report.maintenance = { boatLosses: navyWear.lost + fishingWear.lost, potteryBroken, clothesWornOut };""")
rep("  const textileTarget = region.population * 0.002 + advancedDemandBoats * ADVANCED_BOAT_COST.textiles;\n  const pitchWanted", """  const clothingTarget = region.population * CLOTHING_PER_PERSON_TARGET;
  const clothingGap = Math.max(0, clothingTarget - (region.stockpile.clothes || 0));
  const textileTarget = region.population * 0.002 + advancedDemandBoats * ADVANCED_BOAT_COST.textiles +
    Math.min(clothingGap, region.population * 0.01) * TEXTILES_PER_CLOTHING;
  const pitchWanted""")
rep("  remainingSurplus -= pitchWorkers + textileWorkers;\n  report.materialCrafts = { workers: Math.round(pitchWorkers + textileWorkers), pitch: pitchMade, textiles: textilesMade };", """  remainingSurplus -= pitchWorkers + textileWorkers;
  const tailorAvailable = Math.max(0, Math.min(remainingSurplus * 0.05,
    (region.stockpile.textiles || 0) / TEXTILES_PER_CLOTHING));
  const tailorTarget = Math.min(tailorAvailable, clothingGap / CLOTHES_PER_TAILOR);
  const tailors = persistentWorkforce(region, 'tailor', tailorTarget, tailorAvailable,
    { impossible: (region.stockpile.textiles || 0) <= 0 && textilesMade <= 0 });
  const clothesMade = Math.min(tailors * CLOTHES_PER_TAILOR,
    (region.stockpile.textiles || 0) / TEXTILES_PER_CLOTHING);
  region.stockpile.textiles = (region.stockpile.textiles || 0) - clothesMade * TEXTILES_PER_CLOTHING;
  region.stockpile.clothes = (region.stockpile.clothes || 0) + clothesMade;
  accumulateExperience(region, 'textiles', tailors * 0.5);
  remainingSurplus -= tailors;
  report.materialCrafts = { workers: Math.round(pitchWorkers + textileWorkers + tailors),
    pitch: pitchMade, textiles: textilesMade, clothes: clothesMade, tailors: Math.round(tailors) };""")
rep("    copper: isBronzeWorkshop ? Math.max(0, desiredBronzeOutput * 2 - (region.stockpile.copper || 0)) : 0,\n    tin: isBronzeWorkshop ? Math.max(0, desiredBronzeOutput - (region.stockpile.tin || 0)) : 0,", """    copperOre: isBronzeWorkshop ? Math.max(0,
      (desiredBronzeOutput * BRONZE_COPPER_PER_UNIT + METAL_SALE_BUFFER.copper - (region.stockpile.copper || 0)) * COPPER_ORE_PER_METAL -
      (region.stockpile.copperOre || 0)) : 0,
    tinOre: isBronzeWorkshop ? Math.max(0,
      (desiredBronzeOutput * BRONZE_TIN_PER_UNIT + METAL_SALE_BUFFER.tin - (region.stockpile.tin || 0)) * TIN_ORE_PER_METAL -
      (region.stockpile.tinOre || 0)) : 0,
    copper: isBronzeWorkshop ? 0 : Math.max(0, desiredBronzeOutput * BRONZE_COPPER_PER_UNIT - (region.stockpile.copper || 0)),
    tin: isBronzeWorkshop ? 0 : Math.max(0, desiredBronzeOutput * BRONZE_TIN_PER_UNIT - (region.stockpile.tin || 0)),""")
rep("    textiles: Math.max(0, textileTarget - (region.stockpile.textiles || 0)),\n    horses:", "    textiles: Math.max(0, textileTarget - (region.stockpile.textiles || 0)),\n    clothes: Math.max(0, clothingTarget - (region.stockpile.clothes || 0)),\n    horses:")
rep("  const copperTarget = region.deposits.copper\n    ? Math.max(desiredBronzeOutput * 2, MINE_SALE_BUFFER.copper)\n    : desiredBronzeOutput * 2;\n  const tinTarget = region.deposits.tin\n    ? Math.max(desiredBronzeOutput, MINE_SALE_BUFFER.tin)\n    : desiredBronzeOutput;", """  const copperMetalTarget = region.deposits.copper
    ? Math.max(desiredBronzeOutput * BRONZE_COPPER_PER_UNIT, METAL_SALE_BUFFER.copper)
    : desiredBronzeOutput * BRONZE_COPPER_PER_UNIT;
  const tinMetalTarget = region.deposits.tin
    ? Math.max(desiredBronzeOutput * BRONZE_TIN_PER_UNIT, METAL_SALE_BUFFER.tin)
    : desiredBronzeOutput * BRONZE_TIN_PER_UNIT;
  const copperTarget = copperMetalTarget * COPPER_ORE_PER_METAL;
  const tinTarget = tinMetalTarget * TIN_ORE_PER_METAL;""")
rep("  const copperNeeded = Math.max(0, copperTarget - (region.stockpile.copper || 0));\n  const tinNeeded = Math.max(0, tinTarget - (region.stockpile.tin || 0));", "  const copperNeeded = Math.max(0, copperTarget - (region.stockpile.copperOre || 0) -\n    (region.stockpile.copper || 0) * COPPER_ORE_PER_METAL);\n  const tinNeeded = Math.max(0, tinTarget - (region.stockpile.tinOre || 0) -\n    (region.stockpile.tin || 0) * TIN_ORE_PER_METAL);")
rep("    region.stockpile[key] = (region.stockpile[key] || 0) + gathered;", "    const stockKey = key === 'copper' ? 'copperOre' : key === 'tin' ? 'tinOre' : key;\n    region.stockpile[stockKey] = (region.stockpile[stockKey] || 0) + gathered;")
rep("  report.mining = { workers: Math.round(minersUsed), ...minedThisTick };\n\n  // --- Smithing: bronze and iron share one workforce", """  report.mining = { workers: Math.round(minersUsed), ...minedThisTick };

  // Ore is refined near the furnace. Gangue and slag never enter the metal
  // stockpile, so transporting refined copper/tin is much cheaper than ore.
  const copperMetalWanted = Math.max(0, copperMetalTarget - (region.stockpile.copper || 0));
  const tinMetalWanted = Math.max(0, tinMetalTarget - (region.stockpile.tin || 0));
  const maxCopperFromOre = (region.stockpile.copperOre || 0) / COPPER_ORE_PER_METAL;
  const maxTinFromOre = (region.stockpile.tinOre || 0) / TIN_ORE_PER_METAL;
  const metalSmeltTarget = Math.min(copperMetalWanted, maxCopperFromOre) + Math.min(tinMetalWanted, maxTinFromOre);
  const smelterAvailable = Math.max(0, remainingSurplus * 0.08);
  const smelterTarget = Math.min(smelterAvailable, metalSmeltTarget / NONFERROUS_METAL_PER_SMELTER);
  const smelters = persistentWorkforce(region, 'smelter', smelterTarget, smelterAvailable,
    { impossible: (region.stockpile.copperOre || 0) <= 0 && (region.stockpile.tinOre || 0) <= 0 });
  const smeltingCapacity = smelters * NONFERROUS_METAL_PER_SMELTER;
  const desiredMetalTotal = Math.max(0.0001, copperMetalWanted + tinMetalWanted);
  let copperSmelted = Math.min(copperMetalWanted, maxCopperFromOre, smeltingCapacity * copperMetalWanted / desiredMetalTotal);
  let tinSmelted = Math.min(tinMetalWanted, maxTinFromOre, Math.max(0, smeltingCapacity - copperSmelted));
  const fuelLimitedMetal = (region.stockpile.wood || 0) / SMELTING_WOOD_PER_METAL;
  const totalSmeltedPreFuel = copperSmelted + tinSmelted;
  if (totalSmeltedPreFuel > fuelLimitedMetal && totalSmeltedPreFuel > 0) {
    const scale = fuelLimitedMetal / totalSmeltedPreFuel; copperSmelted *= scale; tinSmelted *= scale;
  }
  const totalSmelted = copperSmelted + tinSmelted;
  region.stockpile.copperOre = (region.stockpile.copperOre || 0) - copperSmelted * COPPER_ORE_PER_METAL;
  region.stockpile.tinOre = (region.stockpile.tinOre || 0) - tinSmelted * TIN_ORE_PER_METAL;
  region.stockpile.wood = (region.stockpile.wood || 0) - totalSmelted * SMELTING_WOOD_PER_METAL;
  region.stockpile.copper = (region.stockpile.copper || 0) + copperSmelted;
  region.stockpile.tin = (region.stockpile.tin || 0) + tinSmelted;
  report.smelting = { workers: Math.round(smelters), copper: copperSmelted, tin: tinSmelted,
    copperOreUsed: copperSmelted * COPPER_ORE_PER_METAL, tinOreUsed: tinSmelted * TIN_ORE_PER_METAL };

  // --- Smithing: bronze and iron share one workforce""")
rep("  const maxBronzeByCopper = (region.stockpile.copper || 0) / 2; // recipe: 2 copper + 1 tin -> 1 bronze\n  const maxBronzeByTin = (region.stockpile.tin || 0) / 1;", "  const maxBronzeByCopper = (region.stockpile.copper || 0) / BRONZE_COPPER_PER_UNIT;\n  const maxBronzeByTin = (region.stockpile.tin || 0) / BRONZE_TIN_PER_UNIT;")
rep("  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * 2;\n  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade * 1;", "  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * BRONZE_COPPER_PER_UNIT;\n  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade * BRONZE_TIN_PER_UNIT;")
rep("  const leftover = Math.round(Math.max(0, surplus - lumberjacks - pitchWorkers - textileWorkers -\n    boatMakerCareerCount - minerCareerCount - desiredSmithsLabor - potteryLaborReserve));", "  const leftover = Math.round(Math.max(0, surplus - lumberjacks - pitchWorkers - textileWorkers - tailors -\n    boatMakerCareerCount - minerCareerCount - smelters - desiredSmithsLabor - potteryLaborReserve));")
rep("    textileWorker: Math.round(textileWorkers),\n    potter:", "    textileWorker: Math.round(textileWorkers),\n    tailor: Math.round(tailors),\n    smelter: Math.round(smelters),\n    potter:")
p.write_text(s)
