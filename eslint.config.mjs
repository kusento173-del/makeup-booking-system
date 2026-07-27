import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sourceFiles = [
  'apps/**/*.{ts,tsx}',
  'packages/**/*.ts',
  'playwright*.config.ts',
  'prisma.config.ts',
  'tests/**/*.ts',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.taro/**', '**/.temp/**'],
  },
  {
    ...js.configs.recommended,
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'apps/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: sourceFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'playwright.config.ts',
            'playwright.web-roles.config.ts',
            'prisma.config.ts',
            'tests/e2e/*.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  {
    files: ['apps/{api,worker}/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['playwright*.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/admin-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  eslintConfigPrettier,
);
