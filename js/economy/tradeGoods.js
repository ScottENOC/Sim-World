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
  copperOre:  { label: 'Copper ore', basePrice: 0.7, referenceStock: 12000, category: 'raw_material', cargoKgPerUnit: 1 },
  tinOre:     { label: 'Tin ore', basePrice: 1.8, referenceStock: 8000, category: 'raw_material', cargoKgPerUnit: 1 },
  copper:     { label: 'Copper metal', basePrice: 8, referenceStock: 2000, category: 'material', cargoKgPerUnit: 1 },
  tin:        { label: 'Tin metal', basePrice: 20, referenceStock: 1000, category: 'material', cargoKgPerUnit: 1 },
  ironOre:    { label: 'Iron ore', basePrice: 2, referenceStock: 10000, category: 'raw_material', cargoKgPerUnit: 1 },
  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },
  bronze:     { label: 'Bronze', basePrice: 60, referenceStock: 500, category: 'material', cargoKgPerUnit: 1 },
  iron:       { label: 'Iron', basePrice: 24, referenceStock: 1500, category: 'material', cargoKgPerUnit: 1 },
  clay:       { label: 'Clay', basePrice: 0.08, referenceStock: 5000, category: 'bulk', cargoKgPerUnit: 5 },
  pottery:    { label: 'Pottery', basePrice: 1.2, referenceStock: 3000, category: 'manufactured', cargoKgPerUnit: 1.5 },
  pitch:      { label: 'Pitch', basePrice: 2.5, referenceStock: 300, category: 'manufactured', cargoKgPerUnit: 1 },
  textiles:   { label: 'Textiles', basePrice: 4, referenceStock: 300, category: 'manufactured', cargoKgPerUnit: 0.5 },
  clothes:    { label: 'Clothing', basePrice: 7, referenceStock: 600, category: 'consumer_good', cargoKgPerUnit: 0.6 },
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
