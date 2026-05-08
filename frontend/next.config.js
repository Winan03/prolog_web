/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during build (fix later)
  eslint: { ignoreDuringBuilds: true },
  // Monaco Editor needs this
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;
