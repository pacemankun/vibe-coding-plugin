import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
assert.deepEqual(manifest.host_permissions, ['https://data-api.binance.vision/*']);
for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons)]) {
  assert.ok(existsSync(join('dist', file)), `Missing manifest asset: ${file}`);
}
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]); }
for (const file of walk('dist').filter(file => /\.(js|html)$/.test(file))) {
  const source = readFileSync(file, 'utf8');
  assert.ok(!source.includes('67482.36000000') && !/preview[-.]/.test(file), `Preview data leaked into ${file}`);
  assert.ok(!/<script[^>]+src=["']https?:/i.test(source), `Remote script in ${file}`);
}
console.log('Verified MV3 manifest, permissions, bundled assets and production-only code.');
