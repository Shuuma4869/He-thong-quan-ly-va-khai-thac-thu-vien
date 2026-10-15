type Environment = Record<string, string | boolean | undefined>;

export function resolveApiConfig(env: Environment) {
  const stage = String(env.VITE_DEPLOYMENT_ENV ?? 'local');
  if (!['local', 'test', 'pilot', 'production'].includes(stage)) throw new Error('VITE_DEPLOYMENT_ENV không hợp lệ.');
  const remote = stage === 'pilot' || stage === 'production';
  function endpoint(value: string | boolean | undefined, name: string, fallback?: string) {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    if (!raw) return undefined;
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || url.pathname.replace(/\/$/, '') !== '/api/v1') throw new Error(`${name} phải là URL API /api/v1, không chứa credentials/query/hash.`);
    if (remote && (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.localhost')
      || host === '[::1]' || host.startsWith('127.') || host === '0.0.0.0')) {
      throw new Error(`${name} của pilot/production phải dùng HTTPS trên máy chủ từ xa.`);
    }
    return url.toString().replace(/\/$/, '');
  }
  const coreUrl = endpoint(env.VITE_CORE_API_URL, 'Core API', remote ? undefined : 'http://localhost:8080/api/v1');
  if (!coreUrl) throw new Error('Thiếu VITE_CORE_API_URL cho pilot/production.');
  const insightUrl = endpoint(env.VITE_INSIGHT_API_URL, 'Insight API', remote ? undefined : 'http://localhost:3000/api/v1');
  const timeoutMs = Number(env.VITE_API_TIMEOUT_MS ?? 15000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('API timeout phải trong khoảng 1000–120000 ms.');
  return { stage, coreUrl, insightUrl, timeoutMs };
}
