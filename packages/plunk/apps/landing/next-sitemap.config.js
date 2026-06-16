/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_LANDING_URI || 'https://www.useplunk.com',
  generateRobotsTxt: true,
};
