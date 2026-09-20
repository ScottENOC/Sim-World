// Central catalogue for things that can move through ordinary merchant trade.
// A manufactured good remains here only while it is NEW inventory. Once a
// tool is issued to workers or a boat is commissioned, it leaves stockpile
// inventory and becomes an operational asset; ordinary merchants cannot sell
// used equipment out from under its current users.
//
// cargoKgPerUnit is deliberately separate from price and production units.
// Trade capacity is physical carrying mass: processing/refining can discard
// gangue, slag, offcuts and moisture at the production site, so finished goods
// normally move less cargo mass than the raw material stream that made them.
// Production units are still game abstractions, so these are calibration masses,
// not claims that every stockpile unit literally equals one kilogram.

export const TRADE_GOODS = {
  food:       { label: 'Food', basePrice: 0.2, referenceStock: 50000, category: 'bulk', cargoKgPerUnit: 1 },
  wood:       { label: 'Wood', basePrice: 0.5, referenceStock: 5000, category: 'bulk', cargoKgPerUnit: 4 },
  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk', cargoKgPerUnit: 8 },
  coal:       { label: 'Coal', basePrice: 0.9, referenceStock: 12000, category: 'bulk_fuel', cargoKgPerUnit: 2.5 },
  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },
  natural_gas:{ label: 'Pipeline natural gas', basePrice: 1.9, referenceStock: 7000, category: 'gaseous_fuel', cargoKgPerUnit: 0.72 },
  lng:        { label: 'Liquefied natural gas', basePrice: 2.6, referenceStock: 4200, category: 'bulk_fuel', cargoKgPerUnit: 1.25 },
  lamp_fuel:  { label: 'Lamp & heating fuel', basePrice: 2.8, referenceStock: 3200, category: 'refined_fuel', cargoKgPerUnit: 1.2 },
  petrol:     { label: 'Petrol', basePrice: 3.4, referenceStock: 2600, category: 'refined_fuel', cargoKgPerUnit: 1.0 },
  diesel:     { label: 'Diesel & distillate', basePrice: 3.1, referenceStock: 3000, category: 'refined_fuel', cargoKgPerUnit: 1.05 },
  heavy_fuel_oil: { label: 'Heavy fuel oil', basePrice: 2.2, referenceStock: 4200, category: 'refined_fuel', cargoKgPerUnit: 1.15 },
  aviation_fuel: { label: 'Aviation fuel', basePrice: 4.6, referenceStock: 1200, category: 'refined_fuel', cargoKgPerUnit: 0.95 },
  copperOre:  { label: 'Copper ore', basePrice: 0.7, referenceStock: 12000, category: 'raw_material', cargoKgPerUnit: 1 },
  tinOre:     { label: 'Tin ore', basePrice: 1.8, referenceStock: 8000, category: 'raw_material', cargoKgPerUnit: 1 },
  copper:     { label: 'Copper metal', basePrice: 8, referenceStock: 2000, category: 'material', cargoKgPerUnit: 1 },
  tin:        { label: 'Tin metal', basePrice: 20, referenceStock: 1000, category: 'material', cargoKgPerUnit: 1 },
  ironOre:    { label: 'Iron ore', basePrice: 2, referenceStock: 10000, category: 'raw_material', cargoKgPerUnit: 1 },
  bauxite:    { label: 'Bauxite', basePrice: 1.2, referenceStock: 9000, category: 'raw_material', cargoKgPerUnit: 1.5 },
  alumina:    { label: 'Alumina', basePrice: 5.5, referenceStock: 2400, category: 'processed_material', cargoKgPerUnit: 1 },
  aluminium:  { label: 'Aluminium', basePrice: 16, referenceStock: 1200, category: 'material', strategic: true, cargoKgPerUnit: 1 },
  titanium_minerals: { label: 'Titanium minerals', basePrice: 2.4, referenceStock: 3200, category: 'raw_material', cargoKgPerUnit: 1.4 },
  titanium_dioxide: { label: 'Titanium dioxide pigment', basePrice: 9, referenceStock: 1200, category: 'industrial_chemical', cargoKgPerUnit: 0.8 },
  titanium:   { label: 'Titanium metal', basePrice: 95, referenceStock: 220, category: 'advanced_material', strategic: true, cargoKgPerUnit: 1 },
  uranium_ore: { label: 'Uranium ore', basePrice: 7, referenceStock: 700, category: 'raw_material', strategic: true, cargoKgPerUnit: 2.2 },
  uranium_concentrate: { label: 'Uranium concentrate', basePrice: 48, referenceStock: 140, category: 'processed_material', strategic: true, cargoKgPerUnit: 0.8 },
  reactor_fuel: { label: 'Civilian reactor fuel', basePrice: 190, referenceStock: 45, category: 'advanced_material', strategic: true, cargoKgPerUnit: 0.25 },
  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },
  silver:     { label: 'Silver', basePrice: 6, referenceStock: 900, category: 'raw_material', cargoKgPerUnit: 0.35 },
  saltpetre:  { label: 'Saltpetre', basePrice: 5, referenceStock: 1200, category: 'raw_material', cargoKgPerUnit: 1 },
  sulfur:     { label: 'Sulfur', basePrice: 4, referenceStock: 800, category: 'raw_material', cargoKgPerUnit: 1 },
  silk:       { label: 'Silk', basePrice: 18, referenceStock: 250, category: 'luxury', cargoKgPerUnit: 0.15 },
  salt:       { label: 'Salt', basePrice: 1.4, referenceStock: 2400, category: 'preservation', cargoKgPerUnit: 1 },
  pepper:     { label: 'Pepper', basePrice: 16, referenceStock: 120, category: 'luxury', cargoKgPerUnit: 0.12 },
  cinnamon:   { label: 'Cinnamon', basePrice: 20, referenceStock: 80, category: 'luxury', cargoKgPerUnit: 0.10 },
  tea:        { label: 'Tea', basePrice: 9, referenceStock: 240, category: 'luxury', cargoKgPerUnit: 0.15 },
  coffee:     { label: 'Coffee', basePrice: 13, referenceStock: 180, category: 'luxury', cargoKgPerUnit: 0.14 },
  cloves:     { label: 'Cloves', basePrice: 34, referenceStock: 45, category: 'luxury', cargoKgPerUnit: 0.08 },
  nutmeg:     { label: 'Nutmeg and mace', basePrice: 38, referenceStock: 40, category: 'luxury', cargoKgPerUnit: 0.08 },
  bronze:     { label: 'Bronze', basePrice: 60, referenceStock: 500, category: 'material', cargoKgPerUnit: 1 },
  iron:       { label: 'Iron', basePrice: 24, referenceStock: 1500, category: 'material', cargoKgPerUnit: 1 },
  steel:      { label: 'Steel', basePrice: 70, referenceStock: 350, category: 'material', strategic: true, cargoKgPerUnit: 1 },
  clay:       { label: 'Clay', basePrice: 0.08, referenceStock: 5000, category: 'bulk', cargoKgPerUnit: 5 },
  pottery:    { label: 'Pottery', basePrice: 1.2, referenceStock: 3000, category: 'manufactured', cargoKgPerUnit: 1.5 },
  pitch:      { label: 'Pitch', basePrice: 2.5, referenceStock: 300, category: 'manufactured', cargoKgPerUnit: 1 },
  textiles:   { label: 'Textiles', basePrice: 4, referenceStock: 300, category: 'manufactured', cargoKgPerUnit: 0.5 },
  clothes:    { label: 'Clothing', basePrice: 7, referenceStock: 600, category: 'consumer_good', cargoKgPerUnit: 0.6 },
  motor_vehicle: { label: 'Motor vehicles', basePrice: 80, referenceStock: 90, category: 'civilian_equipment', cargoKgPerUnit: 900 },

  // Computing is deliberately decomposed into tradeable stages. This permits
  // design, precision-tooling, fabrication, packaging and final assembly to
  // specialise in different regions, creating real supply-chain dependencies.
  electronic_grade_silicon: { label: 'Electronic-grade silicon', basePrice: 18, referenceStock: 180, category: 'advanced_material', strategic: true, cargoKgPerUnit: 0.35 },
  industrial_polymers: { label: 'Industrial polymers', basePrice: 8, referenceStock: 500, category: 'advanced_material', cargoKgPerUnit: 0.45 },
  electronic_components: { label: 'Electronic components', basePrice: 35, referenceStock: 180, category: 'precision_component', strategic: true, cargoKgPerUnit: 0.08 },
  lithography_equipment: { label: 'Lithography equipment', basePrice: 900, referenceStock: 8, category: 'precision_capital_equipment', strategic: true, cargoKgPerUnit: 140 },
  semiconductor_wafers: { label: 'Processed semiconductor wafers', basePrice: 260, referenceStock: 40, category: 'precision_component', strategic: true, cargoKgPerUnit: 0.03 },
  packaged_chips: { label: 'Packaged integrated circuits', basePrice: 420, referenceStock: 70, category: 'precision_component', strategic: true, cargoKgPerUnit: 0.01 },
  computers: { label: 'Computers', basePrice: 700, referenceStock: 50, category: 'civilian_equipment', strategic: true, cargoKgPerUnit: 18 },

  horses:     { label: 'Horses', basePrice: 18, referenceStock: 100, category: 'livestock', cargoKgPerUnit: 60 },

  // New civilian tools. Issued/used tools live under region.equipment instead
  // and are intentionally NOT trade goods. A finished tool is much easier to
  // carry than the ore/fuel/material stream required to produce it.
  bronze_plough: { label: 'New bronze-tipped plough', basePrice: 36, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 2 },
  iron_plough:   { label: 'New iron-tipped plough', basePrice: 15, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 2 },
  bronze_picks:  { label: 'New bronze picks & chisels', basePrice: 54, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 3 },
  iron_picks:    { label: 'New iron picks & chisels', basePrice: 22, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 3 },
  bronze_axes:   { label: 'New bronze axes', basePrice: 36, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 2 },
  iron_axes:     { label: 'New iron axes', basePrice: 15, referenceStock: 120, category: 'civilian_equipment', cargoKgPerUnit: 2 },

  // New civilian hulls can be sold before commissioning for fishing or trade.
  basic_boat:    { label: 'New basic boat', basePrice: 130, referenceStock: 24, category: 'civilian_equipment', cargoKgPerUnit: 250 },
  advanced_boat: { label: 'New advanced boat', basePrice: 450, referenceStock: 12, category: 'civilian_equipment', cargoKgPerUnit: 600 },

  // Strategic goods exist as market inventory, but Bronze Age default policy
  // prohibits their export. A policy can selectively permit them later.
  bronze_weapons: { label: 'New bronze weapons & armour', basePrice: 145, referenceStock: 100, category: 'military_equipment', strategic: true, cargoKgPerUnit: 5 },
  iron_weapons:   { label: 'New iron weapons & armour', basePrice: 60, referenceStock: 100, category: 'military_equipment', strategic: true, cargoKgPerUnit: 5 },
  gunpowder:      { label: 'Gunpowder', basePrice: 28, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 1 },
  firearms:       { label: 'Firearms', basePrice: 95, referenceStock: 120, category: 'military_equipment', strategic: true, cargoKgPerUnit: 4 },
  small_arms_ammunition: { label: 'Small-arms ammunition', basePrice: 12, referenceStock: 500, category: 'military_supply', strategic: true, cargoKgPerUnit: 0.35 },
  artillery_shells: { label: 'Artillery shells', basePrice: 38, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 4.5 },
  artillery_rockets: { label: 'Artillery rockets', basePrice: 46, referenceStock: 160, category: 'military_supply', strategic: true, cargoKgPerUnit: 5.2 },
  torpedoes: { label: 'Torpedoes', basePrice: 85, referenceStock: 60, category: 'military_supply', strategic: true, cargoKgPerUnit: 12 },
  naval_mines: { label: 'Naval mines', basePrice: 44, referenceStock: 120, category: 'military_supply', strategic: true, cargoKgPerUnit: 18 },
  siege_equipment:{ label: 'New siege equipment', basePrice: 500, referenceStock: 10, category: 'military_equipment', strategic: true, cargoKgPerUnit: 500 },
  warship:        { label: 'New warship', basePrice: 900, referenceStock: 8, category: 'military_equipment', strategic: true, cargoKgPerUnit: 1200 },
};

export const TRADABLE_RESOURCES = Object.keys(TRADE_GOODS);

export function tradeGood(resource) {
  return TRADE_GOODS[resource] || null;
}

export function cargoKgPerUnit(resource) {
  return Math.max(0.01, TRADE_GOODS[resource]?.cargoKgPerUnit || 1);
}

export function defaultExportAllowed(resource) {
  return !TRADE_GOODS[resource]?.strategic;
}

export function isStrategicTradeGood(resource) {
  return Boolean(TRADE_GOODS[resource]?.strategic);
}
