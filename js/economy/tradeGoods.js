// Central catalogue for things that can move through ordinary merchant trade.
// A manufactured good remains here only while it is NEW inventory. Once a
// tool is issued to workers or a boat is commissioned, it leaves stockpile
// inventory and becomes an operational asset; ordinary merchants cannot sell
// used equipment out from under its current users.

export const TRADE_GOODS = {
  food:       { label: 'Food', basePrice: 0.2, referenceStock: 50000, category: 'bulk' },
  wood:       { label: 'Wood', basePrice: 0.5, referenceStock: 5000, category: 'bulk' },
  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk' },
  copper:     { label: 'Copper', basePrice: 8, referenceStock: 2000, category: 'raw_material' },
  tin:        { label: 'Tin', basePrice: 20, referenceStock: 1000, category: 'raw_material' },
  ironOre:    { label: 'Iron ore', basePrice: 2, referenceStock: 10000, category: 'raw_material' },
  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material' },
  bronze:     { label: 'Bronze', basePrice: 60, referenceStock: 500, category: 'material' },
  iron:       { label: 'Iron', basePrice: 24, referenceStock: 1500, category: 'material' },
  clay:       { label: 'Clay', basePrice: 0.08, referenceStock: 5000, category: 'bulk' },
  pottery:    { label: 'Pottery', basePrice: 1.2, referenceStock: 3000, category: 'manufactured' },
  pitch:      { label: 'Pitch', basePrice: 2.5, referenceStock: 300, category: 'manufactured' },
  textiles:   { label: 'Textiles', basePrice: 4, referenceStock: 300, category: 'manufactured' },
  horses:     { label: 'Horses', basePrice: 18, referenceStock: 100, category: 'livestock' },

  // New civilian tools. Issued/used tools live under region.equipment instead
  // and are intentionally NOT trade goods.
  bronze_plough: { label: 'New bronze-tipped plough', basePrice: 36, referenceStock: 120, category: 'civilian_equipment' },
  iron_plough:   { label: 'New iron-tipped plough', basePrice: 15, referenceStock: 120, category: 'civilian_equipment' },
  bronze_picks:  { label: 'New bronze picks & chisels', basePrice: 54, referenceStock: 120, category: 'civilian_equipment' },
  iron_picks:    { label: 'New iron picks & chisels', basePrice: 22, referenceStock: 120, category: 'civilian_equipment' },
  bronze_axes:   { label: 'New bronze axes', basePrice: 36, referenceStock: 120, category: 'civilian_equipment' },
  iron_axes:     { label: 'New iron axes', basePrice: 15, referenceStock: 120, category: 'civilian_equipment' },

  // New civilian hulls can be sold before commissioning for fishing or trade.
  basic_boat:    { label: 'New basic boat', basePrice: 130, referenceStock: 24, category: 'civilian_equipment' },
  advanced_boat: { label: 'New advanced boat', basePrice: 450, referenceStock: 12, category: 'civilian_equipment' },

  // Strategic goods exist as market inventory, but Bronze Age default policy
  // prohibits their export. A later policy layer can selectively permit them.
  bronze_weapons: { label: 'New bronze weapons & armour', basePrice: 145, referenceStock: 100, category: 'military_equipment', strategic: true },
  iron_weapons:   { label: 'New iron weapons & armour', basePrice: 60, referenceStock: 100, category: 'military_equipment', strategic: true },
  siege_equipment:{ label: 'New siege equipment', basePrice: 500, referenceStock: 10, category: 'military_equipment', strategic: true },
  warship:        { label: 'New warship', basePrice: 900, referenceStock: 8, category: 'military_equipment', strategic: true },
};

export const TRADABLE_RESOURCES = Object.keys(TRADE_GOODS);

export function tradeGood(resource) {
  return TRADE_GOODS[resource] || null;
}

export function defaultExportAllowed(resource) {
  return !TRADE_GOODS[resource]?.strategic;
}

export function isStrategicTradeGood(resource) {
  return Boolean(TRADE_GOODS[resource]?.strategic);
}
