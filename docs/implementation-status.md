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
| Basic culture-group seed | MERGED | Legacy one-culture-per-region seed on `main`; superseded on `culture-identity-v1` by historically cautious 1300 BCE identities/traditions. |
| Historical 1300 BCE culture families | BUILT/PREVIEW | `culture-identity-v1`: attested identities where defensible (Egyptian, Assyrian, Babylonian, Mycenaean, Hittite/Luwian, Canaanite etc.) and broad archaeological/regional traditions with confidence markers elsewhere. |
| Dynamic branching / fusion / assimilation | BUILT/PREVIEW | `culture-identity-v1`: active identity is distinct from ancestry; cultures can branch, merge, assimilate and retain parentage/ancestry. Evolution runs annually rather than every simulation tick. |
| Layered political/super-identities | BUILT/PREVIEW | `culture-identity-v1`: long-lived multi-region polities can add a shared affiliation without deleting local identities, enabling English+British-style identity layering later. |
| Diaspora-aware migration | BUILT/PREVIEW | `culture-identity-v1`: famine migration now carries identity and ancestry into destination cohorts rather than moving anonymous population only. |
| Culture effects on diplomacy/trade | BUILT/PREVIEW | `culture-identity-v1`: cultural affinity is a modest diplomatic/trade trust term; repeated trade builds familiarity and largely overcomes cultural distance. |
| Era/institution-dependent assimilation resistance | BUILT/PREVIEW | `culture-identity-v1`: identity strength, identity age, education/archives/state institutions and future mass-schooling/print/media/internet capabilities progressively reduce assimilation; chronological floor is negligible before early modernity and satisfies Bronze Age < 1926 < 1976 < 2026. |
| Recognition / integration / expulsion policy | DESIGNED | Still to implement as explicit government policy controls on top of the identity engine. |
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
| Era-dependent assimilation difficulty | BUILT/PREVIEW | Implemented in the culture engine; explicit state assimilation/integration policies remain future work. |

## Performance targets and latest measurements

- Target simulation budget: approximately **150 ms per 30-day tick** on the calibration runner.
- Current 418-region world: approximately **165 ms/tick** in the latest subsystem benchmark.
- Trade remains the largest cost, around **78 ms/tick**; economy is the next largest at roughly **35 ms/tick**.
- 2,830-region stress test: approximately **1.09 s/tick**.
- Culture evolution is intentionally annual and uses cached cohort/affinity state; targeted performance tests live in `tools/test-culture.mjs` on the culture branch.

## Current active work

1. Validate `culture-identity-v1` on the 418-region world, including long-run identity proliferation, migration mixing, assimilation hardening and simulation performance.
2. Rebase/compose the validated culture branch with the separately calibrated population/trade/language/raiding work rather than silently mixing experimental branches.
3. Add explicit recognition/integration/assimilation policy controls after the identity engine is stable.
4. Seed historically inherited maritime competence once the base economy/geography is stable.

## Handover rule

Whenever substantial work is started or recovered, update this file in the same branch/PR. Move the status forward only when the corresponding evidence exists. This prevents "we built that" from meaning only that a design, ChatGPT artifact or unmerged branch once existed.
