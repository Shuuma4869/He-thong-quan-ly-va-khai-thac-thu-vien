import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const checksum = path => createHash('sha256').update(readFileSync(path)).digest('hex');

export function sourceFingerprint(root) {
  const files = [];
  function visit(relative) {
    const path = join(root, relative);
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(`${relative}/${name}`);
    } else files.push(relative);
  }
  for (const path of ['src', 'public', 'scripts', 'src-tauri/src', 'src-tauri/icons', 'src-tauri/capabilities']) visit(path);
  for (const name of readdirSync(root).sort()) {
    if (/^(package.*\.json|.*config.*|index\.html|\.env.*)$/.test(name) && statSync(join(root, name)).isFile()) files.push(name);
  }
  for (const name of readdirSync(join(root, 'src-tauri')).sort()) {
    if (statSync(join(root, 'src-tauri', name)).isFile()) files.push(`src-tauri/${name}`);
  }
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) hash.update(file).update('\0').update(checksum(join(root, file))).update('\0');
  return hash.digest('hex');
}

export function verifyRelease(root) {
  const directory = join(root, 'src-tauri/target/release');
  const path = join(directory, 'lams-build-manifest.json');
  if (!existsSync(path)) throw new Error('EXE chưa có thông tin build. Chạy scripts/build-desktop.ps1 để tạo bản có thể xác minh.');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.schema !== 1 || manifest.sourceFingerprint !== sourceFingerprint(root)) {
    throw new Error('Source đã thay đổi hoặc manifest không hợp lệ. Build lại desktop trước khi mở release.');
  }
  if (manifest.exeSha256 !== checksum(join(directory, 'lams-desktop.exe'))) {
    throw new Error('Checksum EXE không khớp manifest. Build lại desktop.');
  }
  return manifest;
}

export function recordRelease(root, before, env) {
  if (sourceFingerprint(root) !== before) throw new Error('Source thay đổi trong lúc build; chưa chứng nhận artifact. Build lại khi source ổn định.');
  const directory = join(root, 'src-tauri/target/release');
  const manifest = {
    schema: 1,
    gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    builtAt: new Date().toISOString(),
    environment: env.VITE_DEPLOYMENT_ENV ?? 'local',
    coreApi: env.VITE_CORE_API_URL,
    insightApi: env.VITE_INSIGHT_API_URL,
    sourceFingerprint: before,
    exeSha256: checksum(join(directory, 'lams-desktop.exe')),
  };
  writeFileSync(join(directory, 'lams-build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyRelease(resolve(fileURLToPath(new URL('..', import.meta.url))));
    console.log('Bản desktop khớp source và checksum EXE.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
