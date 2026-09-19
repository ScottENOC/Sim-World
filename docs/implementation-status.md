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
| Persistent merchant ventures and route learning | BUILT/PREVIEW | Implemented on `collapse-trade-raiding-language-v1`; being recalibrated on the 418-region world. |
| Stale merchant price/reliability knowledge | BUILT/PREVIEW | Same branch; intended to stop omniscient weekly route switching. |
| Merchant route habit/inertia | BUILT/PREVIEW | Same branch; candidate-market starvation bug fixed in calibration work, but not yet merge-ready. |
| Trade performance optimisation | MERGED | Trade remains the dominant subsystem and needs another optimisation pass. |
| Bronze/tin collapse trajectory | TESTED | 418-world runs materially changed the trajectory; further trade/raiding calibration remains. |

## Society, culture and language

| Feature | Status | Notes |
| --- | --- | --- |
| Historical 1300 BCE culture families | MERGED | Attested identities where defensible (Egyptian, Assyrian, Babylonian, Mycenaean, Hittite/Luwian, Canaanite etc.) and broad archaeological/regional traditions with confidence markers elsewhere. |
| Dynamic branching / fusion / assimilation | MERGED | Active identity is distinct from ancestry; cultures can branch, merge and assimilate while lineage/ancestry remains queryable. Evolution runs annually. |
| Layered political/super-identities | MERGED | Long-lived multi-region polities can add shared affiliations without deleting local identities. |
| Diaspora-aware migration | MERGED | Migration carries identity and ancestry into destination cohorts rather than moving anonymous population only. |
| Culture effects on diplomacy/trade | MERGED | Cultural affinity is a modest diplomatic/trade trust term; repeated contact builds familiarity. |
| Causal assimilation resistance | MERGED | No date-based modernity bonus. Resistance comes from cultural memory, writing/archives, education, mass communication, rights/rule-of-law institutions, genuine identity age and persecution memory. |
| Coercive cultural-policy constraint | MERGED | Separate from assimilation resistance; domestic rights, international norms/law and external enforcement risk can constrain forced cultural policies. Historical norm-generation remains future work. |
| Recognition / integration / expulsion policy | DESIGNED | Explicit government policy controls still need to be built on top of the culture engine. |
| Spoken-language families and trade communication | BUILT/PREVIEW | Implemented on `collapse-trade-raiding-language-v1`; awaiting 418-world composition/calibration. |
| Historical starting maritime competence | DESIGNED | Seamanship learning-by-doing is live, but established maritime societies still need historically inherited starting competence. |

## Religion

| Feature | Status | Notes |
| --- | --- | --- |
| Religion families, variants and spread modes | MERGED | Local, organised and missionary spread modes supported. |
| State/organised religion and deliberate forks | MERGED | Organised centres and deliberate missionary variants supported. |
| Education/writing integration with organised religion | MERGED | Scribal education/writing work was merged via PR #2. |

## Education, writing and administration

| Feature | Status | Notes |
| --- | --- | --- |
| Scribal education / writing / archives | MERGED | Student/scribe cohorts, writing diffusion, recorded practical knowledge and archive maturity are live. |
| Scribal administration / advisor-information coupling | MERGED | Administrative writing/archives feed institutional capability. |
| Ancient education economic cost / specialist allocation | DESIGNED | Students/scribes are not yet fully charged as labour/upkeep or explicitly allocated between government, temple, commerce and scholarship. |

## Politics, war and population movement

| Feature | Status | Notes |
| --- | --- | --- |
| Polities / occupation / administration | MERGED | Existing polity, vassal and provincial administration system live. |
| Player political faction separate from current region/seat | TESTED | `political-continuity-v1`: player identity persists across capital loss, vassalage and exile; save files retain both player polity and current seat. |
| Claimant retreat after partial conquest | TESTED | Losing a capital while another sovereign region survives moves the court/heir to a temporary capital; lost territory remains strongly claimed rather than ending the run. |
| Negotiated post-conquest settlements | TESTED | Conqueror chooses terms; defeated polity separately accepts or rejects. Old ruler can remain a vassal/governor/reduced ruler, adding legitimacy to the conqueror, or refuse and continue as a claimant. NPCs use the same settlement evaluation. |
| Governments in exile | TESTED | A landless faction can survive with a small exile community, host polity, territorial claims and legitimacy rather than disappearing when its last region falls. |
| Exile diplomacy / restoration backing | TESTED | Player and NPC exile governments can build foreign recognition/restoration support. At strong backing, a capable supporting polity can launch a liberation campaign against an occupied claimed region; victory restores the region to the claimant rather than annexing it. |
| Liberation / gifting of regions | TESTED | Sovereign rulers can transfer territory to another polity with a plausible historical/cultural claim; strong claims are treated as liberation. |
| Gradual regional autonomy | TESTED | Rulers can increase subject autonomy; sufficiently autonomous provinces become delegated/vassal relationships. NPCs review strained subjects annually and can grant autonomy or liberate territory to a substantially stronger claimant. |
| Faction extinction / true defeat | TESTED | Continuity model only marks a political faction extinct when it has no territorial continuation and legitimacy/support has collapsed. Final defeat UI is not yet implemented. |
| Famine migration | MERGED | Destination choice responds to known regions, food price, stability, density and route cost. |
| War-time displacement / migration | MERGED | War displacement is live. |
| Collapse-driven organised raiding | BUILT/PREVIEW | AI motivation changes exist on `collapse-trade-raiding-language-v1`; still needs calibration before merge. |
| Flourishing / Golden Age / campaign retirement | DESIGNED | Intended eventual alternative to a conventional victory screen. World conquest should create an administration problem, not auto-victory. |

## Performance targets and latest measurements

- Target simulation budget: approximately **150 ms per 30-day tick** on the calibration runner.
- Current 418-region world benchmark before the newest political work: approximately **165 ms/tick**.
- Trade remains the largest cost, followed by economy.
- 2,830-region stress test: approximately **1.09 s/tick** in the last comparable run.
- Culture evolution is annual and cached; political continuity is also slow-cadence rather than an every-region hot-path system.

## Current active work

1. Merge and exercise political continuity/vassal/exile/restoration gameplay if the tested branch remains clean.
2. Compose the validated population/trade/language/raiding calibration work with current `main` rather than merging stale branch history blindly.
3. Add explicit recognition/integration/assimilation cultural-policy controls.
4. Seed historically inherited maritime competence once the base economy/geography is stable.
5. Later: add the optional flourishing/legacy retirement layer and richer international norm-generation from observed atrocities.

## Handover rule

Whenever substantial work is started or recovered, update this file in the same branch/PR. Move the status forward only when the corresponding evidence exists. This prevents "we built that" from meaning only that a design, ChatGPT artifact or unmerged branch once existed.
