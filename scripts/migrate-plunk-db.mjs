import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {plunkDevEnv} from './plunk-dev-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const plunkRoot = path.join(repoRoot, 'packages', 'plunk');
const yarnCli = path.join(plunkRoot, '.yarn', 'releases', 'yarn-4.9.1.cjs');
const env = {...process.env, ...plunkDevEnv};

if (!existsSync(yarnCli)) {
  console.error(`Missing Plunk Yarn CLI at ${yarnCli}`);
  process.exit(1);
}

for (const args of [
  ['workspace', '@plunk/db', 'db:generate'],
  ['workspace', '@plunk/db', 'migrate:prod'],
]) {
  const result = spawnSync(process.execPath, [yarnCli, ...args], {
    cwd: plunkRoot,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
