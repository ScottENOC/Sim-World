# Scenario architecture

Sim-World supports campaigns with different geographic resolution, starting states, pacing and victory conditions without forking the simulation code.

## Scenario layers

A scenario is intended to define four independent layers:

1. **Map package** — land regions, sea regions, navigation metadata, physical geography and resource endowments.
2. **Initial world state** — ownership/control, population, stockpiles, forces, infrastructure, diplomatic agreements, wars and other starting conditions.
3. **Rules/technology profile** — which systems are active and how deeply they are modelled. A WWII campaign can, for example, make cryptography, radar, signals intelligence and operational logistics much more granular than the Grand Campaign.
4. **Victory model** — the Grand Campaign can judge long-run resilience and sustainability while focused war scenarios can end through military control/surrender conditions.

The runtime registry lives in `js/core/scenarios.js`. Startup selection lives in `js/ui/startupPicker.js`.

## Map packages

Legacy world loaders still request `data/world/*`. Once a scenario is selected, the scenario runtime redirects those requests to the scenario's `mapBaseUrl`. This means existing economic, political and military systems do not need scenario-specific file paths.

A complete scenario map should provide the same world-file contract as the Grand Campaign where applicable:

- `regions.geo.json`
- `regions.meta.json`
- `region-navigation.json`
- `resources.initial.json`
- `terrain.initial.json`
- `seaRegions.geo.json`
- `seaRegions.meta.json`
- `spatial.base.json`
- `majorRivers.real.json`

Scenario-specific loaders may later add optional files such as `initial-state.json`, `technology-profile.json` and `victory.json`.

## Grand Campaign

The Grand Campaign remains the production scenario. It uses enduring geography under `data/world/`, starts in 1300 BCE and is intended to run to roughly 2050 CE. Its end state is about leaving the player's country and humanity on a durable path to future prosperity and safety rather than simply conquering the map.

## World War II

`wwii-1939` is reserved for a 1939–1945 focused campaign. It should use a dedicated 1939 map instead of forcing historically specific political borders into the enduring Grand Campaign regions. Its intended victory model is military surrender/control.

Likely systems to deepen include:

- cryptography, codebreaking and signals intelligence;
- radar and air-defence networks;
- mobilisation and war production;
- operational supply and fuel;
- submarine warfare and convoy protection;
- air/naval basing and sortie generation;
- intelligence uncertainty and deception.

The target pace is roughly 30 real hours for about six simulated years, so turns can represent days rather than the months/years common in much of the Grand Campaign.

## Fractured World (2027 alternate history)

`fractured-2027` is explicitly fictional alternate history. Its proposed opening state is:

- the United States has invaded and occupied Greenland;
- the EU and United Kingdom are at war with the United States in defence of Denmark/Greenland;
- Russia's war in Ukraine continues;
- China has imposed a blockade on Taiwan;
- middle powers begin largely uncommitted and may align, remain neutral, mediate or pursue their own interests through simulation decisions.

This scenario should use a modern strategic map with ownership and control initialised from scenario data. The goal is not to script an outcome: the opening crisis is fixed, while subsequent alignment, escalation and settlement should emerge from the ordinary diplomacy, economics, domestic politics and military systems.

## Next implementation tranche

1. Author the first `fractured-2027/world/` map package.
2. Add generic scenario `initial-state.json` hydration after the ordinary region/polity constructors run.
3. Seed modern countries, Greenland occupation, active wars and the Taiwan blockade.
4. Add focused-scenario pacing so days-per-tick is scenario-controlled rather than inferred solely from world development.
5. Add scenario-specific victory evaluators and end-game UI.
6. Repeat with a historically researched `wwii-1939` map and initial state.
