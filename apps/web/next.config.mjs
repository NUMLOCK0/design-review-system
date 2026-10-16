import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Both API token signing and Web SSR validation must use the same source.
// Read JWT_SECRET exclusively from apps/server/.env; ignore Web/process copies.
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
const dotenv = serverRequire('dotenv');
const serverEnv = dotenv.parse(readFileSync(new URL('../server/.env', import.meta.url)));
const serverJwtSecret = String(serverEnv.JWT_SECRET || '').trim();
if (serverJwtSecret.length < 32) {
  throw new Error('apps/server/.env 必须配置至少 32 位 JWT_SECRET');
}
process.env.JWT_SECRET = serverJwtSecret;

const apiProxyTarget = (process.env.API_PROXY_TARGET || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8080' : '')).replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep `next build` from replacing the files used by a running `next dev`.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` },
      { source: '/uploads/:path*', destination: `${apiProxyTarget}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
