// @ts-check
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts', '.claude/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend (Express/Node) and the shared package run on Node, not in a browser.
  {
    files: ['apps/api/**/*.ts', 'packages/*/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Frontend: Vue's recommended rules, TS as the <script> parser inside .vue files.
  ...vue.configs['flat/recommended'],
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // Doc-comment sanity checks (Notes/eunomia-plan.md §2.8: names over comments,
  // but where a comment exists it must actually be correct) — not a blanket
  // "every function needs a comment" rule, that would contradict §2.8.
  {
    files: ['**/*.{ts,vue}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': 'warn',
    },
  },

  prettierConfig,
);
