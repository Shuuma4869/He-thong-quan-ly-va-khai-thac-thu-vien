import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { desktopBuild } from './desktop-config.mjs';

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const { args, env } = desktopBuild(process.env, config);
const child = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...args], {
  stdio: 'inherit', env,
});
if (child.error) throw child.error;
process.exit(child.status ?? 1);
