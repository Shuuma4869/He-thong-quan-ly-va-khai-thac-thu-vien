import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { desktopBuild } from './desktop-config.mjs';
import { sourceFingerprint, recordRelease } from './release-manifest.mjs';

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const { args, env } = desktopBuild(process.env, config);
const before = sourceFingerprint(process.cwd());
const child = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...args], {
  stdio: 'inherit', env,
});
if (child.error) throw child.error;
if (child.status === 0) recordRelease(process.cwd(), before, env);
process.exit(child.status ?? 1);
