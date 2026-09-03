# Simulation calibration harness

Run the complete deterministic world without the browser:

```sh
node tools/calibrate.mjs --years 200 --seeds 3 --snapshot-years 5 --output calibration.json
```

Start with a short smoke run after changing mechanics:

```sh
node tools/calibrate.mjs --years 2 --seeds 1
```

The report records the prosperity, depletion, collapse and recovery indicators
for every snapshot. Product specialities are based on export earnings rather
than gross production, so ordinary subsistence farming does not cause every
region to be classified as a food specialist. It also identifies raiding economies. A raiding economy
requires at least two successful raids during the reporting window, more loot
than export income, and loot representing at least half of external income.
This separates sustained predation from an isolated opportunistic raid.

Default multi-century runs are intentionally slow: they execute the same weekly
simulation as the game. Fixed seeds make parameter changes directly comparable.
