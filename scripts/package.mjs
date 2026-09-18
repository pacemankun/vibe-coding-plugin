import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('artifacts', { recursive: true });
const output = resolve(`artifacts/coin-glance-${version}.zip`);
rmSync(output, { force: true });
execFileSync('zip', ['-qr', output, '.'], { cwd: 'dist' });
console.log(output);
