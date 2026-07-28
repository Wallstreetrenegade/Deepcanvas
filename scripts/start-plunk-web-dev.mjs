import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {plunkDevEnv} from './plunk-dev-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const plunkRoot = path.join(repoRoot, 'packages', 'plunk');
const yarnCli = path.join(plunkRoot, '.yarn', 'releases', 'yarn-4.9.1.cjs');

if (!existsSync(yarnCli)) {
  console.error(`Missing Plunk Yarn CLI at ${yarnCli}`);
  process.exit(1);
}

const child = spawn(process.execPath, [yarnCli, 'workspace', 'web', 'dev'], {
  cwd: plunkRoot,
  env: {
    ...process.env,
    ...plunkDevEnv,
    PLUNK_BASE_PATH: process.env.PLUNK_BASE_PATH || '/mail',
    NEXT_PUBLIC_DASHBOARD_URI: process.env.NEXT_PUBLIC_DASHBOARD_URI || 'http://127.0.0.1:5173/mail',
    NEXT_PUBLIC_API_URI: process.env.NEXT_PUBLIC_API_URI || 'http://127.0.0.1:5173/mail-api',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
