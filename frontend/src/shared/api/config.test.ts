import { expect, it } from 'vitest';
import { resolveApiConfig } from './config';

it('giữ URL local, không bắt buộc Insight khi pilot chưa dùng', () => {
  expect(resolveApiConfig({}).coreUrl).toBe('http://localhost:8080/api/v1');
  const remote = resolveApiConfig({ VITE_DEPLOYMENT_ENV: 'pilot', VITE_CORE_API_URL: 'https://api.example.test/api/v1/' });
  expect(remote.coreUrl).toBe('https://api.example.test/api/v1');
  expect(remote.insightUrl).toBeUndefined();
});

it('pilot không fallback local, không nhận HTTP hoặc credentials trong URL', () => {
  for (const value of ['', 'http://api.example.test/api/v1', 'https://localhost/api/v1',
    'https://api.tauri.localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://[::1]/api/v1',
    'https://user:secret@api.example.test/api/v1', 'https://api.example.test/api/v1?key=value']) {
    expect(() => resolveApiConfig({ VITE_DEPLOYMENT_ENV: 'pilot', VITE_CORE_API_URL: value })).toThrow();
  }
});

it('không chấp nhận stage hoặc timeout không hợp lệ', () => {
  expect(() => resolveApiConfig({ VITE_DEPLOYMENT_ENV: 'unknown' })).toThrow();
  for (const value of ['0', 'NaN', '120001', '1500.5']) expect(() => resolveApiConfig({ VITE_API_TIMEOUT_MS: value })).toThrow();
});
