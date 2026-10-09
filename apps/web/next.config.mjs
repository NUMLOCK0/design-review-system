import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The admin/service layouts verify the backend's JWT on the Web server.
// Local development shares the backend .env without copying the secret into a tracked file.
if (process.env.NODE_ENV === 'development' && !process.env.JWT_SECRET) {
  try {
    const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));
    const dotenv = serverRequire('dotenv');
    const serverEnv = dotenv.parse(readFileSync(new URL('../server/.env', import.meta.url)));
    if (serverEnv.JWT_SECRET) process.env.JWT_SECRET = serverEnv.JWT_SECRET;
  } catch { /* A missing local backend env is handled by the existing auth guard. */ }
}

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
