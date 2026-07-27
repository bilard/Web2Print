// Minimal flat config — focuses on detecting unused imports and variables.
// Kept intentionally small so it doesn't drown the existing codebase in warnings.
// Add more rules (react-hooks, react-refresh, etc.) later when the team is ready.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'site-web/**',
      // Outillage vendorisé (skills, plugins) : pas du code applicatif.
      '.agents/**',
      '.claude/**',
      '.superpowers/**',
      'dist/**',
      'build/**',
      'node_modules/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'src/components/ui/**',
      'scripts/**',
      'public/**',
      'extension/dist/**',
      'extension/src/overlay-main.ts',
      'indesign-plugin/**',
      '*.config.{js,cjs,ts}',
      'api-server.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        chrome: 'readonly',
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
    },
    rules: {
      // Disable base rules that unused-imports replaces
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',

      // `exhaustive-deps` reste désactivée (bruyante, et des `eslint-disable-next-line`
      // existants ont besoin que la règle soit définie).
      'react-hooks/exhaustive-deps': 'off',
      // `rules-of-hooks`, en revanche, N'EST PAS une règle de style : toute violation est
      // un crash à l'exécution (« Minified React error #310 »), invisible au typage comme
      // aux tests. Un hook ajouté après un retour anticipé a mis l'éditeur de workflow à
      // terre en production le 2026-07-27 — la règle l'aurait arrêté avant le déploiement.
      'react-hooks/rules-of-hooks': 'error',

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
  {
    // `no-console` ne vise QUE l'application navigateur : côté Cloud Functions,
    // scripts Node et service worker, `console` EST le canal de log légitime
    // (Cloud Logging, sortie CLI).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      '**/__tests__/**',
      'src/test/**',
      'src/lib/debugLog.ts', // l'implémentation du logger gaté
    ],
    rules: {
      // Les traces de debug passent par `debugLog` (src/lib/debugLog.ts), gaté
      // en production. `warn`/`error`/`info` restent libres : ce sont de vraies
      // anomalies ou des messages de démarrage, ils doivent atteindre la console.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // DETTE PRÉEXISTANTE : ces quatre fichiers violaient déjà `rules-of-hooks` quand la
    // règle a été activée (10 occurrences, hooks appelés après un retour anticipé ou dans
    // un callback). Ils fonctionnent en l'état — les corriger demande de restructurer des
    // composants sans rapport avec la raison de l'activation. Exception NOMMÉE plutôt que
    // règle désactivée pour tout le monde : le code neuf, lui, est protégé dès maintenant.
    files: [
      'src/features/editor/useTextEditMode.ts',
      'src/features/excel/DataTable.tsx',
      'src/features/excel/ProductSheet.tsx',
      'src/features/retail-promo/steps/StepRender.tsx',
    ],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
)
