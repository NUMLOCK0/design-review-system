const apiProxyTarget = (process.env.API_PROXY_TARGET || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8080' : '')).replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` },
      { source: '/uploads/:path*', destination: `${apiProxyTarget}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
