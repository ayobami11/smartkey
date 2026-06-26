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
        source: '/dean',
        destination: '/dean/dashboard',
        permanent: true,
      },
      {
        source: '/verifier',
        destination: '/verifier/dashboard',
        permanent: true,
      },
      {
        source: '/requester',
        destination: '/requester/dashboard',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
