---
title: Audit nettoyage Web2Print
date: 2026-04-29
status: report
---

# Audit nettoyage Web2Print — Phase 0

Outils : `knip`, `depcheck`, `eslint`, `wc -l`. Aucune modification de code.

## A. Code mort (knip)

### A1. Fichiers orphelins (3)

```
src/features/help/hooks/useHelp.ts
src/features/print/PRINT_FORMATS.ts
src/features/scraping-templates/selectorGenerator.ts
```

### A2. Exports inutilisés (12)

| Symbole | Fichier |
|---|---|
| `ensureGoogleFontLoaded` | `src/features/assets/useFonts.ts:161` |
| `ensureGoogleFontsLoaded` | `src/features/assets/useFonts.ts:201` |
| `loadProductImageReferences` | `src/features/briefs/ai/brandKitLoader.ts:137` |
| `AI_ENRICHMENT_KEYS` | `src/features/excel/DataTable.tsx:19` |
| `selectorStrategySchema` | `src/features/scraping-templates/types.ts:12` |
| `fieldSelectorSchema` | `src/features/scraping-templates/types.ts:24` |
| `groupSelectorSchema` | `src/features/scraping-templates/types.ts:43` |
| `preActionSchema` | `src/features/scraping-templates/types.ts:59` |
| `createStyledTextbox` | `src/features/svg/textboxConverter.ts:202` |
| `getProductTaxonomyLink` | `src/features/taxonomy/productTaxonomy.ts:15` |
| `REASONING_PROVIDERS` | `src/stores/aiSettings.store.ts:10` |
| `getReasoningCascade` | `src/stores/aiSettings.store.ts:79` |

### A3. Types exportés inutilisés (37)

37 types/interfaces orphelins (cf. liste complète knip). Concentration dans
`src/features/excel/ai-enrichment/`, `src/features/idml/`, `src/features/pptx/`,
`src/features/scraping-templates/`. Suppression sans risque (types only).

## B. Lint warnings (47, ESLint)

100% `unused-imports/no-unused-vars`. Distribution :

- `src/features/excel/` — 12 warnings
- `src/features/idml/` — 7 warnings
- `src/features/dam/` — 4 warnings
- `src/features/editor/` — 6 warnings
- `src/features/merge/` — 5 warnings
- `src/features/nanobana/` — 4 warnings
- `src/features/scraping*/` — 6 warnings
- Autres — 3 warnings

Auto-fixables par `eslint --fix`. Les arguments inutilisés de callbacks (ex.
`(_, key) =>`) seront préfixés `_` selon la convention ESLint.

## D. Dépendances

### D1. À supprimer (validés manuellement)

**Racine `package.json` :**
- `@types/chrome` — devDep, aucune référence `chrome.*` dans `src/`

**`functions/package.json` :**
- `turndown` — aucun import dans `functions/src/`
- `@joplin/turndown-plugin-gfm` — aucun import dans `functions/src/`
- `@types/turndown` — devDep liée

### D2. Faux positifs knip (à NE PAS supprimer)

- `dotenv`, `express` (racine) — utilisés par `api-server.js` + `server.mjs`
  (knip ignore les fichiers JS hors entry points TS)
- `firebase-admin` (racine) — **à investiguer** : utilisé dans
  `functions/src/scraper/scrapeCatalogForBrief.ts` mais déclaré aussi à la
  racine. Vérifier si un script racine en a besoin avant suppression.

### D3. Hints knip à corriger

- `knip.json` contient des entry patterns redondants (`src/main.tsx`,
  `vite.config.ts`, `src/index.ts`)
- Patterns `scripts/**` et `functions/lib/**` à retirer du ignore

## C. Fichiers > 150 lignes (extrait, top 50)

| Lignes | Fichier | Catégorie |
|---|---|---|
| 4323 | `src/features/excel/ai-enrichment/useProductEnrichment.ts` | 🔴 Critique |
| 1948 | `src/features/idml/idmlExporter.ts` | 🔴 Critique IDML |
| 1927 | `src/features/idml/idmlParser.ts` | 🔴 Critique IDML |
| 1558 | `src/features/excel/ai-enrichment/EnrichmentPanel.tsx` | 🟠 Grand |
| 1217 | `src/pages/DataPage.tsx` | 🟠 Grand |
| 1091 | `src/features/scraping/useJina.ts` | 🟠 Grand |
| 1049 | `src/features/excel/DataTable.tsx` | 🟠 Grand |
| 1019 | `src/features/editor/useImageMask.ts` | 🟠 Grand |
| 928 | `src/components/panels/PropertiesPanel.tsx` | 🟠 Grand |
| 864 | `src/features/idml/idmlToFabric.ts` | 🔴 Critique IDML |
| 820 | `src/features/excel/ProductSheet.tsx` | 🟠 Grand |
| 695 | `src/components/shared/SettingsPanel.tsx` | 🟡 Moyen |
| 651 | `src/features/scraping-templates/engine.ts` | 🟡 Moyen |
| 649 | `src/features/dam/components/DamLightbox.tsx` | 🟡 Moyen |
| 646 | `src/features/pptx/pptxParser.ts` | 🔴 Critique PPTX |
| 619 | `src/features/scraping-templates/VisualTemplateBuilder.tsx` | 🟡 Moyen |
| 617 | `src/features/svg/svgToFabric.ts` | 🟡 Moyen |
| 568 | `src/features/merge/DataMergePanel.tsx` | 🟡 Moyen |
| 548 | `src/features/excel/ExcelImportModal.tsx` | 🟡 Moyen |
| 545 | `src/pages/DashboardPage.tsx` | 🟡 Moyen |

**Au total : ~50 fichiers > 150 lignes**, dont **~15 fichiers > 500 lignes**.

⚠️ Les fichiers IDML/PPTX/Fabric (rouge) sont exclus par défaut du refactor
(critiques, fragiles). Doivent être abordés un par un avec accord explicite.

## Recommandations Phase A → C

| Phase | Volume | Risque | Effort |
|---|---|---|---|
| A — Code mort | 3 fichiers + 12 exports + 37 types + 47 imports | 🟢 Faible | 30 min |
| D — Deps | 4 packages | 🟢 Faible | 10 min |
| B — Lint/types | 47 warnings + few `any` | 🟢 Faible | 15 min |
| C — Refactor | ~50 fichiers candidats | 🔴 Variable | À cadrer (proposition par fichier) |
