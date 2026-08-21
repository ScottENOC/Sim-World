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
Ore deposits (copper, tin, gold) are no longer one smooth difficulty curve
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
priority weights for copper/tin/gold/stone instead of splitting miners by
raw remaining tonnage (stone is so much more abundant it was swallowing the
whole miner pool), and a proper water-filling allocator (`allocateWithCaps`
in `labor.js`) so labor that a capped-out resource turns away correctly
flows to whichever resource still has room, rather than either overshooting
a cap or vanishing.

`region.unlockedTechIds` is a stub (empty `Set`) for now — real tech
diffusion is Phase 3. Nothing unlocks deeper tiers yet, which is why every
region's shaft/deep tiers sit untouched no matter how long you run it.
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
single "development score"), gives the first N equipped workers a
productivity bonus (lagged one tick — this tick's efficiency is based on
last tick's headcount/equipment, which avoids solving a circular "how many
farmers, how equipped are they" system simultaneously), and computes how
much bronze each occupation wants to spend equipping more of itself this
tick, capped at 2% newly-equipped per week so adoption takes real time.
Farmer, lumberjack, and miner demand (miner's own headcount is lagged too,
since it isn't decided until later in the same tick) plus a small baseline
and a `region.militaryBronzeDemand` stub sum to a demand target *before*
mining runs. `labor.js` then mines enough copper/tin to actually cover that
target (subject to tier caps), before falling back to background priority
mining for stone/gold/spare capacity. Smithing is bounded by both labor and
actual input availability — never a stock-existence boolean.

`region.equipment[occupation]`, once populated, is durable — if the
workforce shrinks, existing tools just sit unused rather than disappearing,
ready for when headcount grows again.

Two calibration bugs caught by simulation before shipping: baseline bronze
demand (a flat weekly draw representing prestige/trade goods) was larger
than realistic weekly mine-face output, so it was eating 100% of production
before any tools could be bought — cut from 5 to 0.5. And mine-face worker
caps, tuned purely for century-scale depletion in the previous session, came
out too small to run any meaningful bronze economy at all — scaled workers
and stock up together 6x so the stock-to-worker *ratio* (and therefore the
already-verified depletion timescale) stayed the same while weekly
throughput became workable. Re-verified over 1000 simulated years: France's
farmer tool coverage grows steadily for ~300 years then plateaus around 7.6%
once surface copper/tin are both exhausted, sitting there — correctly —
until `shaft_mining` exists to unlock more.

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
pair — land-adjacent pairs get a small flat cost, everything else goes by
sea using the great-circle distances already in `regions.meta.json` (France
has no land border with anyone in this six-region set, so sea routes are
load-bearing, not decorative). Each region's trader labor — whatever's left
over after farming/lumber/mining/smithing, via `region._availableForTrade`
set by `labor.js` — chases its best price-gap opportunities across every
resource and destination, in order, until it runs out of labor, stock, or a
buyer's ability to pay. Currency is `region.wallet` (populace, active in
trade) and `region.treasury` (government, inert until taxation/edicts
exist), both seeded proportional to population — placeholders, not derived
from anything.

One real calibration bug caught before shipping: the first version of
`routeCost` was almost an order of magnitude too large relative to the price
scale (a ~700km sea route cost more than the maximum possible price gap for
any good), so nothing was ever profitable enough to trade. Fixed by
rescaling `LAND_ADJACENT_COST` and `SEA_COST_PER_KM` down to where real
routes can clear real price gaps.

Confirmed behavior, deliberately not patched: a region that spends its
wallet on imports and has nothing profitable left to export cannot earn any
more money and stays locked out of trade — under the current starting
wallet seeds (population × 0.01), that's most of the six-region world within
about a month of simulated time, including the wealthy regions once their
customers go broke. This is intentional per the design direction (economic
distress is a real path into Bronze Age collapse, not something to
smooth over with passive income) — flagged here rather than fixed since the
pacing (how long trade stays active before freezing) is a starting-wallet
tuning question, not a bug, and hasn't been revisited yet.

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

## Culture / census
Not using real-world data for this — each region seeds its own
procedurally-generated starting culture/religion/ancestry identity as a
monoculture, per the design discussed in chat; no dataset needed.
