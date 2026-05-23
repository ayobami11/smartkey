import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/cso',
        destination: '/cso/dashboard',
        permanent: true,
      },
      {
        source: '/hod',
        destination: '/hod/dashboard',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
