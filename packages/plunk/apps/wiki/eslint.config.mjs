import config from '@plunk/eslint-config/next';

const wikiConfig = [
  ...config,
  {
    ignores: ['.source/**'],
  },
];

export default wikiConfig;
