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

export function desktopBuild(environment, config) {
  const stage = environment.VITE_DEPLOYMENT_ENV ?? 'local';
  if (!['local', 'pilot', 'production'].includes(stage)) throw new Error('Desktop stage không hợp lệ.');
  const args = ['build'];
  const env = { ...environment };
  if (stage !== 'local') {
    const origins = [origin(env.VITE_CORE_API_URL, true), origin(env.VITE_INSIGHT_API_URL, false)].filter(Boolean);
    // An absent service must not fall back to a URL from local .env files.
    env.VITE_INSIGHT_API_URL ??= '';
    const override = {
      build: { beforeBuildCommand: `npm run build -- --mode ${stage}` },
      app: {
        windows: config.app.windows.map(window => ({ ...window, useHttpsScheme: true })),
        security: { csp: `default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost ${origins.join(' ')}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'` },
      },
    };
    args.push('--config', JSON.stringify(override));
  }
  args.push('--', '--locked');
  return { args, env };
}
