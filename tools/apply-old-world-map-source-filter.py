from pathlib import Path

path = Path('tools/build-old-world-asia-pacific.py')
text = path.read_text()

old_const = "PACIFIC_EXTRAS = [box(-162.5, 17.5, -153.5, 23.5)]  # Hawaii only; Oceania dependencies are selected normally.\n"
new_const = """PACIFIC_EXTRAS = [box(-162.5, 17.5, -153.5, 23.5)]  # Hawaii only; Oceania dependencies are selected normally.\n# Natural Earth's country layer can bundle overseas possessions with a European\n# country. Keep continental America and the Caribbean genuinely deferred.\nAMERICAS_EXCLUSION = unary_union([\n    box(-170.0, 24.0, -50.0, 84.0),\n    box(-118.0, 7.0, -55.0, 25.0),\n    box(-90.0, -60.0, -30.0, 15.0),\n])\n"""
if new_const not in text:
    if old_const not in text:
        raise RuntimeError('Pacific-extra constant anchor missing')
    text = text.replace(old_const, new_const, 1)

old_target = """        if continent(feature) in target_continents or is_greenland(feature):\n            geom = map_v2.clean(shape(feature['geometry']))\n            if not geom.is_empty:\n                out.append((feature, geom))\n"""
new_target = """        if continent(feature) in target_continents or is_greenland(feature):\n            geom = map_v2.clean(shape(feature['geometry']))\n            if not is_greenland(feature):\n                geom = map_v2.repair(geom.difference(AMERICAS_EXCLUSION))\n            if not geom.is_empty:\n                out.append((feature, geom))\n"""
if new_target not in text:
    if old_target not in text:
        raise RuntimeError('Target-admin0 filter anchor missing')
    text = text.replace(old_target, new_target, 1)

old_mask = "    geoms = [geom for _, geom in admin0_targets] + PACIFIC_EXTRAS\n"
new_mask = "    # Hawaii is validated separately; do not count its surrounding ocean box as target land.\n    geoms = [geom for _, geom in admin0_targets]\n"
if new_mask not in text:
    if old_mask not in text:
        raise RuntimeError('Target-mask anchor missing')
    text = text.replace(old_mask, new_mask, 1)

path.write_text(text)
print('Old World map source filter applied')
