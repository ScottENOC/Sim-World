# Expanded-world simulation — 6 September 2026

This records the first 418-land-region Bronze/Iron Age simulation after historical resource endowments and curated eastern sea/coastal topology were added.

## Method

- Start year: 1300 BCE.
- Land regions: 418 (283 existing + 135 expansion regions).
- Sea regions: 30 (17 existing + 13 expansion seas).
- Tick size: 30 simulated days.
- History length: 160 years, ending about 1140 BCE.
- Two deterministic seeds: 305419896 (A) and 2959855665 (B).
- Snapshots every 20 years.
- Performance stress target: exactly 2,830 regions, equal to the old 283-region map × 10. This replaces the old moving “10× current map” target.
- The reported history runs use explicit curated coastal adjacency. An earlier diagnostic run used bounding-box/proximity sea adjacency and was discarded for regional historical interpretation because it incorrectly gave inland regions such as Beqaa and Damascus maritime access.

## Performance

GitHub-hosted runner measurements vary substantially between runs, so treat these as a range rather than precision benchmarks.

### Actual expanded world: 418 regions

A corrected-coast one-year run took 2,609 ms wall time for 13 monthly ticks, or 200.69 ms/tick.

Subsystem ms/tick:

- trade 100.844
- economy 46.212
- fishing knowledge 10.674
- nation AI 5.393
- breakthroughs 5.217
- religion 3.596
- banditry 3.591
- state finance 3.314
- polities 2.228
- diplomacy 1.713
- knowledge prune 1.355
- demographics 1.155
- all remaining systems individually below 0.4 ms/tick

A preceding comparable run on another hosted runner was about 185 ms/tick, so a reasonable present range is roughly 185–201 ms per 30-day tick.

### Fixed stress world: 2,830 regions

The corrected-coast stress run took 20,618 ms for 13 ticks, or 1,586.00 ms/tick.

Subsystem ms/tick:

- trade 780.598
- economy 487.030
- fishing knowledge 61.916
- breakthroughs 39.780
- state finance 39.477
- nation AI 39.261
- banditry 19.409
- religion 19.287
- polities 14.434
- knowledge prune 8.878
- diplomacy 8.479
- demographics 5.229

A preceding hosted-runner result was 1,058 ms/tick, illustrating substantial runner variance. Trade and economy remain the dominant scaling costs.

## Historical snapshots

Population is percent of the start-of-run population. Trade, food imports and bronze output are smoothed/current weekly-equivalent simulation quantities. Tin/copper are percent of initially accessible surface stock remaining across the world.

### Seed A

| BCE | Population | Trade | Food imports | Surface tin | Surface copper | Distressed regions | Bandits | Bronze output | Iron regions | Kingdoms | Subject regions | Writing polities |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1280 | 84.2% | 256,597 | 61,205 | 73.7% | 96.3% | 33 | 301 | 550 | 1 | 18 | 41 | 0 |
| 1260 | 88.3% | 188,039 | 37,501 | 58.9% | 94.2% | 22 | 207 | 445 | 3 | 42 | 69 | 0 |
| 1240 | 87.0% | 115,944 | 28,203 | 51.3% | 92.8% | 39 | 612 | 181 | 7 | 55 | 90 | 0 |
| 1220 | 88.2% | 135,536 | 38,889 | 47.4% | 92.0% | 25 | 126 | 52 | 20 | 64 | 102 | 0 |
| 1200 | 89.9% | 84,440 | 22,791 | 44.9% | 91.6% | 30 | 580 | 43 | 33 | 68 | 111 | 0 |
| 1180 | 88.1% | 77,350 | 17,076 | 43.6% | 91.3% | 32 | 522 | 27 | 43 | 77 | 121 | 0 |
| 1160 | 91.8% | 77,174 | 13,711 | 42.0% | 90.9% | 31 | 456 | 38 | 51 | 84 | 132 | 4 |
| 1140 | 92.2% | 65,162 | 9,152 | 41.2% | 90.7% | 43 | 1,808 | 42 | 64 | 89 | 138 | 10 |

### Seed B

| BCE | Population | Trade | Food imports | Surface tin | Surface copper | Distressed regions | Bandits | Bronze output | Iron regions | Kingdoms | Subject regions | Writing polities |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1280 | 82.7% | 296,645 | 50,223 | 71.3% | 96.2% | 25 | 811 | 524 | 0 | 19 | 40 | 0 |
| 1260 | 87.8% | 266,704 | 76,060 | 59.5% | 94.1% | 24 | 193 | 281 | 0 | 33 | 65 | 0 |
| 1240 | 90.1% | 247,449 | 77,494 | 52.0% | 92.8% | 32 | 1,274 | 185 | 0 | 47 | 78 | 0 |
| 1220 | 88.7% | 122,033 | 30,503 | 46.7% | 92.0% | 40 | 363 | 84 | 0 | 56 | 94 | 0 |
| 1200 | 88.6% | 138,102 | 42,392 | 44.1% | 91.5% | 38 | 744 | 45 | 0 | 60 | 105 | 0 |
| 1180 | 89.5% | 75,122 | 13,952 | 42.0% | 91.1% | 55 | 1,956 | 38 | 0 | 62 | 111 | 0 |
| 1160 | 89.8% | 98,292 | 25,412 | 40.1% | 90.8% | 52 | 470 | 50 | 0 | 69 | 123 | 3 |
| 1140 | 92.1% | 73,139 | 24,250 | 38.1% | 90.4% | 35 | 1,577 | 74 | 0 | 76 | 131 | 13 |

