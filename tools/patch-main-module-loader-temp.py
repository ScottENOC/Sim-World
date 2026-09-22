from pathlib import Path

path = Path('index.html')
s = path.read_text()
old = '  <script type="module" src="js/main.js?v=20260922-startup-progress2"></script>\n'
new = '''  <script type="module">\n    (() => {\n      let started = false;\n      const report = (message) => {\n        if (typeof window.__reportWorldStartup === 'function') window.__reportWorldStartup(message);\n        console.info('[main-loader]', message);\n      };\n      const startMain = async () => {\n        if (started || !window.__worldsimScenario) return;\n        started = true;\n        report('Loading simulation module graph…');\n        const timeout = setTimeout(() => report('Simulation module graph is still loading after 15 seconds…'), 15000);\n        try {\n          await import('./js/main.js?v=20260922-main-graph1');\n          clearTimeout(timeout);\n          report('Simulation module loaded · starting world setup…');\n        } catch (error) {\n          clearTimeout(timeout);\n          const message = error?.stack || error?.message || String(error);\n          report(`Simulation module failed: ${message}`);\n          console.error('Could not load simulation module graph', error);\n        }\n      };\n      const poll = () => {\n        startMain();\n        if (!started) setTimeout(poll, 25);\n      };\n      poll();\n    })();\n  </script>\n'''
if old not in s:
    raise SystemExit('main script tag anchor not found')
path.write_text(s.replace(old, new, 1))
