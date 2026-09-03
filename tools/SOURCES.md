# Data sources and licenses

## Boundaries — in use
**Natural Earth**, `ne_10m_admin_0_map_subunits` (England/Scotland/Wales/N. Ireland) and
`ne_10m_admin_0_countries` (Ireland, France, clipped to metropolitan Europe).
Public domain — no attribution required, no restriction on commercial use, ever.
Pulled from the GitHub mirror: https://github.com/nvkelso/natural-earth-vector
(same data as naturalearthdata.com; the mirror is reachable from more sandboxed
environments than the main site).

Processing: `pyshp` to read the shapefile, `shapely` to clip France to its
metropolitan extent, simplify geometry (tolerance 0.01°), compute centroids,
and derive land-border adjacency (centroid-independent — pairwise polygon
distance < 0.02°). Output: `data/world/regions.geo.json` (plain GeoJSON —
switch to TopoJSON once the region count grows past a few dozen and shared
borders start duplicating a lot of coordinate data).

## Boundaries — for when admin-1 detail is needed beyond the UK/Ireland/France slice
**geoBoundaries** — CC BY 4.0 / ODbL, commercial use and redistribution allowed
with attribution (credit "geoBoundaries (Runfola et al., 2020)" somewhere in
an about/credits screen). GitHub mirror: https://github.com/wmgeolab/geoBoundaries
Use this for large/complex countries where Natural Earth's admin-1 is coarser
than you want, or where a country needs breaking into more than one region
to stay near the "few hundred total" target.

**Avoid GADM** for this project — non-commercial license only, redistribution
needs prior permission. Not compatible with a public repo or a game you might sell.

## Climate baseline — not yet pulled
**CHELSA** (chelsa-climate.org) — CC0, fully public-domain-equivalent, so no
commercial concerns at all. Two products matter here:
- `CHELSA-climatologies` (1981–2010 monthly normals, 1km) for "current" climate.
- `CHELSA-TraCE21k` (downscaled temperature/precipitation since the Last
  Glacial Maximum, in centennial steps) — this one actually gives a real
  paleoclimate estimate for a Bronze Age start, rather than assuming today's
  climate held constant back to 1200 BCE.
Not reachable from this sandbox's network allowlist — chelsa-climate.org isn't
on it. Download manually and drop the rasters in `tools/raw-data/`, or paste
the region-level values back into the chat and I'll write them into
`regions.meta.json` directly.

## Resources — not yet pulled
**USGS Mineral Resources Data System (MRDS)** — public domain, US government
work. mrdata.usgs.gov isn't reachable from this sandbox either; same plan as
climate — manual download or pasted values.

## Currency — design decision, not yet coded
No universal currency at game start. Real Western Europe in the Bronze Age
wasn't monetized — no coinage anywhere until roughly 600 BCE (Lydia), and
that doesn't reach Britain/Ireland until Roman contact over a thousand years
later. What these regions actually had was direct exchange plus a handful of
"prestige goods" (bronze, gold ornaments, amber) that functioned as informal
stores of value.

But the trade-matching algorithm still needs *some* common unit to compute
fair exchange ratios between six different goods — that's a computation
problem, not a lore problem. Plan: an abstract internal `value` ledger used
only by the trade system's matching/pricing math, not something a region
"has" or an edict can spend. Once a Currency-type tech unlocks later
(weighed-metal standard, then eventually coinage), that same ledger
*reifies* into a real, tax-able, spend-able resource — mirroring the real
barter → value-equivalence → money → coinage progression instead of assuming
money exists on day one.

## Economy calibration notes
`js/economy/labor.js` constants are first-pass placeholders, sanity-checked
by running `tickEconomy` headless for 50 simulated years before shipping:
food yield/labor-saturation constants are tuned so a region with average
land quality and average population noise comes out comfortably fed, but the
two noise terms are independent (a region can be unusually crowded *and*
only have average land) — so a couple of regions genuinely can't feed
themselves even at 100% farming, by design. Deposit sizes are scaled so
aggressive mining depletes over decades, not the single tick it did on the
first pass (population count vastly outstripped the original deposit sizes).
`MAX_SPECIALIST_FRACTION = 0.08` caps how much of a population can be
full-time non-farm specialists — without it, "surplus" labor after farming
was landing in the hundreds of thousands and strip-mining regions instantly.

