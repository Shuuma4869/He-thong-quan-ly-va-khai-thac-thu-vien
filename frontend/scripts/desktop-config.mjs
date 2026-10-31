function origin(value, required) {
  if (!value && !required) return undefined;
  if (!value) throw new Error('Cần Core API HTTPS trước khi build bản pilot/production.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('127.')
    || url.hostname === '[::1]' || url.hostname === '0.0.0.0' || url.hostname.toLowerCase().includes('your-')
    || url.pathname.replace(/\/$/, '') !== '/api/v1') throw new Error('API phát hành phải là URL HTTPS từ xa hợp lệ, không chứa secret/placeholder.');
  return url.origin;
}

function localApiOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== 'api.tauri.localhost' || !url.port
    || url.username || url.password || url.search || url.hash
    || url.pathname.replace(/\/$/, '') !== '/api/v1') {
    throw new Error('API kiểm thử desktop phải dùng api.tauri.localhost với cổng riêng và đường dẫn /api/v1.');
  }
  return url.origin;
}

export function desktopBuild(environment, config) {
  const stage = environment.VITE_DEPLOYMENT_ENV ?? 'local';
  if (!['local', 'pilot', 'production'].includes(stage)) throw new Error('Desktop stage không hợp lệ.');
  const args = ['build'];
  const env = { ...environment };
  if (stage === 'local') {
    const defaults = {
      VITE_CORE_API_URL: 'http://api.tauri.localhost:8080/api/v1',
      VITE_INSIGHT_API_URL: 'http://api.tauri.localhost:3000/api/v1',
    };
    const urls = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, env[key] || fallback]));
    const origins = Object.values(urls).map(localApiOrigin);
    if (Object.entries(defaults).some(([key, fallback]) => urls[key] !== fallback)) {
      const csp = config.app.security.csp.replace(/connect-src [^;]+/,
        `connect-src 'self' ipc: http://ipc.localhost ${[...new Set(origins)].join(' ')}`);
      args.push('--config', JSON.stringify({ app: { security: { csp } } }));
    }
    env.VITE_CORE_API_URL = urls.VITE_CORE_API_URL;
    env.VITE_INSIGHT_API_URL = urls.VITE_INSIGHT_API_URL;
  } else {
    const origins = [origin(env.VITE_CORE_API_URL, true), origin(env.VITE_INSIGHT_API_URL, false)].filter(Boolean);
    // An absent service must not fall back to a URL from local .env files.
    env.VITE_INSIGHT_API_URL ??= '';
    const override = {
      build: { beforeBuildCommand: `npm run build -- --mode ${stage}` },
      app: {
        windows: config.app.windows.map(window => ({ ...window, useHttpsScheme: true })),
        security: { csp: `default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost ${origins.join(' ')}; img-src 'self' data: https://covers.openlibrary.org https://books.google.com https://upload.wikimedia.org; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'` },
      },
    };
    args.push('--config', JSON.stringify(override));
  }
  args.push('--', '--locked');
  return { args, env };
}
