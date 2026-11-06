// eslint.config.js: lint rules for the client (plain JavaScript + JSX, browser globals, React hooks).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  reactHooks.configs.flat.recommended,
  { files: ['src/**/*.{js,jsx}'], ...reactRefresh.configs.vite() },
  {
    files: ['*.config.{js,cjs}', 'vitest.setup.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/test-utils/**', 'src/**/*.test.{js,jsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
];
