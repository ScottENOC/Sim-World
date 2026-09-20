# Military assistance and proxy wars

This layer lets states sustain foreign wars without becoming direct belligerents. It is deliberately generic: the same machinery can represent subsidies and arms shipments in pre-modern wars, Lend-Lease, Cold War proxy support, or modern security assistance.

## Assistance ladder

Programmes can be financial support, civilian/dual-use logistics, military materiel, training and advisers, intelligence, logistics support, volunteers, or direct intervention. Each carries a progressively larger involvement signal. Visibility is separate: support can be covert, plausibly deniable, undeclared but observable, or public.

## Physical transfers

Aid is not an abstract combat bonus. Money leaves the donor treasury when committed. Stockpile goods such as firearms, ammunition, vehicles, food and fuel leave donor inventories. Persistent modern equipment can be transferred by exact design/Mark from `militaryEquipment.inventoryByDesign`.

Shipments take time to reach the recipient and have route reliability and loss. Land aid uses a physical neighbour route and avoids strongly hostile third-party transit. Coastal capitals can use an abstract maritime aid route. This is intentionally simpler than campaign logistics for the first implementation, but it preserves distance, delay and vulnerability rather than teleporting equipment.

## Foreign equipment and absorption

Transferred designed equipment remains identifiable as foreign equipment. The recipient receives an imported design record carrying the original design ID and donor polity ID.

The immediately usable share depends on literacy/education, administrative capacity, military professionalism and industrial/maintenance capacity, with an additional penalty for equipment complexity. Training assistance and accumulated experience gradually improve the usable share. Repeated reliance on a donor builds materiel, training, logistics and intelligence dependency.

This means sophisticated equipment can be abundant but operationally ineffective if the recipient lacks crews, mechanics, spare-parts systems and institutional capacity.

## Proxy conflicts

Active regime conflicts and succession civil wars can attract patrons. Assistance programmes are indexed by recipient, then matched to the two conflict sides. Different foreign patrons backing opposing sides create proxy-escalation pressure without automatically creating a direct war between the patrons.

Volunteers and direct intervention create substantially more escalation than finance or materiel alone.

## Nuclear deterrence interaction

NPC military-assistance decisions explicitly consider the risk of direct nuclear war. When confrontation with an opposing great power would carry high nuclear risk, indirect materiel support becomes more attractive and tends to be deniable. Nuclear weapons therefore suppress direct great-power war without suppressing strategic rivalry itself.

The system does not make proxy war inevitable. Patron decisions still depend on affinity with the recipient, hostility toward the opponent, cost tolerance, route access and a rate-limited opportunity to intervene.

## Runtime integration

`tickMilitaryAssistance` runs beside foreign political intervention. It delivers due shipments, updates foreign-equipment readiness and dependency, assesses competing patrons, and gives NPCs a rate-limited opportunity to support active conflicts.

Player/runtime callers can use `window.__worldsim.militaryAssistanceApi` to create programmes, dispatch aid and inspect proxy-conflict state. A dedicated player UI can build on this API without changing the simulation model.
