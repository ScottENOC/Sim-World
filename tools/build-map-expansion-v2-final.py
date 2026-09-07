#!/usr/bin/env python3
"""Final broad expansion wrapper with geography-first microstate absorption."""
import importlib.util
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
FAST_PATH = ROOT / 'tools' / 'build-map-expansion-v2-fast.py'
spec = importlib.util.spec_from_file_location('map_fast', FAST_PATH)
fast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fast)
map_v2 = fast.map_v2


def absorb_microstates_geographic(base_geo, base_meta, masks, specs):
    meta_by_id = {m['id']: m for m in base_meta}
    for item in specs:
        iso = item['iso']
        micro = masks.get(iso)
        if micro is None:
            for alias in fast.ALIASES.get(iso, set()):
                micro = masks.get(alias)
                if micro is not None:
                    break
        host = masks.get(fast.HOST_ISO.get(iso))
        if micro is None or host is None or micro.is_empty or host.is_empty:
            print(f'MICROSTATE_WARN missing {iso} or host geometry')
            continue

        candidates = []
        host_env = host.envelope
        for f in base_geo:
            g = map_v2.repair(shape(f['geometry']))
            if not g.envelope.intersects(host_env):
                continue
            total_area = max(1.0, map_v2.area_sqkm(g))
            host_area = map_v2.area_sqkm(g.intersection(host))
            if host_area <= 0.25:
                continue
            host_share = host_area / total_area
            d = g.distance(micro)
            shared = g.boundary.intersection(micro.boundary).length if d < 0.12 else 0
            # Prefer the gameplay region that is most genuinely part of the
            # surrounding host geography; use proximity/shared border second.
            candidates.append(((host_share, host_area, shared, -d), f, g))
        if not candidates:
            raise RuntimeError(f'{iso}: no gameplay region overlaps host geography')
        _, f, g = max(candidates, key=lambda item: item[0])
        merged = map_v2.repair(unary_union([g, micro]))
        f['geometry'] = map_v2.mapping(merged)
        meta = meta_by_id.get(f['properties']['id'])
        if meta:
            c = merged.centroid
            meta['centroid'] = [c.x, c.y]
            meta['areaSqKm'] = map_v2.area_sqkm(merged)
        print(f"MICROSTATE_ABSORB {iso} -> {f['properties'].get('name')}")


map_v2.absorb_microstates = absorb_microstates_geographic

if __name__ == '__main__':
    fast.make_runtime_plan_idempotent()
    map_v2.main()
