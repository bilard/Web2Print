---
title: Cleanups reportés — Web2Print
date: 2026-05-06
status: deferred
---

# Cleanups reportés

À reprendre **quand le refactor scraping en cours sera commité** (24 fichiers
modifiés au moment de l'audit, 14 erreurs TS, 9 tests en échec). Toucher
à ces items maintenant mélangerait le nettoyage avec le refactor.

Audit complémentaire au [2026-04-29-cleanup-audit.md](./2026-04-29-cleanup-audit.md).

## Reports

### 1. Warnings ESLint `unused-imports/no-unused-vars` (~20)

Sur fichiers actuellement modifiés (`EnrichmentPanel.tsx`, `ScrapeTab.tsx`,
`useJina.ts`, `llmRouter.ts`, `ScrapingModal.tsx`, etc.).

Action : `eslint --fix` après commit du refactor scraping. Préfixer `_` les
arguments de callbacks restants ou les supprimer.

### 2. Dépendance `zod-to-json-schema` à supprimer

Aucun import dans le code. `npm uninstall` bloqué par conflit ERESOLVE :

```
While resolving: @vitejs/plugin-react@5.1.4
Found: vite@8.0.7
peerOptional vite@"^6.0.0 || ^7.0.0 || ^8.0.0"
```

Action : résoudre d'abord le conflit peer deps (mettre à jour
`@vitejs/plugin-react` ou downgrade `vite`), puis désinstaller.

### 3. Migration `EnrichedProduct.price` → `pricing`

Champ marqué `@deprecated` dans `src/features/excel/ai-enrichment/types.ts:65`
mais encore utilisé à 3 endroits :

- `src/features/briefs/ai/useGenerateCart.ts:211` — `product.price ?? 0`
- `src/features/pim/productToSheet.test.ts:85,100` — assertions test

Action : migrer vers `pricing.ttc` (ou structure équivalente), puis supprimer
le champ déprécié.

### 4. Refactor des fichiers > 1000 lignes

À aborder **un par un** avec objectif fonctionnel précis (pas en mode "split
parce que c'est gros") :

| Lignes | Fichier | Note |
|---|---|---|
| 4490 | `src/features/excel/ai-enrichment/useProductEnrichment.ts` | 🔴 Cœur enrichissement, fragile |
| 2090 | `src/features/excel/ai-enrichment/EnrichmentPanel.tsx` | UI panel enrichissement |
| 1926 | `src/features/idml/idmlParser.ts` | 🔴 Critique IDML |
| 1926 | `src/features/idml/idmlExporter.ts` | 🔴 Critique IDML |
| 1232 | `src/pages/DataPage.tsx` | Page data avec multiples responsabilités |
| 1198 | `src/features/scraping/useJina.ts` | Pipeline Jina |
| 1108 | `src/components/shared/SettingsPanel.tsx` | UI settings |
| 1066 | `src/features/excel/DataTable.tsx` | Table de données |
| 1015 | `src/features/editor/useImageMask.ts` | Masquage images |

⚠️ Les fichiers IDML/Fabric (rouge) sont fragiles : éviter de toucher sans
besoin fonctionnel précis.

## Cleanups réalisés (référence)

Commits déjà appliqués sur master :

- `25f45d2` — chore: nettoyage code mort (orphelins + imports inutilisés)
  - Suppression : `SourcesColumn.tsx`, `scraping/core/debug.ts`, `api-server.js`
  - ESLint --fix : `CanvasContainer.tsx`, `printMarks.ts`, `DataPage.tsx`
- `4c9ea25` — chore: nettoyage code mort (fonction inutilisée + prefer-const)
  - Suppression : `truncateBeforeNonProductSections` dans `useProductEnrichment.ts`
  - Import mort : `basenameFromUrl`
  - `let → const` : `mergeStrategy.ts`, `useProductEnrichment.ts`

**Total : 8 fichiers nettoyés, 267 lignes supprimées, 0 régression.**
ESLint : 43 → 33 problèmes (-10).
