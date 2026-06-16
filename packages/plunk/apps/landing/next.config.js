/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@plunk/ui'],
  output: 'standalone', // Optimized for Docker
};
