from pathlib import Path

# Force fresh region.js through main.js and fresh main.js through index.html.
main_path = Path('js/main.js')
main = main_path.read_text()
old_import = "import { loadWorld } from './world/region.js?v=20260912-silkroad1';"
new_import = "import { loadWorld } from './world/region.js?v=20260922-land-loader1';"
if old_import not in main:
    raise SystemExit('region import anchor not found')
main_path.write_text(main.replace(old_import, new_import, 1))

index_path = Path('index.html')
index = index_path.read_text()
old_main = "await import('./js/main.js?v=20260922-main-graph1');"
new_main = "await import('./js/main.js?v=20260922-land-loader1');"
if old_main not in index:
    raise SystemExit('dynamic main import anchor not found')
index_path.write_text(index.replace(old_main, new_main, 1))

# Give every land-world asset a hard timeout and bypass HTTP cache during diagnosis.
region_path = Path('js/world/region.js')
region = region_path.read_text()
old_fetch = "    const response = await fetch(url);\n    const elapsed = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) / 1000;"
new_fetch = "    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;\n    const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;\n    let response;\n    try {\n      response = await fetch(url, { cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });\n    } catch (error) {\n      if (error?.name === 'AbortError') throw new Error(`${label} request timed out after 20 seconds (${url})`);\n      throw error;\n    } finally {\n      if (timeout) clearTimeout(timeout);\n    }\n    const elapsed = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) / 1000;"
if old_fetch not in region:
    raise SystemExit('land fetch anchor not found')
region_path.write_text(region.replace(old_fetch, new_fetch, 1))
