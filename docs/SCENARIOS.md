# Scenario architecture

Sim-World supports campaigns with different geographic resolution, starting states, pacing and victory conditions without forking the simulation code.

## Scenario layers

A scenario defines four independent layers:

1. **Map package** — land regions, sea regions, navigation metadata, physical geography and resource endowments.
2. **Initial world state** — sovereignty, ownership/control, population, stockpiles, forces, infrastructure, diplomatic agreements, wars and other starting conditions.
3. **Rules/technology profile** — which systems are active and how deeply they are modelled. A WWII campaign can, for example, make cryptography, radar, signals intelligence and operational logistics much more granular than the Grand Campaign.
4. **Victory model** — the Grand Campaign can judge long-run resilience and sustainability while focused scenarios can resolve after a systemic conflict and then assess each country against its own survival and adopted objectives.

The runtime registry lives in `js/core/scenarios.js`. Startup selection lives in `js/ui/startupPicker.js`. Scenario package loading lives in `js/core/scenarioRuntime.js` and generic initial-state, sovereignty and focused-victory logic live in `scenarioState.js`, `scenarioSovereignty.js` and `scenarioVictory.js`.

## Map packages

Legacy world loaders still request `data/world/*`. Once a scenario is selected, the scenario runtime redirects only the explicit map contract to the scenario's `mapBaseUrl`. Shared game definitions such as `toolTypes.json` remain on the common path rather than being accidentally shadowed by an alternate map package.

A complete scenario map should provide the same physical-world contract as the Grand Campaign where applicable:

- `regions.geo.json`
- `regions.meta.json`
- `region-navigation.json`
- `resources.initial.json`
- `terrain.initial.json`
- `seaRegions.geo.json`
- `seaRegions.meta.json`
- `spatial.base.json`
- `majorRivers.real.json`

Scenario packages can additionally provide files such as `initial-state.json`, `sovereignty.json`, `technology-profile.json`, `faction-balance.json`, `pressure-events.json`, `playability.json` and `victory.json`.

`tools/build-fractured-2027-map.mjs` provides a reproducible way to make an independent baseline snapshot from the current Grand Campaign physical map. That copied baseline can then diverge through scenario-specific strategic splits/merges without changing `data/world/`. `data/scenarios/fractured-2027/world/strategic-regions.json` records where 2027 needs different operational resolution.

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
- **European Defence Coalition** — EU participants, the United Kingdom, Canada and Ukraine. It has large aggregate economic and demographic capacity, but begins in a two-front conflict with disrupted logistics and incomplete transitions away from Russian fossil-fuel dependence and United States military imports.
- **Eurasian Accommodation** — China, Russia, Iran and North Korea. This is not a formal alliance. They begin by avoiding conflict with each other and may coordinate or trade opportunistically, while retaining distinct interests and no automatic shared-war obligation.

The opening crises are fixed: the United States occupies Greenland; Denmark, EU participants, the UK and Canada are at war with the United States; Russia's war in Ukraine continues; the United States and Iran are at war; and China blockades Taiwan without automatically entering a shooting war with the United States.

Middle powers begin largely uncommitted. They may align, remain neutral, mediate, trade, sanction, offer bases, deny access or exploit the crisis according to simulated incentives. Strategic camps are descriptive starting geometries rather than permanent teams.

### Sovereignty and playable countries

Every sovereign country represented by the scenario map is intended to be playable. Strategic camps and coalitions coordinate countries but do not replace country sovereignty; in particular, EU member states remain separate playable polities rather than being collapsed into an `european-union` country.

The ordinary Grand Campaign creates one polity per starting region. `scenarioSovereignty.js` therefore consolidates scenario-map regions into modern sovereign countries using `region-navigation.json` plus `sovereignty.json` aliases and capital overrides. Temporary occupation and front-line control remain separate from sovereignty and are applied by the initial-state layer.

Australia is a regression case for a country outside the three opening camps: it can remain neutral, align later, mediate, provide basing or guarantees, or enter a war. Those choices are simulated and voluntarily adopted commitments become part of the country's outcome.

### Country-centred victory

The focused campaign resolves after there has been no active war between members of the three principal opening camps for 180 consecutive simulated days. Unrelated local wars do not prevent the scenario from resolving indefinitely.

Resolution is not one global faction-win flag. Each playable country is assessed separately on:

- sovereign continuity;
- territorial security;
- human security;
- economic resilience; and
- diplomatic or military objectives that government actually adopted during play.

Temporary occupation can continue through political-continuity/government-in-exile mechanics. Permanent annexation or political extinction is defeat. A neutral state does not receive arbitrary conquest objectives merely because other powers are fighting.

### Balance philosophy

The focused scenarios use **asymmetric balance**, not equalised statistics. A faction can be stronger overall but face more theatres, worse logistics, weaker coalition cohesion or greater economic exposure. Balance should emerge from trade-offs such as force projection versus local concentration, industrial depth versus import dependence, and coalition size versus decision-making friction.

Anti-snowball mechanics should remain systemic: occupation costs, garrison requirements, long supply lines, alliance access, war exhaustion, sanctions substitution, shipping risk and balancing behaviour by threatened neutral powers. Do not grant arbitrary combat bonuses to a weaker faction simply to keep the match close.

### Pressure events rather than scripted history

`pressure-events.json` defines event families that create dilemmas without prescribing outcomes. Examples include coalition disputes, elections, supply-chain shocks, basing requests, shipping losses, cable incidents, mobilisation debates, cyber attribution, humanitarian crises, mediation efforts and nuclear signalling.

Events should normally be triggered by simulated state. A fixed opening window is acceptable for consequences that logically follow immediately from the scenario premise, but even those events should present choices. Countries should not be scripted to join factions or collapse on predetermined dates.

## Remaining implementation sequence

1. Expose the live polity array to scenario bootstrap early enough that modern-country sovereignty consolidation occurs before ordinary political systems begin ticking.
2. Generate the independent `fractured-2027/world/` baseline package and begin applying the strategic splits/merges in `strategic-regions.json`.
3. Seed modern ownership/control, population/economy, armed forces, bases, stockpiles, logistics and the opening Greenland/Ukraine/Iran/Taiwan situations.
4. Change alternate-scenario startup from continent → country → region to a country-first selector, with optional capital/start-region choice only where useful.
5. Add focused-scenario pacing so days-per-tick is scenario-controlled rather than inferred solely from world development.
6. Feed `faction-balance.json` and `pressure-events.json` into diplomacy/AI/event systems and connect the focused-victory evaluator to end-game UI.
7. Repeat the machinery with a historically researched `wwii-1939` map and initial state.
