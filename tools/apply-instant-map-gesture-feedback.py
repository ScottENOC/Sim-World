#!/usr/bin/env python3
from pathlib import Path

p = Path('js/ui/mapRenderer.js')
s = p.read_text()

old = """    this._drawQueued = false;\n    this._isInteracting = false;\n    this._lastAnimationDrawAt = 0;\n"""
new = """    this._drawQueued = false;\n    this._isInteracting = false;\n    this._lastAnimationDrawAt = 0;\n    this._lastRenderedTransform = d3.zoomIdentity;\n    this._gesturePreviewActive = false;\n"""
assert old in s
s = s.replace(old, new, 1)

old = """  _requestDraw() {\n    if (this._drawQueued) return;\n    this._drawQueued = true;\n    requestAnimationFrame(() => {\n      this._drawQueued = false;\n      this.draw();\n    });\n  }\n"""
new = """  _requestDraw() {\n    if (this._drawQueued) return;\n    this._drawQueued = true;\n    requestAnimationFrame(() => {\n      this._drawQueued = false;\n      this.draw();\n    });\n  }\n\n  _applyGesturePreview(nextTransform) {\n    // Immediate compositor-only feedback: move/scale the already-painted\n    // canvas while the expensive accurate map redraw waits for gesture end.\n    const base = this._lastRenderedTransform || d3.zoomIdentity;\n    const scale = nextTransform.k / Math.max(0.0001, base.k);\n    const x = nextTransform.x - base.x * scale;\n    const y = nextTransform.y - base.y * scale;\n    this.canvas.style.transformOrigin = '0 0';\n    this.canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;\n    this.canvas.style.willChange = 'transform';\n    this._gesturePreviewActive = true;\n  }\n\n  _clearGesturePreview() {\n    if (!this._gesturePreviewActive) return;\n    this.canvas.style.transform = '';\n    this.canvas.style.transformOrigin = '';\n    this.canvas.style.willChange = '';\n    this._gesturePreviewActive = false;\n  }\n"""
assert old in s
s = s.replace(old, new, 1)

old = """      .on('zoom', (event) => {\n        this.transform = event.transform;\n        this.onInteraction();\n        this._requestDraw();\n      })\n      .on('end', () => {\n        this._isInteracting = false;\n        this.onInteraction();\n        this._requestDraw();\n      });\n"""
new = """      .on('zoom', (event) => {\n        this.transform = event.transform;\n        this.onInteraction();\n        this._applyGesturePreview(event.transform);\n      })\n      .on('end', () => {\n        this._isInteracting = false;\n        this.onInteraction();\n        // Keep the preview visible until the accurate frame has been painted.\n        this._requestDraw();\n      });\n"""
assert old in s
s = s.replace(old, new, 1)

old = """    ctx.restore();\n  }\n}\n"""
new = """    ctx.restore();\n\n    // The canvas now exactly represents the current transform, so swap out\n    // the temporary compositor preview without changing the apparent view.\n    this._lastRenderedTransform = this.transform;\n    this._clearGesturePreview();\n  }\n}\n"""
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
print('Patched js/ui/mapRenderer.js with compositor-first gesture feedback')
