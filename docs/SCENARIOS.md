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

Scenario-specific loaders may later add optional files such as `initial-state.json`, `technology-profile.json`, `faction-balance.json`, `pressure-events.json` and `victory.json`.

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

`fractured-2027` is explicitly fictional alternate history. Its opening strategic geometry is three loose camps rather than three permanent alliance teams:

- **United States** — exceptionally strong force projection and defence industry, but strategically overextended and operating with uncertain access to traditional allied logistics. It begins at war with the European defence coalition and Iran, antagonistic toward China, and unusually cooperative with Russia and North Korea.
- **European Defence Coalition** — EU participants, the United Kingdom, Canada and Ukraine. It has the largest aggregate economic and demographic base of the three camps, but begins in a two-front conflict with disrupted logistics and incomplete transitions away from Russian fossil-fuel dependence and United States military imports.
- **Eurasian Accommodation** — China, Russia, Iran and North Korea. This is not a formal alliance. They begin by avoiding conflict with each other and may coordinate or trade opportunistically, while retaining distinct interests and no automatic shared-war obligation.

The opening crises are fixed: the United States occupies Greenland; Denmark, EU participants, the UK and Canada are at war with the United States; Russia's war in Ukraine continues; the United States and Iran are at war; and China blockades Taiwan without automatically entering a shooting war with the United States.

Middle powers begin largely uncommitted. They may align, remain neutral, mediate, trade, sanction, offer bases, deny access or exploit the crisis according to simulated incentives. Strategic camps are descriptive starting geometries rather than permanent teams.

### Balance philosophy

The focused scenarios should use **asymmetric balance**, not equalised statistics. A faction can be stronger overall but face more theatres, worse logistics, weaker coalition cohesion or greater economic exposure. Balance should emerge from trade-offs such as force projection versus local concentration, industrial depth versus import dependence, and coalition size versus decision-making friction.

Anti-snowball mechanics should remain systemic: occupation costs, garrison requirements, long supply lines, alliance access, war exhaustion, sanctions substitution, shipping risk and balancing behaviour by threatened neutral powers. Do not grant arbitrary combat bonuses to a weaker faction simply to keep the match close.

### Pressure events rather than scripted history

`pressure-events.json` defines event families that create dilemmas without prescribing outcomes. Examples include coalition disputes, elections, supply-chain shocks, basing requests, shipping losses, cable incidents, mobilisation debates, cyber attribution, humanitarian crises, mediation efforts and nuclear signalling.

Events should normally be triggered by simulated state. A fixed opening window is acceptable for consequences that logically follow immediately from the scenario premise, but even those events should present choices. Countries should not be scripted to join factions or collapse on predetermined dates.

## Next implementation tranche

1. Add a generic scenario `initial-state.json` hydrator after the ordinary region/polity constructors run.
2. Add loaders for `faction-balance.json` and `pressure-events.json` and expose them to diplomacy/AI/event systems.
3. Author the first `fractured-2027/world/` map package, prioritising strategically important theatres rather than uniform geographic resolution.
4. Seed ownership/control, armed forces, bases, stockpiles, logistics and the opening Greenland/Ukraine/Iran/Taiwan situations.
5. Add focused-scenario pacing so days-per-tick is scenario-controlled rather than inferred solely from world development.
6. Add scenario-specific victory evaluators and end-game UI.
7. Repeat with a historically researched `wwii-1939` map and initial state.
