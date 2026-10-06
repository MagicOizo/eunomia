// @ts-check
import js from '@eslint/js';
import vueI18n from '@intlify/eslint-plugin-vue-i18n';
import prettierConfig from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import jsoncParser from 'jsonc-eslint-parser';
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

  // UI texts live in the catalogues (Notes/eunomia-plan.md, localization
  // package). Keys are checked in both directions — a `t()` without its entry,
  // an entry nothing reads — and the catalogues against each other.
  {
    files: ['apps/web/src/**/*.{ts,vue}', 'apps/web/src/locales/*.json'],
    plugins: { '@intlify/vue-i18n': vueI18n },
    settings: {
      'vue-i18n': {
        localeDir: 'apps/web/src/locales/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
  },
  {
    files: ['apps/web/src/locales/*.json'],
    languageOptions: { parser: jsoncParser },
    rules: {
      '@intlify/vue-i18n/no-duplicate-keys-in-locale': 'error',
      '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error',
      '@intlify/vue-i18n/no-html-messages': 'error',
      '@intlify/vue-i18n/valid-message-syntax': 'error',
      '@intlify/vue-i18n/no-unused-keys': [
        'error',
        {
          src: 'apps/web/src',
          extensions: ['.ts', '.vue'],
          // Keys held as data (a nav entry's `titleKey`, a field or setting
          // label looked up by the name the API uses) are invisible to this
          // rule, which only sees literal `t()` calls; whatever reads them is
          // typed against the catalogue instead.
          ignores: ['/^nav\\./', '/^fields\\./', '/^fieldFormats\\./', '/^settingLabels\\./'],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    ignores: ['apps/web/src/**/*.{test,spec}.ts', 'apps/web/src/test/**'],
    rules: {
      '@intlify/vue-i18n/no-missing-keys': 'error',
      '@intlify/vue-i18n/no-v-html': 'error',
    },
  },
  // No text outside the catalogues — enforced area by area, as each one is
  // moved over; the list grows with every slice of the package until the rule
  // covers the whole app. The style guide stays out: its sample texts are the
  // content of a developer page.
  {
    files: [
      'apps/web/src/App.vue',
      'apps/web/src/components/layout/**/*.vue',
      'apps/web/src/layouts/**/*.vue',
      'apps/web/src/views/**/*.vue',
      'apps/web/src/design-system/components/**/*.vue',
      'apps/web/src/components/resource/**/*.vue',
      'apps/web/src/agencies/**/*.vue',
      'apps/web/src/admin/**/*.vue',
      'apps/web/src/profile/**/*.vue',
      'apps/web/src/trash/**/*.vue',
      'apps/web/src/contracts/**/*.vue',
      'apps/web/src/dashboard/**/*.vue',
    ],
    rules: {
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        {
          // Brand and technical literals that read the same in every language.
          ignoreText: [
            'Eunomia',
            '–',
            '·',
            '€',
            '%',
            'POST /api/v1/setup',
            'SETUP_TOKEN',
            '.env',
            'CONFIG_ENCRYPTION_KEY',
          ],
          ignorePattern: '^[\\s\\d.,:;()/+*×-]+$',
        },
      ],
    },
  },

  prettierConfig,
);
