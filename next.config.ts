import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NOTEFLOW_STAGING === 'isolated' ? '.next-staging' : '.next',
  poweredByHeader: false,
  async rewrites() { return [{ source: '/offline', destination: '/offline.html' }]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ] }]; },
};
export default config;
