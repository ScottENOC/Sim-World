import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const zoomSource = readFileSync(new URL('../js/ui/mapZoomBehaviour.js', import.meta.url), 'utf8');
const projectionSource = readFileSync(new URL('../js/ui/mapProjectionSettings.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

const rendererImport = "./ui/mapRenderer.js?v=20260904-war1";
assert.match(mainSource, new RegExp(rendererImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  'main should keep the renderer module identity covered by the zoom patch');
assert.match(zoomSource, /from '\.\/mapRenderer\.js\?v=20260904-war1'/,
  'zoom behaviour must patch the same MapRenderer module instance used by main');
assert.match(projectionSource, /^import '\.\/mapZoomBehaviour\.js\?v=20260924-zoom1';/,
  'stable zoom behaviour should load before the game creates MapRenderer');

assert.match(zoomSource, /insertAdjacentElement\('afterend', surface\)/,
  'gesture measurement should use a separate stable interaction surface');
assert.match(zoomSource, /d3\.select\(interactionSurface\)\.call\(zoom\)/,
  'D3 zoom listeners must be attached to the stable interaction surface');
assert.doesNotMatch(zoomSource, /d3\.select\(this\.canvas\)\.call\(zoom\)/,
  'D3 must not measure pinch coordinates from the CSS-transformed canvas');
assert.match(zoomSource, /interactionSurface\.getBoundingClientRect\(\)/,
  'tap coordinates should use the same stable interaction surface');
assert.match(zoomSource, /const MAX_MAP_ZOOM = 12;/,
  'the map should retain the original 12x maximum zoom');

console.log('Map zoom behaviour regression passed.');
