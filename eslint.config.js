// Minimal flat config — focuses on detecting unused imports and variables.
// Kept intentionally small so it doesn't drown the existing codebase in warnings.
// Add more rules (react-hooks, react-refresh, etc.) later when the team is ready.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'src/components/ui/**',
      'scripts/**',
      'public/**',
      '*.config.{js,cjs,ts}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
    },
    rules: {
      // Disable base rules that unused-imports replaces
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // React hooks rules exist but are disabled to avoid flooding warnings.
      // Existing `eslint-disable-next-line react-hooks/exhaustive-deps` in the
      // codebase still need the rule to be defined.
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',

      // Detect unused imports and variables (auto-fixable)
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Relax rules that would flood warnings in the current codebase.
      // Re-enable progressively once baseline is clean.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
    },
  },
)
