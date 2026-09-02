# Western Europe map integration

This package replaces the old six macro land regions with 246 permanent geographic regions:
England 46, Wales 13, Scotland 19, France 96, Spain 52, Portugal 20.

Changed runtime files:
- data/world/regions.geo.json
- data/world/regions.meta.json
- data/world/resources.initial.json
- data/world/seaRegions.geo.json
- data/world/seaRegions.meta.json
- js/world/region.js
- js/main.js

Important temporary limitation:
The old sea-region layer referenced the old country-scale land IDs, so it is intentionally empty
for this first map milestone. Ocean still renders as background. Sea regions/coastal adjacency should
be rebuilt against the new permanent regions next.

Resource endowments are temporary inherited country-scale templates so the existing economy can boot.
They are not intended as final regional resource geography.
