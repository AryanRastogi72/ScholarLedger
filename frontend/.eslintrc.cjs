module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ['dist', 'dist-*'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.2' } },
  rules: { 'react/prop-types': 'off' }
};
