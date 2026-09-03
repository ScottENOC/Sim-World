Western Europe mapping v1
This package completes the first Western Europe mapping pass.
Land
283 permanent land regions total.
Existing 246 regions retained.
Ireland: 32 traditional counties.
Gibraltar: standalone permanent region.
Isle of Man: standalone permanent region.
Jersey: standalone permanent region.
Guernsey: standalone permanent region; Alderney and Sark are included in that strategic region.
Andorra: standalone permanent region, generated from the actual enclosed gap between the France and Spain source layers.
Monaco: no permanent region; its gap is absorbed into Alpes-Maritimes.
Seas
17 game-geographic sea regions: North Sea, English Channel, Irish Sea, Bristol Channel, Celtic Sea, Northeast Atlantic, Bay of Biscay, Portuguese Atlantic, Gulf of Cádiz, Strait of Gibraltar, Alboran Sea, Balearic Sea, Gulf of Lion, Ligurian & Corsican Sea, Azores Atlantic, Madeira Atlantic and Canary Atlantic.
Sea adjacency is curated rather than inferred from broad sea polygon overlap, so inland regions do not become coastal.
Code
Region.isCoastal defaults false.
linkSeaAdjacency() derives isCoastal and adjacentSeaIds from sea metadata.
Picker recognises Ireland, Gibraltar, Andorra, Isle of Man, Jersey and Guernsey.
Ceuta and Melilla remain Africa -> Spain; other Spanish regions remain Europe -> Spain.
Picker remains nested and alphabetically sorted at every level.
index.html cache-busts main.js.
Temporary resources
New regions inherit the provisional resource template of their geographically nearest pre-existing region solely so the existing economy boots. This is not final geology/resource modelling.
Geometry/source notes
Existing Britain/France/Spain/Portugal use the current game integration geometry.
Ireland uses the user-supplied 32-county GeoJSON.
Andorra is derived from the exact enclosed France/Spain source-layer gap.
Monaco is absorbed into Alpes-Maritimes at game-map scale.
Gibraltar, Isle of Man, Jersey and Guernsey use compact game-scale polygons for this build. The CC BY geoBoundaries ADM0 sources have been identified and can replace these later if survey-level outline precision becomes useful.
Sea rendering polygons are game-geographic partitions clipped against a Natural Earth low-resolution global land mask; gameplay coastal adjacency is separately curated.
Replace:
data/world/regions.geo.json
data/world/regions.meta.json
data/world/resources.initial.json
data/world/seaRegions.geo.json
data/world/seaRegions.meta.json
js/world/region.js
js/world/seaRegion.js
js/main.js
index.html
