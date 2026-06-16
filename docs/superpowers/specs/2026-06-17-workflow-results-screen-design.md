# Écran « Résultats des workflows » — Design (Phase 1)

> 2026-06-17 — design global validé en conversation. Réponses : IA hybride (déterministe
> + IA à la demande), écran dédié, 4 rendus (dashboard/document/galerie/table),
> sauvegardé+exportable. **Cette spec couvre la PHASE 1** (slice vertical, sans le
> chantier persistance durable ni l'IA).

## Constat fondateur
Les sorties des runs ne sont **pas persistées durablement** (`workflowRunsLive/{workflowId}`
= dernier run serveur, cappé 100 lignes ; `workflowRuns/{runId}` = métadonnées sans
outputs). La persistance durable + l'upload blob→Storage (images/documents) = **Phase 0/2**.
Phase 1 lit le **dernier run** déjà disponible (sans nouveau stockage) :
- run **serveur/cron** → `workflowRunsLive/{workflowId}` (Firestore, durable au reload) ;
- run **client** (éditeur, même session) → `runContext` (Zustand en mémoire).

## Phase 1 — périmètre
Slice vertical end-to-end sur le cas le plus simple (données = sheet, **pas de blob**) :
**persistance déjà là → écran → dashboard + table → export PDF/PNG.**

### Route & accès
- Route `/workflows/:id/result` → `WorkflowResultsPage`.
- Bouton « Résultat » dans la barre de l'éditeur de workflow.

### Source de données (`useRunResult`)
- Charge la def du workflow (store `current` si chargé, sinon `getWorkflow`).
- Outputs : `workflowRunsLive/{id}` (serveur) ; repli sur `runContext.nodeStates` si le
  workflow courant a tourné en client dans la session. Garde le plus récent.

### Sélection des panneaux (`classifyResult`)
- **Panneau par sortie terminale** (node sans edge sortant ayant des outputs).
- Si une sortie terminale est un **puits** (export-result/file/json), remonter d'un cran
  en amont (BFS sur les edges entrants) pour trouver la 1re sortie **visualisable**
  (sheet/chart/asset[]) et l'ajouter en tête. → la veille tarifaire montre le **dashboard
  du tableau comparé** (node compare) ET le **lien du Sheet** (node export).
- `pickPrimaryOutput` + priorité `['chart','sheet','products','result','assets','file']`.

### Classification → rendu
| kind | détection | rendu (réutilisé) |
|---|---|---|
| `dashboard` | sheet avec ≥1 colonne numérique | KPI cards + graphes chart.js + table |
| `table` | sheet sans colonne numérique | `SheetPreview` |
| `chart` | `isChartSpec` | `ChartPreview` |
| `gallery` | `asset[]` | `AssetGridPreview` |
| `document` | `export-result`/`file` | `ExportPreview` (lien/téléchargement) |
| `json` | sinon | `<pre>` |

### Dashboard déterministe (`buildDashboard`)
- Colonne X = 1re colonne **catégorielle** ; séries = colonnes **numériques** (≤5).
- `DashboardSpec = { kpis: KpiCard[]; charts: ChartSpec[] }`, réutilise
  `aggregateChartData` + `ChartPreview` (livrés 2026-06-17). KPI : nb lignes + moyenne /
  min-max par colonne numérique.
- **Doit être bon en standalone** (l'IA = polish Phase 2, pas un sauvetage).

### Export (`src/lib/domExport.ts`)
- `exportElementToPng` / `exportElementToPdf` (html2canvas + jsPDF lazy, fond sombre).

## Lib
Réutilise **chart.js** + `chartSpec.ts` (pas de Vega-Lite). L'IA (Phase 2) remplira la
même `DashboardSpec`.

## Hors Phase 1 (Phase 0/2)
Persistance durable des outputs (Firestore meta + Storage payload), upload **blob→Storage**
pour galerie/document, historique des 20 derniers runs + purge, bouton **« Régénérer avec
l'IA »** (DashboardSpec génératif + insights), sauvegarde de la spec régénérée.

## Fichiers Phase 1
- `src/features/workflows/results/{types,classifyResult,buildDashboard,useRunResult}.ts`
- `src/features/workflows/results/{ResultPanelView,WorkflowResultsScreen}.tsx`
- `src/pages/WorkflowResultsPage.tsx`
- `src/lib/domExport.ts`
- `src/app/router.tsx` (route), `editor/WorkflowEditorPage.tsx` (bouton)
- `editor/DataPreviewPanel.tsx` : exporter `SheetPreview`/`AssetGridPreview`/`ExportPreview`
  + guards pour réutilisation.