## Deposit tiers and tech gates
Ore deposits (copper, tin, iron ore, gold) are no longer one smooth difficulty curve
from 100% to 0% — that implied enough labor could always get more out,
which isn't true below the water table with Bronze Age tools. Each is now
a list of tiers (`data/world/resources.initial.json`), shallowest first:
surface outcrops/alluvial placer (no tech needed) → shaft mining (needs
`shaft_mining`) → deep mining below the water table (needs `mine_drainage`,
historically an early-modern development — genuinely impossible before
proper pumping, not just "hard"). `extraction.js`'s `selectActiveTier` picks
the shallowest tier that's both tech-unlocked and not yet exhausted; once
it's empty, extraction hits a hard wall until the next tech lands — no
smooth continuation into the next tier.

Each tier also carries a `maxWorkers` cap modeling physical mine-face
capacity (there's only so much rock face regardless of population), fixed
priority weights for copper/tin/iron/gold/stone instead of splitting miners by
raw remaining tonnage (stone is so much more abundant it was swallowing the
whole miner pool), and a proper water-filling allocator (`allocateWithCaps`
in `labor.js`) so labor that a capped-out resource turns away correctly
flows to whichever resource still has room, rather than either overshooting
a cap or vanishing.

`region.unlockedTechIds` now receives the `iron_smelting` breakthrough, but
shaft mining and mine drainage still have no discovery mechanic. Those deeper
tiers therefore remain untouched no matter how long you run the current build.
Confirmed with a 1000-year headless run before shipping: surface tiers for
well-endowed regions deplete over roughly 100-300 years, shaft/deep sit at
100% the entire time, and famine-stability regions (no labor surplus to
spare) never mine at all.

## Tool-driven demand, co-optimized mining+smithing
Smith count used to be gated by a boolean "is there copper sitting in the
stockpile right now" check evaluated at the start of the tick, before that
same tick's mining had run — a one-tick-stale signal that oscillated
between ~0 and tens of thousands of smiths, since smithing would either not
run at all or run once and instantly drain the whole stockpile.

Replaced with actual demand: `economy/tools.js` tracks equipment as real
tool counts per occupation (`region.equipment.farmer.bronze_plough`, not a
single "development score"), and lets a shared implement set support a small
work team (ten farmers per plough team, three miners/lumberjacks per set and
two soldiers per weapon set). It gives the supported workers a
productivity bonus (lagged one tick — this tick's efficiency is based on
last tick's headcount/equipment, which avoids solving a circular "how many
farmers, how equipped are they" system simultaneously), and computes how
much tool metal each occupation wants to spend equipping more of itself this
tick, capped at 2% newly-equipped per week so adoption takes real time.
Farmer, lumberjack, and miner demand (miner's own headcount is lagged too,
since it isn't decided until later in the same tick) plus a small baseline
and a `region.militaryBronzeDemand` stub sum to a demand target *before*
mining runs. `labor.js` then mines enough copper/tin or iron ore to cover the
selected tool demand (subject to tier caps), before falling back to background
priority mining for stone/gold/spare capacity. Smithing is bounded by labor and
actual input availability — never a stock-existence boolean.

`region.equipment[occupation]` stores physical tools. Tools now wear out at
roughly 4% annually (6% for military equipment), so copper/tin disruption
eventually reaches farms, mines and armies through failed replacement. If a
workforce shrinks, unused tools remain available, but still deteriorate.

Mines maintain a modest sale buffer for copper/tin instead of extracting into
permanent mountains of unsold ore. Additional production follows sales and
workshop demand; only stone and gold retain background extraction. Workshops
form where both inputs meet, persist as their shared smithing skill grows, and
respond to unmet finished-bronze demand in neighbouring markets.

## Iron working
Iron ore uses the same surface/shaft/deep structure as copper and tin, but is
deliberately abundant and has broader workable mine faces. Deposits are visible
before the breakthrough, but commercial mining begins only once a region can
smelt the ore; this prevents centuries of pre-breakthrough stockpiling.

`technology/breakthroughs.js` makes `iron_smelting` a probabilistic discrete
breakthrough rather than another point on the learning curve. Independent
discovery is extremely rare across the map, becomes more likely as a region's
existing `smithing` experience grows, and diffuses much faster through partners
with whom it has actually traded in the last two years once one of them knows
the technique. The player's own discovery pauses the clock and opens a
prominent event.

Bronze and iron production both add to the same `smithing` experience. Iron
tools are weaker equivalents of bronze tools, not a superior tier. New tools
use iron only if its raw-input cost per unit of productivity is at least 35%
better than bronze, or if accessible bronze cannot be supplied; existing
bronze tools remain in service and are used before weaker iron equipment.

## Full employment note
"General" population is not an artificial cap anymore — the flat 8%
specialist-fraction ceiling from the previous session is gone, replaced by
each occupation's *actual* capacity (mine-face size, forest size, real
bronze demand). Realistically this still means most of the population ends
up in "general" (unspecialized subsistence work) — that's not a bug, it's
what a real Bronze Age economy looked like; full-time craft specialism was
always a small minority until industrialization changed the capacity math.
A genuine, fully price-cleared labor market (where general population could,
say, bid into trade-facilitation roles) is future work tied to the eventual
trade/currency system.

## Trade, currency, and traders
`economy/prices.js` gives every region a local scarcity-based price per
resource (falls smoothly as that region's own stock rises — not a cleared
market price, just enough of a signal to make goods flow from abundant
regions to scarce ones). `economy/trade.js` computes route cost per region
pair — land-adjacent pairs get a small flat cost, everything else uses a
great-circle distance calculated on demand from the two stored region
centroids. Merchant chains can reach mutually-known markets in a cached,
breadth-first neighbourhood capped at 32 candidates; this avoids returning to
an all-regions-per-region weekly scan on a much larger map. One percent of
working labour is reserved for carriers before mines/workshops allocate their
surplus. Three settlement rounds let a region spend exports earned earlier in
the same week without treating that timing as long-term credit. Currency is
`region.wallet` (populace, active in trade) and `region.treasury` (government,
inert until taxation/edicts exist), both seeded proportional to population.

One real calibration bug caught before shipping: the first version of
`routeCost` was almost an order of magnitude too large relative to the price
scale (a ~700km sea route cost more than the maximum possible price gap for
any good), so nothing was ever profitable enough to trade. Fixed by
rescaling `LAND_ADJACENT_COST` and `SEA_COST_PER_KM` down to where real
routes can clear real price gaps.

Regions now retain a one-year exponential history of imports, exports and
route reliability. Credit is intentionally tiny: at most two weeks of recent
export income and never more than population × 0.002, only 4% of the current
population × 0.05 starting cash seed. Export receipts service debt before becoming spendable cash;
shrinking export income can put old borrowing into arrears and lower stability.
This bridges caravan timing but cannot finance a failed region through a tin
shock. Banditry reduces route capacity, raises route cost, and steals both
stock and populace wealth, so commercial failure also degrades tool replacement
and military equipment.

Regions specialise slowly. Good non-metal farmland plans a modest food export
surplus. Industrial regions do not assume week-one imports: dependence only
deepens over roughly a decade after rolling history shows food actually
arriving and non-food exports paying for it, and is capped at 25%. Unwinding a
specialisation takes roughly two generations, so a failed route cannot turn a
smithing centre back into a self-sufficient village instantly. Bronze workshops
build a commercial reserve and replace exports, allowing external demand to
pull copper and tin through intermediary smelting regions.

Stored food spoils 1% weekly and is capped at thirteen weeks of local need.
This leaves a useful seasonal reserve without allowing prosperous regions to
accumulate centuries of immortal food that nullifies a later collapse.

Copper and tin geography is deliberately sparse and procedurally assigned for
gameplay rather than claimed as historical geology: 85 of 283 regions have
copper, 25 have tin, seven have both, and 180 have neither. The accessible
surface-tin pool is deliberately small and extraction becomes uneconomic as
the remaining seams thin; deeper tiers remain technology-gated. Iron ore
remains nearly universal, but is not commercially mined until iron smelting is
discovered.

## Demographics, gathering, and famine response
Population is dynamic now, not a number set once at game start. Each region
tracks `demographics: {children, workingAge, elderly}` — a young-heavy
pre-modern age pyramid — and only `workingAge` actually labors; `population`
(everyone, including children/elderly) is what food need is based on.
`society/demographics.js` runs births (food-security modulated, and
suppressed by `region.educationLevel` once a real education system exists
to raise it above its Bronze Age baseline — the "double-edged sword"),
baseline age-specific mortality, and aging between bands, every tick.

Gathering (`economy/labor.js`) is a real profession now, not a farming
fallback: yield per gatherer is highest at low population density and
tapers as a region gets crowded — the opposite scaling from farming — which
is what lets a poor-land, low-density region like Scotland reach
subsistence without needing land quality it doesn't have. Farmers are
capped at 90% of working-age population specifically so a genuine crisis
always leaves *some* labor free for gathering rather than farming claiming
100% of the workforce and leaving nothing for the fallback that's supposed
to catch exactly that case.

Whatever food need survives farming + gathering + trade becomes genuine
famine response, split three ways (`society/demographics.js` again):
excess death, emigration, or banditry — placeholder shares (30/45/25%), not
derived from anything. Emigrants pick destinations via
`society/migration.js`, scored on "peace, land, bread" using existing
systems rather than new ones: `region.stability` for peace, inverse
population density for land, and trade's own local food price for bread,
discounted by the same route cost trade uses — most emigrants go to the
nearest genuinely-better option, distributed rather than winner-take-all.

Confirmed via a 20-year headless run before shipping: England and France
grow steadily, Ireland dips then partially recovers as it absorbs
neighbors' emigrants, and Scotland/Wales/Northern Ireland go into a real
collapse — Scotland from 117,626 to 1,849 people, stability pinned at zero.
Not patched, per the explicit design direction: a region that can't sustain
itself and has nothing left to trade is genuinely supposed to be in trouble.

One deliberately incomplete piece: `region.banditPopulation` only grows
right now — no mortality, dispersal, or suppression yet, since that's the
army system's job next pass. Numbers climbing past a region's remaining
formal population (which they do, in the collapsing regions) are expected
given what exists so far, not a bug.

## Armies, navies, and banditry suppression
Reuses the tools.js equipment machinery directly — `soldier` is just another
occupation in `toolTypes.json` with a `bronze_weapons` tier, same
adoption-rate-capped investment as farmer ploughs. `military/army.js`
handles recruitment: the player sets `region.targetArmySize` (a real input
in the region panel now), and personnel ramps toward it gradually
(`adjustArmySize`), drawing from working-age population and staying
committed — unlike farmers/miners/etc, which are freely reallocated every
tick, soldiers stay soldiers until demobilized. Navy works the same way but
the player's target is *boats*, not people; crew count
(`CREW_PER_BOAT = 8`) is derived from fleet size. Boats themselves are built
by a new `boatmaker` profession in `labor.js`, consuming wood
(`BOAT_WOOD_COST = 200`) — gated on `region.isCoastal` (true for all six
regions currently, matters once the map grows to include landlocked ones).

`military/banditry.js` is what finally gives the ever-growing bandit
population from last pass somewhere to go: `effectivePower()` (army
personnel × equipment bonus, navy counted at 30% for land defense) drives
both `region.safetyRating` and active suppression — bandit population
shrinks each week proportional to army power relative to bandit numbers,
plus a small natural attrition even with zero army. Unsuppressed banditry
raids the stockpile and causes ongoing deaths, both scaled by how unsafe
the region currently is.

**A real bug caught before shipping, not cosmetic**: army/navy personnel
were being pulled out of `workingAge` on recruitment and then existed in
total isolation from every subsequent population mechanic — famine deaths,
emigration, banditry conversion all only touched
`children/workingAge/elderly`, never `region.army.personnel`. Tested by
giving Scotland a 3,000-person army target and letting it collapse: the
army just sat at ~2,521 forever while population crashed to 2 — a phantom
force bigger than the entire remaining population. Fixed by exporting a
single `removeFromBands` from `demographics.js` (now army/navy-aware,
weighted the same as civilian working-age) that `banditry.js` also uses
instead of its own separate copy, and by adding baseline mortality for
military personnel so they're not immortal even without a famine. Re-verified:
army now shrinks correctly in lockstep with a collapsing population.

**Flagging, not silently fixing**: soldier equipment investment is
currently getting crowded out by farmer plough demand under the existing
bronze scarcity (from a few sessions back) — proportional demand-splitting
means a small military's share of an already-tiny bronze pool often rounds
down to zero tools bought per week, even over years. Verified this isn't a
regression (boat-building and recruitment both work correctly in isolation)
— it's the same scarcity dynamic already accepted for lumberjack/miner
tools, just now also affecting soldiers. Whether military equipment should
get investment priority over civilian tools is a real design call, not an
oversight, and hasn't been decided either way yet.

## Learning by doing (Bronze Age "technology")
No tech tree yet — at this era it's mostly tacit knowledge that accumulates
from actually doing the work, so `technology/learningByDoing.js` tracks
cumulative worker-effort per activity (farming, gathering, lumberjack,
mining, smithing) and derives an efficiency multiplier from it via the same
saturating-curve shape used everywhere else in this sim: fast early gains,
tapering toward a per-activity ceiling (0.25-0.50, i.e. up to +25-50% from
practice alone) that only a genuine technological leap — iron working, real
metallurgy, still future work — could ever exceed. Stacks multiplicatively
with tools.js's equipment bonus: well-practiced *and* well-equipped beats
either alone. Skill is read before this tick's experience is added, so
there's no circularity to solve.

Calibration took two passes: the first-pass halflife constants assumed
roughly similar workforce sizes across activities, which isn't true —
farming and gathering involve hundreds of thousands of workers and hit
their ceiling in under 2 years, while lumberjack (hard-capped by forest
mine-face-style capacity) involves single digits to low hundreds and barely
moved after 200 years. Rescaled each activity's halflife against its actual
typical workforce, verified with a 200-year run: England's farming climbs
to ~35% by year 50 and ~50% (ceiling) by year 200, a believable
multi-generational curve.

One emergent interaction worth flagging as correct, not broken: France's
mining and smithing skill go completely flat from roughly year 20 through
year 200 in that run — because that's when its accessible surface copper
and tin fully depleted (the tier/tech-gate system from a couple sessions
back), so mining and smithing activity actually stops. A skill can't
improve from practice that isn't happening anymore.

## Sea regions and fishing
Boundaries come from the same place as the land data: Natural Earth's
marine polygons dataset (`ne_10m_geography_marine_polys`, same GitHub
mirror as before), which carries real named seas. Pulled Irish Sea (touches
five of our six land regions — England, Scotland, Wales, N. Ireland,
Ireland — a genuine shared commons) and English Channel (England/France).
Sea regions (`world/seaRegion.js`) are much simpler than land ones: no
population or economy, just geometry, a fish stock, and which land regions
can reach it — `linkSeaAdjacency()` wires that up after both load.

Fish uses the exact same logistic regrowth as forests
(`world/resources/renewables.js`'s `regrow()`, reused directly, no new
math needed) — it already has the property you asked for: slow growth near
zero (few breeding fish) and near carrying capacity (not enough food),
fastest in between. Fishing is a third food source in `labor.js`, tried
after farming and gathering: shore fishing (no boat, lower yield, always
available if coastal) and boat fishing (needs a `fishingBoats` — separate
from the military navy, built by the same boatmaker profession from wood,
demand-driven rather than player-set like the navy target). Yield for both
scales directly with the sea's current stock fraction, so overfishing is
self-punishing — and shared: every region fishing the same sea feels it,
not just whoever did the overfishing.

**Two capacity bugs caught by simulation, not shipped blind**: first, shore
and boat fishing initially only activated when there was unmet food need
*and* gathering hadn't already claimed the entire post-farming labor
reserve — which it could, leaving literally nothing for fishing even in
Scotland, the region that needed it most. Fixed with `MAX_GATHERER_FRACTION`
(same reservation pattern as farmers). Second, and more serious: boat
fishing capacity was only limited by how many boats a region owned, and
boat-building demand had no ceiling — a 50-year run fished both seas
completely to 0% stock, with France alone running 27,145 boat fishers off
a single sea. Fixed by adding a sea-level physical capacity cap (same
"mine-face can only support so many workers" pattern as ore deposits),
fair-shared among however many land regions border that sea. Re-verified:
fish stock now equilibrates around 63-76% instead of collapsing.

Not yet done: fish caught goes straight into general food stock rather than
being tracked as its own tradeable good (real Bronze Age economies did
trade preserved fish) — a reasonable future extension, not built this pass.
Map rendering shows seas tinted by current fish stock (fades toward the void
as a sea gets fished out) but sea regions aren't tappable/selectable yet,
only land regions are.

## Raiding
The first real interaction *between* regions — everything before this was
each region running its own economy/demographics in isolation.
`military/raiding.js` handles the whole lifecycle: launch (deducts
personnel from the attacker's home army immediately, marking them "away"),
transit (real travel time — `LAND_SPEED_KM_PER_WEEK`/`SEA_SPEED_KM_PER_WEEK`
against the same on-demand centroid distances trade uses, so a raid can
genuinely take months round-trip), combat resolution on arrival, and a
separate return trip for survivors. Sea raids need a shared sea *and*
enough navy — `maxSeaRaidersAvailable = boats × 10` — a boat carries more
than just its own crew, but capacity is real and requests get capped to it,
not silently allowed through.

Combat: attacker power (raiders × equipment multiplier, reusing tools.js's
existing soldier efficiency) vs. defender power (home army × equipment ×
a 1.3x home-field advantage), producing a power ratio that drives losses on
both sides (±30% RNG variance so a stronger side can still get unlucky),
loot (a fraction of stockpile *and* wallet, scaled by how dominant the win
was, with its own randomness), and a stability hit to the defender. Losing
side takes worse losses, but nobody's ever risk-free.

The one bug this actually surfaced: `army.js`'s recruitment was measuring
the gap toward `targetArmySize` using only home personnel — send half your
army raiding and the recruiter would "see" a shortfall and start backfilling
it, silently growing your total army every time you raided. Fixed by
`region.army.away` tracking (separate from `personnel`) and measuring the
recruitment gap against home + away combined; demobilization still only
ever releases people who are actually home. Verified with a full raid
cycle: army count round-trips correctly (minus real combat losses), and
recruitment does nothing while troops are away with the target unchanged.

This finally puts the auto-pause/event-modal system to real use — it was
scaffolded in Phase 0 and has sat unused ever since. A raid resolving calls
`clock.requestAutoPause()`, queues the outcome, and only releases once the
player's clicked through every queued result.

**Explicitly not built this pass**: any AI decision-making — every raid
right now only happens because the player launched it. `launchRaid()` is
generic (works for any region as attacker), so it's ready for an AI to call,
but nothing decides *when* an NPC region should raid. Also not built:
conquest — raiding steals resources and hurts stability but never changes
`controllingActorId`; that's a bigger, separate design question about what
"taking" a region actually means given the culture/identity-strength system
that was designed early on but still hasn't been coded.

## Resources panel and economy report
Two additions to the region panel, both as collapsible `<details>` sections
so the already-long panel doesn't get worse: **Resources** shows what a
region actually has access to — land quality, forest capacity, each mineral
deposit's tiers with remaining % and lock status, and fish stock for every
adjacent sea — as opposed to the Stockpile section, which only ever showed
what's currently *stored*, not what's *available*. **Economy report** shows
last week's production broken down by activity: workers employed and
exactly what came out (food from farming vs. gathering vs. shore vs. boat
fishing kept separate, ore by resource, bronze, wood, boats built).

Required instrumenting `economy/labor.js` to actually record a
`region.report` object at each production point — it was computing all of
this already, just discarding it once it landed in the stockpile. One
correctness fix along the way: when a shared sea's fish stock caps the
total catch below what shore + boat fishing wanted, both methods now lose
proportionally in the report rather than the report showing the
pre-cap (and therefore too-high) figures.

`<details>` open/closed state doesn't survive an `innerHTML` replacement,
and this panel already replaces its content every tick to stay live — same
class of problem solved earlier for the army/navy input fields, same fix:
save each section's open state before replacing, restore it after, so a
section the player opened to actually watch doesn't silently snap shut
every second.

## Map/UI fixes: tap accuracy, close button, no-overlay view, political layer
**Tap selection on iPhone**: `mapRenderer.js`'s hit-testing used canvas
`isPointInPath(x, y)`, whose coordinate-space handling is inconsistent
enough across devices — especially at high `devicePixelRatio`, which every
iPhone has and most desktop dev environments don't — that it's the likely
cause of taps registering the wrong region. Replaced with projection
inversion + `d3.geoContains`: undo pan/zoom to get back to projection
space, invert to lon/lat, check GeoJSON containment directly. Never touches
a canvas pixel coordinate, so it's DPR-independent by construction rather
than by careful arithmetic — this class of bug shouldn't be able to
recur here.

**Close button**: `#btn-close-sheet`, hides the sheet, clears
`selectedRegion`, and clears the map's highlight border so closing doesn't
leave a region looking selected with no panel to show why.

**No-overlay map view**: tapping the *already-active* layer button now
clears the layer entirely (`map.clearLayer()`) instead of re-applying it —
plain land-green/water-blue, matching what "click Pop while Pop is already
selected" should intuitively do.

**Political/controller layer**: `mapRenderer.js`'s layer system was
gradient-only (interpolate between two colors by a numeric value), which
can't represent a categorical thing like "who controls this region."
Added a `type: 'categorical'` layer mode — distinct color per unique
value from a fixed palette, with its own swatch-list legend instead of a
gradient bar. Right now every region controls itself, so it's six distinct
colors; verified the color-assignment logic correctly gives two regions
the *same* color when they share a controller, so this is already correct
for whenever conquest exists, not just cosmetically finished today.

## Map UI fixes: tap accuracy, close button, layer toggle-off, political view
**Tap selection on iPhone**: `mapRenderer.js`'s hit-testing used canvas
`isPointInPath(x, y)`, whose coordinate-space handling is inconsistent
enough across devices — especially at high `devicePixelRatio`, which every
iPhone has and most desktop dev setups don't — that it's the likely cause
of taps registering the wrong region. Replaced with projection inversion +
`d3.geoContains`: undo pan/zoom to get back to projection space, invert to
lon/lat, check GeoJSON containment directly. Never touches a canvas pixel
coordinate, so it's DPR-independent by construction rather than by
happening to work at the DPR I tested at. Couldn't test this one on an
actual iPhone from this sandbox — worth confirming it actually fixed it for
you, not just that it's a more defensible approach.

**Close button**: `#btn-close-sheet`, top-right of the region sheet, clears
`selectedRegion` and the map's highlighted selection together so closing
the panel also deselects on the map, not just hides the panel.

**Layer toggle-off**: tapping the *already-active* layer button now clears
it back to plain land/water colors instead of doing nothing — `map.clearLayer()`.

**Political layer**: `mapRenderer.js` now supports categorical layers
(distinct color per discrete value) alongside the existing gradient ones —
`setLayer({type: 'categorical', valueFn, label})` assigns each unique
value a color from a fixed palette. `controllingActorId` is the first use;
since every region still governs itself, this currently just shows six
distinct colors, but it's the layer that'll actually matter once raiding
or future conquest can change who controls what. Legend switches to a
colored-swatch list instead of a gradient bar when the active layer is
categorical.

## Player region and AI
Game start now shows a picker (`#picker-modal`) listing all six regions —
tapping one sets `playerRegionId` and only then starts the clock, so
nothing ticks away while choosing. Every other region is compared against
`region.controllingActorId === playerRegionId`, not a separate "is this
mine" flag — that field already existed (each region defaults to governing
itself) and reusing it means the exact same check will correctly extend to
multiple regions once annexation exists and starts changing
`controllingActorId` around. `renderRegionControls` shows a read-only
"ruled by X" note instead of the army/navy/raid inputs for anything that
isn't the player's.

`ai/nationAi.js` runs every non-player region: a military target that
scales with how threatened the region currently feels
(`1 + (1 - safetyRating) × 2`, so a region under real bandit pressure wants
up to 3x the baseline army), and an occasional (~5%/week chance to even
evaluate) look at whether raiding a reachable neighbor is clearly
worthwhile — needs a real power advantage (1.5x+), weighted by how much
there visibly is to loot, and the AI won't consider it at all if it's
already got troops away or is itself unsafe at home. Deliberately not
player-aware: an AI region scores every reachable target the same way,
player or not. Verified over a 2-year headless run: AI regions correctly
recruit toward their own targets, the player's region stays exactly at
its set target (0, since the player never touched it in the test) with
zero AI interference, and a raid launched autonomously without any input
from me.

**Still just reactive rules, not planning** — no AI region weighs multiple
turns ahead, forms alliances, or specifically responds to being raided.
That's a reasonable place to stop for a first pass; deeper AI behavior is
its own future project, not an oversight here.

## Culture / census
Not using real-world data for this — each region seeds its own
procedurally-generated starting culture/religion/ancestry identity as a
monoculture, per the design discussed in chat; no dataset needed.
