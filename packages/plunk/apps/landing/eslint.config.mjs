import config from '@plunk/eslint-config/next';

const landingConfig = [
  ...config,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];

export default landingConfig;
