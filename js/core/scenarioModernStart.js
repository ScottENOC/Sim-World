const arr = (value) => Array.isArray(value) ? value : [];
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const max = (a, b) => Math.max(num(a), num(b));

function mergedSettings(profile, countryId) {
  return { ...(profile?.regionalDefaults || {}), ...(profile?.countryOverrides?.[countryId] || {}) };
}

export function applyModernScenarioBaseline(world, profile = {}) {
  const regions = arr(world?.regions);
  const commonTechIds = arr(profile.commonTechIds);
  const populationMultiplier = Math.max(1, num(profile.populationMultiplier, 1));
  const touchedCountries = new Set();

  for (const region of regions) {
    const countryId = region.scenarioCountryId || region.governance?.scenarioCountryId || null;
    const settings = mergedSettings(profile, countryId);
    if (countryId) touchedCountries.add(countryId);

    if (!region.scenarioModernBaselineApplied) {
      region.population = Math.max(1, Math.round(num(region.population, 1) * populationMultiplier));
      region.scenarioModernBaselineApplied = true;
    }

    region.unlockedTechIds ||= new Set();
    for (const techId of commonTechIds) region.unlockedTechIds.add(techId);

    region.electricity ||= {};
    region.electricity.service = max(region.electricity.service, settings.electricityService);
    region.electricity.industrialService = max(region.electricity.industrialService, settings.industrialElectricityService);

    region.structuralTransformation ||= {};
    region.structuralTransformation.capability ||= {};
    region.structuralTransformation.capability.manufacture = max(
      region.structuralTransformation.capability.manufacture,
      settings.manufacturingCapability,
    );

    region.industrialSupply ||= {};
    region.industrialSupply.capability ||= {};
    region.industrialSupply.inventory ||= {};
    region.industrialSupply.capability.precision_machining = max(
      region.industrialSupply.capability.precision_machining,
      settings.precisionMachiningCapability,
    );

    region.industrialPlants ||= {};
    region.industrialPlants.componentCapability ||= {};
    region.industrialPlants.componentCapability.electronics = max(
      region.industrialPlants.componentCapability.electronics,
      settings.electronicsCapability,
    );
    region.industrialPlants.componentCapability.radio_navigation = max(
      region.industrialPlants.componentCapability.radio_navigation,
      settings.radioNavigationCapability,
    );
    region.industrialPlants.componentCapability.optics = max(
      region.industrialPlants.componentCapability.optics,
      settings.opticsCapability,
    );

    const population = num(region.population, 1);
    region.treasury = max(region.treasury, population * num(settings.treasuryPerPerson));
    region.stockpile ||= {};
    region.stockpile.steel = max(region.stockpile.steel, population * num(settings.steelStockPerPerson));
    region.stockpile.aviation_fuel = max(region.stockpile.aviation_fuel, population * num(settings.aviationFuelStockPerPerson));
    region.stockpile.advanced_rechargeable_cells = max(region.stockpile.advanced_rechargeable_cells, population * num(settings.batteryCellsPerPerson));
    region.stockpile.lithium_ion_cells = max(region.stockpile.lithium_ion_cells, population * num(settings.batteryCellsPerPerson));
    region.industrialSupply.inventory.machine_components = max(
      region.industrialSupply.inventory.machine_components,
      population * num(settings.machineComponentsPerPerson),
    );

    region.army ||= { personnel: 0, away: 0 };
    region.army.personnel = max(region.army.personnel, population * num(settings.standingForceShare));
    region.targetArmySize = max(region.targetArmySize, region.army.personnel);

    if (num(settings.orbitalSupport) > 0) {
      region.orbitalSupport ||= {};
      region.orbitalSupport.droneBeyondLineOfSightControl = max(region.orbitalSupport.droneBeyondLineOfSightControl, settings.orbitalSupport);
      region.orbitalSupport.navigation = max(region.orbitalSupport.navigation, settings.orbitalSupport);
    }
  }

  world.scenarioModernBaseline = {
    applied: true,
    scenarioId: profile.scenarioId || world?.scenarioState?.id || null,
    regionCount: regions.length,
    countryCount: touchedCountries.size,
    calibrationOnly: true,
  };
  return world.scenarioModernBaseline;
}
