import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Browser connections are restricted to this build's realtime origin.

  // Security headers including CSP
  async headers() {
    const realtime = process.env.NEXT_PUBLIC_REALTIME_URL;
    const realtimeOrigins = realtime
      ? (() => {
          const url = new URL(realtime);
          return `${url.origin} ${url.origin.replace(/^http/, 'ws')}`;
        })()
      : '';
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
              "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
              "img-src 'self' https: data: blob:",
              "font-src 'self' data:",
              `connect-src 'self' ${realtimeOrigins}`,
              "media-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    // Suppress punycode deprecation warnings
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /Module not found: Error: Can't resolve 'punycode'/,
      {
        module: /punycode/,
        message: /deprecated/,
      },
    ];

    return config;
  },
};

export default nextConfig;
