# Implementation status

This file is the canonical handover for substantial Sim-World features. A feature is not considered live merely because it was discussed, generated in ChatGPT, or exists on a branch/artifact.

Status meanings:
- **DESIGNED** — agreed design exists, but no production implementation.
- **BUILT/PREVIEW** — code/data exists outside `main` or only as a generated preview.
- **TESTED** — implementation has passed targeted validation but is not yet live.
- **MERGED** — present on `main`.
- **CALIBRATED** — merged and tested in representative long-history/performance runs.

## World and map

| Feature | Status | Notes |
| --- | --- | --- |
| Western Europe base map | CALIBRATED | Live world foundation. |
| 418-region Bronze Age expansion | MERGED | 418 land regions and 30 sea regions live on `main`; includes Italy, Balkans/Greece, Anatolia, Cyprus, Levant, Egypt, Mesopotamia/Zagros, Libya and Tunisia. Geometry/neighbour/coastal-reference validation passed. Needs macro-economic recalibration on the larger world. |
| Historically grounded regional resource plan | MERGED | Expansion resources promoted with the 418-region map. |
| Sea fog / coastal visibility | MERGED | Old ChatGPT patch/ZIP artifacts are superseded by the live fog/knowledge implementation. |
| Cascading alphabetical region picker | MERGED | Old generated picker-fix ZIPs are superseded. |

## Knowledge, exploration and fog of war

| Feature | Status | Notes |
| --- | --- | --- |
| Player fog of war | MERGED | Own/known geography and dev reveal supported. |
| Evidence-ledger knowledge model | MERGED | Dated observations with confidence/specificity/provenance. Repeated evidence is consolidated and stale dated reports are pruned. |
| Fishing/trade/raid knowledge diffusion | MERGED | Direct and second-hand knowledge propagation is live. |
| Sea regions revealed through known adjacent land | MERGED | Prevents distant coastline silhouettes leaking hidden geography. |

## Economy, trade and collapse

| Feature | Status | Notes |
| --- | --- | --- |
| Seasonal/spatially correlated weather and food shocks | MERGED | Long-history calibration still ongoing. |
| Persistent merchant ventures and route learning | BUILT/PREVIEW | Implemented on `collapse-trade-raiding-language-v1`; being ported onto the 418-region world for recalibration. |
| Stale merchant price/reliability knowledge | BUILT/PREVIEW | Same branch; intended to stop omniscient weekly route switching. |
| Merchant route habit/inertia | BUILT/PREVIEW | Same branch; first 283-region run made trade too sticky, so not yet merge-ready. |
| Trade performance optimisation | MERGED | Trade remains the dominant subsystem at roughly half of the 418-world tick budget and needs another optimisation pass. |
| Bronze/tin collapse trajectory | TESTED | 418-world runs show substantial tin depletion and bronze-output decline, but population distress begins too early; must recalibrate before calling this historical trajectory complete. |

## Society, culture and language

| Feature | Status | Notes |
| --- | --- | --- |
| Basic culture-group seed | MERGED | Each starting region gets ancestry/culture/religion identity fields and an identity-strength seed. |
| Dynamic culture / assimilation / recognition | DESIGNED | Recovered from prior design discussions. Needed: persistent minority populations after conquest, recognition status, assimilation/integration policy, expulsion, cultural resilience and era-dependent resistance to assimilation. No full production module found in Git or saved ChatGPT artifacts. |
| Diaspora-aware migration | DESIGNED | Current migration chooses destinations for famine emigrants but does not yet transfer and maintain full cultural population groups. |
| Spoken-language families and trade communication | BUILT/PREVIEW | Implemented on `collapse-trade-raiding-language-v1`; being ported to the 418-world calibration branch. |
| Historical starting maritime competence | DESIGNED | Seamanship learning-by-doing is live, but established maritime societies currently begin effectively at zero inherited maritime experience. Seed historically appropriate competence after geography calibration. |

## Religion

| Feature | Status | Notes |
| --- | --- | --- |
| Religion families, variants and spread modes | MERGED | Local, organised and missionary spread modes supported. |
| State/organised religion and deliberate forks | MERGED | Organised centres and deliberate missionary variants supported. |
| Education/writing integration with organised religion | BUILT/PREVIEW | Exists on the open education/scribes branch; requires performance/correctness review before merge. |

## Education, writing and administration

| Feature | Status | Notes |
| --- | --- | --- |
| Scribal education / writing / archives | BUILT/PREVIEW | Open PR #2. Includes student/scribe cohorts, writing diffusion, recorded practical knowledge and archive maturity. |
| Scribal administration / advisor-information coupling | BUILT/PREVIEW | Open PR #2. Needs targeted performance and correctness tests before merge. |
| Written commercial records / organised-religion literacy coupling | BUILT/PREVIEW | Open PR #2. Needs cleanup of some post-processing/monkeypatch integration before merge. |
| Ancient education economic cost / specialist allocation | DESIGNED | Students/scribes are not yet fully charged as labour/upkeep or explicitly allocated between government, temple, commerce and scholarship. |

## Politics, war and population movement

| Feature | Status | Notes |
| --- | --- | --- |
| Polities / occupation / administration | MERGED | Existing polity system live. |
| Famine migration | MERGED | Destination choice responds to known regions, food price, stability, density and route cost. |
| War-time displacement / migration | MERGED | Previous temporary migration patches were incorporated then cleaned up. |
| Collapse-driven organised raiding | BUILT/PREVIEW | AI motivation changes exist on `collapse-trade-raiding-language-v1`, but calibration still produced effectively zero successful raids. Must fix before merge. |
| Era-dependent assimilation difficulty | DESIGNED | Bronze Age conquest can be brutal; cultural/religious assimilation should become progressively harder as identities/institutions strengthen. |

## Performance targets and latest measurements

- Target simulation budget: approximately **150 ms per 30-day tick** on the calibration runner.
- Current 418-region world: approximately **165 ms/tick** in the latest subsystem benchmark.
- Trade remains the largest cost, around **78 ms/tick**; economy is the next largest at roughly **35 ms/tick**.
- 2,830-region stress test: approximately **1.09 s/tick**.
- Latest 418-region 160-year histories show roughly 15–18% population loss by year 20, which is too early for the intended prosperous opening and is the current macro-calibration priority.

## Current active work

1. Port the persistent trade/language/raiding branch onto the 418-region world without losing newer `main` changes.
2. Diagnose the early 418-world population decline by region and mechanism; check whether large desert administrative polygons (especially Nile/Egypt regions) are being treated as uniformly productive/inhabited land.
3. Restore a prosperous opening of roughly 80 years without globally inflating food or tin.
4. Make organised raiding emerge from collapse conditions and verify it in long-history runs.
5. Seed historically inherited maritime competence once the base economy/geography is stable.
6. Return to the recovered culture/identity system as a separate implementation stream.

## Handover rule

Whenever substantial work is started or recovered, update this file in the same branch/PR. Move the status forward only when the corresponding evidence exists. This prevents "we built that" from meaning only that a design, ChatGPT artifact or unmerged branch once existed.
