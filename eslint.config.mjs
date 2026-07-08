import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'docs/ui-prototype/original-html/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
      },
      globals: {
        Blob: 'readonly',
        Buffer: 'readonly',
        describe: 'readonly',
        console: 'readonly',
        document: 'readonly',
        expect: 'readonly',
        fetch: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTableRowElement: 'readonly',
        Image: 'readonly',
        it: 'readonly',
        performance: 'readonly',
        process: 'readonly',
        ResizeObserver: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  prettier,
];