## Regional observations at 1140 BCE

These are not intended as a tuned historical recreation. They expose structural behaviour.

- Central Cyprus retains almost all of its very large surface copper endowment in both seeds (~1.498 million units remaining). It is not functioning as the dominant copper exporter that its geography should support. Seed A has weekly exports ~194; seed B has zero. The extraction/demand/trade model therefore appears to under-utilise major copper endowments.
- Cappadocia exhausts its surface tin by 1140 BCE in both seeds. It becomes a major bronze/export centre in seed A but much less so in seed B.
- Northern Zagros retains ~58–65 thousand surface tin and is a major bronze/raiding centre in both seeds, so this source is economically active.
- Sumer, Assyria and Babylon have no local copper/tin, as intended. However their end-state direct weekly imports are often zero, suggesting either accumulated stocks/indirect trade or insufficient dependence/route persistence; this needs targeted trade-flow tracing.
- Western Nile Delta is a major food exporter in seed A and remains populous in both seeds, which is qualitatively sensible.
- Upper Egypt collapses to 2–3 inhabitants in both seeds. This is plainly not a plausible result and strongly points to the current single area-wide `landQuality` model being unsuitable for Nile-valley regions that contain narrow exceptionally productive floodplain inside very large arid polygons.
- Crete, Attica, Peloponnese and Ugarit decline or remain relatively small, but there is no explicit palace/state destruction analogue yet.
- Iron diffusion is highly seed-sensitive: seed A reaches 64 iron-smelting regions by 1140 BCE; seed B reaches zero. This is too stochastic for a world that starts in 1300 BCE, because experimental/limited iron metallurgy already existed in parts of Anatolia and the Near East. Starting technological state should seed partial ironworking knowledge rather than ask the simulation to reinvent it from zero.

## Assessment

### Promising / historically suggestive

1. Tin is much more constraining than copper. In both seeds, roughly half of accessible surface tin is gone by about 1220 BCE while more than 90% of surface copper remains.
2. Bronze output contracts dramatically over approximately the same interval: from >500 weekly-equivalent units around 1280 BCE to ~52–84 around 1220 BCE and ~43–45 around 1200 BCE.
3. Long-distance trade contracts sharply through the same broad period. The exact path varies, but by 1140 BCE trade is only about one quarter to one third of its 1280 BCE level.
4. Distress and bandit populations are episodic and can spike around/after the trade contraction rather than following a smooth scripted collapse.
5. Geography produces recognisable specialisation in some places: Nile Delta food exports, Anatolian/Balkan horse trade, Zagros/Cappadocian bronze activity.

These are useful emergent behaviours. They are not proof that the Bronze Age collapse model is historically correct, and there is no claim that tin exhaustion itself caused the historical collapse.

### Clearly wrong / needs model work

1. The world loses ~16–17% of its population within the first twenty years, before the intended collapse window, then partially recovers. Starting population/carrying capacity is not in equilibrium.
2. Upper Egypt repeatedly collapses almost to extinction. Separate `cultivableFraction` (or irrigable/floodplain area) from yield/productivity instead of using one `landQuality × total region area` concept for both population and food ceiling.
3. Political consolidation is one-way: kingdoms rise from ~18–19 at 1280 BCE to ~76–89 by 1140 BCE and subject regions from ~40–41 to ~131–138. The model is missing enough state fragmentation/disintegration pressure. Historically the Late Bronze Age transition included the collapse of the Hittite imperial system and Mycenaean palace systems while other large states, especially Egypt and Assyria, survived in altered form.
4. Iron adoption is too lottery-driven. The same world/resources produce 64 iron regions in one seed and zero in another by 1140 BCE. Seed historically plausible partial ironworking/experimental knowledge in appropriate regions at 1300 BCE, then model readiness, diffusion and economic adoption.
5. Writing appears only around/after 1160 BCE in these runs. For the eastern Mediterranean/Near East this is an initial-technology problem: Egypt, Mesopotamia, Anatolia, Ugarit and others should begin with mature writing traditions.
6. Cyprus is not exploiting/exporting copper at anything like the importance implied by its endowment. Investigate mining labour incentives, smelting demand, merchant discovery and export economics before changing the copper map.
7. The current run starts every map region as an independent generic polity/culture/religion. Therefore it cannot yet reproduce the historical differential outcome “Hittite system collapses, Egypt/Assyria survive, Mycenaean palaces disappear” except by coincidence. Historical 1300 BCE starting polities/technology/infrastructure are needed before judging political history strongly.

## Next diagnostic priorities

1. Separate cultivable/irrigable land fraction from per-hectare land productivity and correct Nile-valley starting populations/food production.
2. Seed historically appropriate 1300 BCE technologies: writing, irrigation/water management, mining/metallurgy, limited experimental ironworking, sailing/boatbuilding, etc.
3. Add polity fragmentation/collapse mechanics that can break subject relationships and large states under sustained fiscal, military, food and legitimacy stress.
4. Trace Cyprus copper and Mesopotamian import flows end-to-end before changing resource endowments.
5. After those fixes, rerun the same two deterministic seeds plus additional seeds and compare regional survival/collapse patterns.
