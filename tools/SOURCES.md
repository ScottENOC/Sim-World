Data sources and licenses
Boundaries — in use
Natural Earth, `ne_10m_admin_0_map_subunits` (England/Scotland/Wales/N. Ireland) and
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
Boundaries — for when admin-1 detail is needed beyond the UK/Ireland/France slice
geoBoundaries — CC BY 4.0 / ODbL, commercial use and redistribution allowed
with attribution (credit "geoBoundaries (Runfola et al., 2020)" somewhere in
an about/credits screen). GitHub mirror: https://github.com/wmgeolab/geoBoundaries
Use this for large/complex countries where Natural Earth's admin-1 is coarser
than you want, or where a country needs breaking into more than one region
to stay near the "few hundred total" target.
Avoid GADM for this project — non-commercial license only, redistribution
needs prior permission. Not compatible with a public repo or a game you might sell.
Climate baseline — not yet pulled
CHELSA (chelsa-climate.org) — CC0, fully public-domain-equivalent, so no
commercial concerns at all. Two products matter here:
`CHELSA-climatologies` (1981–2010 monthly normals, 1km) for "current" climate.
`CHELSA-TraCE21k` (downscaled temperature/precipitation since the Last
Glacial Maximum, in centennial steps) — this one actually gives a real
paleoclimate estimate for a Bronze Age start, rather than assuming today's
climate held constant back to 1200 BCE.
Not reachable from this sandbox's network allowlist — chelsa-climate.org isn't
on it. Download manually and drop the rasters in `tools/raw-data/`, or paste
the region-level values back into the chat and I'll write them into
`regions.meta.json` directly.
Resources — not yet pulled
USGS Mineral Resources Data System (MRDS) — public domain, US government
work. mrdata.usgs.gov isn't reachable from this sandbox either; same plan as
climate — manual download or pasted values.
Currency — design decision, not yet coded
No universal currency at game start. Real Western Europe in the Bronze Age
wasn't monetized — no coinage anywhere until roughly 600 BCE (Lydia), and
that doesn't reach Britain/Ireland until Roman contact over a thousand years
later. What these regions actually had was direct exchange plus a handful of
"prestige goods" (bronze, gold ornaments, amber) that functioned as informal
stores of value.
But the trade-matching algorithm still needs some common unit to compute
fair exchange ratios between six different goods — that's a computation
problem, not a lore problem. Plan: an abstract internal `value` ledger used
only by the trade system's matching/pricing math, not something a region
"has" or an edict can spend. Once a Currency-type tech unlocks later
(weighed-metal standard, then eventually coinage), that same ledger
reifies into a real, tax-able, spend-able resource — mirroring the real
barter → value-equivalence → money → coinage progression instead of assuming
money exists on day one.
Economy calibration notes
`js/economy/labor.js` constants are first-pass placeholders, sanity-checked
by running `tickEconomy` headless for 50 simulated years before shipping:
food yield/labor-saturation constants are tuned so a region with average
land quality and average population noise comes out comfortably fed, but the
two noise terms are independent (a region can be unusually crowded and
only have average land) — so a couple of regions genuinely can't feed
themselves even at 100% farming, by design. Deposit sizes are scaled so
aggressive mining depletes over decades, not the single tick it did on the
first pass (population count vastly outstripped the original deposit sizes).
`MAX_SPECIALIST_FRACTION = 0.08` caps how much of a population can be
full-time non-farm specialists — without it, "surplus" labor after farming
was landing in the hundreds of thousands and strip-mining regions instantly.
Deposit tiers and tech gates
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
Culture / census
Not using real-world data for this — each region seeds its own
procedurally-generated starting culture/religion/ancestry identity as a
monoculture, per the design discussed in chat; no dataset needed.
