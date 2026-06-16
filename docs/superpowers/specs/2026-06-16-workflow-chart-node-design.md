# Graphique « type Power BI » dans les workflows — Design

> 2026-06-16 — validé en conversation (approche + portée + ordre « tout en une fois »).

## Besoin
Sur la base des données (`sheet`) qui circulent dans un workflow, produire un graphe
(barres, lignes, aire, camembert, nuage de points) utilisable de trois façons :
1. **Visualiser dans l'éditeur** (aperçu interactif).
2. **Produire une image PNG** réutilisable en aval (Telegram, Drive, export).
3. **Insérer dans le Google Sheet exporté** (graphe natif Sheets).

## Architecture — 2 volets

### Volet A — Node « Graphique » (client-only)
- `type: 'chart'`, `category: 'transformation'`, `runtime: 'client'`, ajouté à
  `SERVER_UNSUPPORTED` (message clair en cron : non exécutable serveur).
- **Entrée** : `sheet`. **Sorties** : `chart` (spec d'aperçu), `assets: asset[]`
  (1 image PNG, pattern canonique cf. `generate-image`), `file`.
- **Config** (`ConfigComponent`) : type de graphe, colonne X, colonnes de valeurs
  (séries, multi-sélection sur `availableColumns`), agrégation (aucune/somme/moyenne/
  count), titre.
- **`run()`** : agrège les `rows` → `ChartSpec` → rend sur un `<canvas>` détaché via
  `chart.js/auto` (`animation:false`, taille fixe) → `toDataURL('image/png')` → asset.
- **Aperçu** : `DataPreviewPanel` reconnaît `{ kind:'chart' }` (`isChart`) et rend
  `ChartPreview` (react-chartjs-2, lazy). `'chart'` ajouté en tête de
  `PREVIEW_PORT_PRIORITY`.
- **Lib** : `chart.js` + `react-chartjs-2` (lazy-load, comme `xlsx`). PNG sans DOM React
  monté (canvas natif).

### Volet B — Graphe natif dans l'export Google Sheets (client + serveur/cron)
- Le node `gsheets-export` gagne une section optionnelle : `chartEnabled`, `chartType`,
  `chartXColumn`, `chartValueColumns`.
- Insertion comme **chart natif** via l'API Sheets `batchUpdate.addChart` (pas une image)
  → éditable dans Sheets et **exécutable côté serveur** (pas de moteur de rendu headless).
- Mapping nom de colonne → index sur les colonnes écrites (données puis formules).
- **Idempotence** : avant `addChart`, suppression des graphes existants
  (`deleteEmbeddedObject`) — sinon le mode « mise à jour » accumule les graphes
  (`values:clear` ne supprime pas les charts).
- `basicChart` pour barres (COLUMN) / lignes (LINE) / aire (AREA) / nuage (SCATTER) ;
  `pieChart` pour camembert.

## Cohérence serveur
- **Cron** → graphe natif dans le Sheet (volet B, serveur OK).
- **Éditeur / Telegram / Drive** → node Graphique + PNG (volet A, client).

## Module partagé
`registry/chartSpec.ts` : types `ChartSpec`, `aggregateChartData(rows, columns, config)`,
`toChartJsConfig(spec)` — consommé par `chartNode` (PNG) et `ChartPreview` (aperçu).
Le builder de requête `addChart` est dupliqué client (`gdriveCore.ts`) /
serveur (`google.ts`), identique (même contrainte que `detectColumnFormat`).

## Fichiers
- `src/features/workflows/registry/chartSpec.ts` (nouveau)
- `src/features/workflows/registry/chartNode.tsx` (nouveau)
- `src/features/workflows/editor/ChartPreview.tsx` (nouveau, lazy)
- `src/features/workflows/registry/builtin.ts` (+import)
- `src/features/workflows/editor/DataPreviewPanel.tsx` (isChart + ChartPreview + priorité)
- `functions/src/workflow/nodes/index.ts` (SERVER_UNSUPPORTED += 'chart')
- `src/features/workflows/registry/gdriveNodes.tsx` (config UI graphique)
- `src/features/gdrive/gdriveCore.ts` (addSheetChart client)
- `functions/src/workflow/nodes/google.ts` (addChart serveur)
