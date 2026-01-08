/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs'],
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
  images: {
    domains: [],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig