import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'supabase/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // plain-JS browser loader served as a static asset
    files: ['packages/widget/public/**/*.js'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', URL: 'readonly' },
    },
  },
  {
    // \x00 sentinels are the point (see renderMarkdown)
    files: ['packages/widget/src/markdown.ts'],
    rules: { 'no-control-regex': 'off' },
  },
);
