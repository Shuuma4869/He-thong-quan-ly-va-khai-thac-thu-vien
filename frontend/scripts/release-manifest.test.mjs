import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksum, sourceFingerprint, verifyRelease } from './release-manifest.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lams-manifest-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'src-tauri/target/release'), { recursive: true });
  writeFileSync(join(root, 'src/app.ts'), 'original source');
  writeFileSync(join(root, 'src-tauri/Cargo.lock'), 'locked dependencies');
  writeFileSync(join(root, '.env.desktop'), 'VITE_CORE_API_URL=http://api.tauri.localhost:8080/api/v1');
  const exe = join(root, 'src-tauri/target/release/lams-desktop.exe');
  writeFileSync(exe, 'test binary');
  const manifest = { schema: 1, sourceFingerprint: sourceFingerprint(root), exeSha256: checksum(exe) };
  writeFileSync(join(root, 'src-tauri/target/release/lams-build-manifest.json'), JSON.stringify(manifest));
  return { root, exe, manifest };
}

test('release khớp source và EXE; output build không làm thay đổi fingerprint', t => {
  const { root, manifest } = fixture(t);
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), 'generated');
  assert.deepEqual(verifyRelease(root), manifest);
});

for (const file of ['src/app.ts', 'src/new.ts', 'src-tauri/Cargo.lock', '.env.desktop']) {
  test(`từ chối release khi input thay đổi: ${file}`, t => {
    const { root } = fixture(t);
    writeFileSync(join(root, file), 'changed input');
    assert.throws(() => verifyRelease(root), /Source đã thay đổi/);
  });
}

test('từ chối EXE bị thay đổi dù source còn nguyên', t => {
  const { root, exe } = fixture(t);
  writeFileSync(exe, 'different binary');
  assert.throws(() => verifyRelease(root), /Checksum EXE/);
});

test('từ chối artifact cũ không có manifest', t => {
  const { root } = fixture(t);
  rmSync(join(root, 'src-tauri/target/release/lams-build-manifest.json'));
  assert.throws(() => verifyRelease(root), /chưa có thông tin build/);
});
