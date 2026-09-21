import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourceRoot = path.join(repoRoot, 'data', 'world');
const scenarioRoot = path.join(repoRoot, 'data', 'scenarios', 'fractured-2027');
const targetRoot = path.join(scenarioRoot, 'world');
const manifest = JSON.parse(fs.readFileSync(path.join(scenarioRoot, 'scenario.json'), 'utf8'));
const required = manifest.requiredMapFiles || [];
const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

for (const file of required) {
  const source = path.join(sourceRoot, file);
  if (!fs.existsSync(source)) fail(`Missing Grand Campaign source map asset: ${file}`);
}
if (process.exitCode) process.exit();

if (checkOnly) {
  console.log(`Fractured World map builder check passed: ${required.length} source assets are available.`);
  process.exit();
}

fs.mkdirSync(targetRoot, { recursive: true });
for (const file of required) {
  const source = path.join(sourceRoot, file);
  const target = path.join(targetRoot, file);
  fs.copyFileSync(source, target);
}

const buildInfo = {
  schemaVersion: 1,
  scenarioId: 'fractured-2027',
  baseline: 'grand-campaign-map-snapshot',
  generatedFiles: required,
  generatedAt: new Date().toISOString(),
  instructions: [
    'The generated package is an independent snapshot, not a runtime alias to data/world.',
    'Apply modern strategic splits and merges to this package only.',
    'Keep ownership, occupation and front-line control in scenario state rather than baking them into geometry.',
    'Do not overwrite strategic-regions.json; it is an authoring catalogue rather than generated runtime geometry.'
  ]
};
fs.writeFileSync(path.join(targetRoot, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(`Built Fractured World baseline map package with ${required.length} copied assets in ${path.relative(repoRoot, targetRoot)}.`);
