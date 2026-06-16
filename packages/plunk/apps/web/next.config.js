/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@plunk/ui'],
  output: 'standalone', // Optimized for Docker
  basePath: process.env.PLUNK_BASE_PATH || undefined,
};
