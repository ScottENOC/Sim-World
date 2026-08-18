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

## Culture / census
Not using real-world data for this — see the design note in chat. Each
region seeds its own procedurally-generated starting culture/religion/
ancestry identity; no dataset needed.
