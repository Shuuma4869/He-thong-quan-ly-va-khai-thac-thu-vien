import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopBuild } from './desktop-config.mjs';

const config = { app: { windows: [{ label: 'main', create: false, devtools: false }] } };
test('local giữ cấu hình gốc và Cargo lockfile', () => {
  assert.deepEqual(desktopBuild({}, config).args, ['build', '--', '--locked']);
});
test('pilot chỉ cho origin API HTTPS đã chọn, không nạp mode desktop local', () => {
  const result = desktopBuild({ VITE_DEPLOYMENT_ENV: 'pilot', VITE_CORE_API_URL: 'https://core.example.test/api/v1' }, config);
  const override = JSON.parse(result.args[2]);
  assert.equal(override.build.beforeBuildCommand, 'npm run build -- --mode pilot');
  assert.equal(override.app.windows[0].useHttpsScheme, true);
  assert.equal(override.app.windows[0].devtools, false);
  assert.equal(result.env.VITE_INSIGHT_API_URL, '');
  assert.match(override.app.security.csp, /https:\/\/core\.example\.test/);
  assert.doesNotMatch(override.app.security.csp, /api\.tauri\.localhost|localhost:8080|\*/);
});
test('production nhận Insight HTTPS tùy chọn', () => {
  const result = desktopBuild({ VITE_DEPLOYMENT_ENV: 'production', VITE_CORE_API_URL: 'https://core.example.test/api/v1', VITE_INSIGHT_API_URL: 'https://insight.example.test/api/v1' }, config);
  assert.match(JSON.parse(result.args[2]).app.security.csp, /https:\/\/insight\.example\.test/);
});
test('từ chối URL local, placeholder, secret và stage sai trước khi build', () => {
  for (const value of ['', 'http://core.example.test/api/v1', 'https://localhost/api/v1', 'https://api.tauri.localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://[::1]/api/v1', 'https://YOUR-CORE-HOST/api/v1', 'https://user:secret@core.example.test/api/v1', 'https://core.example.test/api/v1?key=value', 'https://core.example.test/']) {
    assert.throws(() => desktopBuild({ VITE_DEPLOYMENT_ENV: 'pilot', VITE_CORE_API_URL: value }, config));
  }
  assert.throws(() => desktopBuild({ VITE_DEPLOYMENT_ENV: 'staging' }, config));
});
