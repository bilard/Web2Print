# IA complétion — remplissage de colonne par IA (DataPage)

> Conception — 2026-06-24

## Problème

Dans la page Data, l'utilisateur veut **modifier/générer en masse les valeurs d'une colonne**
à partir d'un prompt libre référençant d'autres colonnes. Exemple type : générer un
« nom de produit court » pour les 174 lignes d'une base à partir de la colonne
« Description ». Aujourd'hui rien ne permet une transformation IA colonne par colonne ;
seul l'enrichissement par scraping (par ligne, via URL) existe.

## Décisions validées (brainstorming)

- **Destination au choix** : créer une **nouvelle colonne** OU **écraser une colonne
  existante**.
- **Portée au choix** : **toutes les lignes** OU **sélection / filtre courant**.
- **Aperçu obligatoire** avant le premier « Appliquer » : générer un échantillon (~5 lignes),
  valider le résultat, puis lancer sur toute la portée. Borne le coût et protège des
  écrasements ratés.
- **Lots groupés** : ~20 lignes par appel LLM (≈ 9 appels pour 174 lignes au lieu de 174) —
  rapide et économique.

## Architecture (réutilise l'existant, ne le modifie pas)

- **Store** : `useExcelStore` (`src/stores/excel.store.ts`) — `addColumn(sheetIdx, col, position?)`
  et `updateCell(sheetIdx, rowId, colKey, value)`. **PAS** le `merge.store`.
- **LLM structuré** : `generateJson<T>` (`src/features/ai/llmRouter.ts`) — validation Zod côté
  client + retry par provider + schémas spécifiques (`schemaForLLM` Gemini, `schemaForClaude`
  strict). Plus fiable que du texte libre pour des lots indexés. Nécessite l'ajout d'une
  `LLMTask`.
- **Batch + abort + coût** : pattern de `ScrapingModal.handleEnrichMany` (itération
  séquentielle des lots, `abortRef`, feedback live) ; coût via `recordAiUsage` /
  `pushAiUsageListener` (`src/features/stats/aiUsageTracking.ts`).
- **Persistance** : auto-save Firestore existant de la DataPage (debounce 3 s) — déclenché par
  les `updateCell`. Pas de nouvelle écriture à coder.

### Découpage en unités

1. **`src/features/excel/ai-completion/columnCompletionEngine.ts`** — logique pure, testable :
   - `buildChunks<T>(rows: T[], size = 20): T[][]`.
   - `resolveColumnRefs(prompt: string, row: ExcelRow, columns: ExcelColumn[]): string` —
     remplace les références `[NomColonne]` (par label OU clé) par la valeur de la ligne.
   - `buildBatchPrompt(userPrompt: string, chunk: ExcelRow[], columns: ExcelColumn[]): string` —
     construit un prompt unique listant les entrées numérotées (`0..n-1`) avec leurs
     références résolues, et demande un résultat par entrée.
   - Schéma Zod `CompletionBatchSchema = z.object({ results: z.array(z.object({ i: z.number(),
     v: z.string() })) })` + `COMPLETION_SCHEMA_FOR_LLM` (JSON Schema équivalent).
   - `mapResults(parsed, chunk): Record<string, string>` — `{ rowId → valeur }`, mappe par
     index `i` ; index manquants = non résolus (remontés comme échecs).
2. **`src/features/excel/ai-completion/useColumnCompletion.ts`** — hook orchestrateur :
   - état `items: CompletionItem[]`, `running`, `costUsd`, `phase: 'idle'|'preview'|'applying'`.
   - `runPreview(input): Promise<CompletionItem[]>` — 1 lot des `previewCount` (5) premières
     lignes de la portée ; **n'écrit rien** dans le store.
   - `runAll(input): Promise<void>` — tous les lots de la portée ; `updateCell` après chaque
     lot ; progression `lot N/total` ; `abortRef` testé entre lots.
   - `abort()`.
3. **`src/features/excel/ai-completion/ColumnCompletionModal.tsx`** — UI (pattern
   `ScrapingModal`/`MatchPreviewModal`, lazy-loaded) :
   - **Prompt** : textarea libre ; hint « référencez vos colonnes avec `[Nom]` » + puces
     d'insertion en 1 clic des colonnes existantes.
   - **Destination** : radio ◉ *Nouvelle colonne* (champ nom, défaut « Résultat IA ») /
     ○ *Colonne existante* (sélecteur) — l'écrasement affiche une **case de confirmation**.
   - **Portée** : radio ◉ *Toutes les lignes (N)* / ○ *Sélection / filtre courant (M)*.
   - **Aperçu (5 lignes)** : bouton → tableau `source(s) → résultat` ; activé tant que rien
     n'a été appliqué.
   - **Appliquer à tout** : désactivé tant qu'aucun aperçu n'a été lancé dans la session ;
     barre de progression (lot N/total + coût USD live) + bouton **Annuler**.
4. **`src/pages/DataPage.tsx`** — bouton toolbar « IA complétion » (icône `Wand2`) à côté de
   « Scraper » ; `useState` d'ouverture ; montage `<Suspense>` lazy du modal.
5. **`src/features/ai/llmRouter.ts`** — nouvelle `LLMTask` `'data.columnCompletion'` +
   entrée `TASK_ROUTING` (primary `claude`, fallback `gemini-3.1-pro-preview` — JSON fiable,
   cf. retours connus sur gemini-3.5-flash) + `TASK_TEMPERATURE` ≈ 0.4.

## Flux de données

```
Ouvrir modal
 → saisir prompt (référence [Description]), destination, portée
 → Aperçu : buildChunks(portée).slice(0,1) sur 5 lignes → generateJson → tableau (aucune écriture)
 → valider visuellement
 → Appliquer : pour chaque lot de 20 → buildBatchPrompt → generateJson → mapResults
      → (si nouvelle colonne et pas encore créée) addColumn
      → updateCell(rowId, colonneCible, valeur) pour chaque ligne du lot
      → progression + coût (recordAiUsage)
 → auto-save Firestore (debounce existant)
```

## Gestion d'erreurs / cas limites

- **Écraser** une colonne existante : case de confirmation obligatoire.
- **Ligne source vide** (toutes les références `[...]` vides) : ignorée, pas d'appel ;
  cellule cible laissée inchangée, item marqué « ignorée ».
- **Lot incomplet** (LLM renvoie < n résultats) : `generateJson` valide/réessaie via le
  schéma ; en dernier recours, `mapResults` ne remplit que les index reçus ; les lignes
  manquantes sont marquées « échec ». **Réessai (v1)** : relancer « Appliquer » retraite toute la
  portée et **réécrit la même colonne cible** (garde-fou anti-doublon : la colonne créée en mode
  « nouvelle colonne » est mémorisée pour la session, pas recréée à chaque clic). Le retry ciblé
  des *seules* lignes en échec est **hors périmètre v1** (voir Hors périmètre).
- **Annulation** : `abortRef` testé entre les lots ; le lot en cours se termine (pas
  d'interruption au milieu d'un appel) ; les lots restants passent « annulé ».
- **Erreurs répétées (provider indisponible)** : un circuit-breaker arrête le run après 3 lots
  consécutifs en échec (`callBatch` lève) ; les lignes des lots non tentés sont marquées
  `'aborted'` ; les lignes déjà écrites sont conservées.
- **Aperçu obligatoire** avant le premier « Appliquer » d'une session pour border le coût.

## Tests

- `columnCompletionEngine.test.ts` (cœur, sans réseau) :
  - `buildChunks` : 174 lignes / 20 → 9 lots (dernier = 14).
  - `resolveColumnRefs` : `"Nom court de [Description]"` + ligne → texte résolu ; référence
    inconnue → vide ; match par label ET par clé.
  - `buildBatchPrompt` : numérotation 0..n-1, une entrée par ligne du lot.
  - `mapResults` : array indexé → `{rowId→valeur}` ; index manquant absent du résultat ;
    index hors plage → lot rejeté (erreur levée, lot entier `failed`).
- Hook : test léger de la boucle (mock `generateJson`) — abort entre lots, agrégation du coût,
  appel `updateCell` aux bons (rowId, colKey). (Si trop couplé au store, couvrir par l'engine
  + un test d'intégration ciblé.)

## Hors périmètre (évolutions ultérieures)

- **Colonne « formule IA » recalculable** (le prompt vit dans la `ExcelColumn`, régénération à
  la demande comme `formulaEngine`).
- **Multi-colonnes cibles** en un run (un prompt → plusieurs colonnes).
- **Reprise/historique** des runs IA complétion.
- **Retry ciblé des seules lignes en échec** (recalcul du scope = lignes `failed` uniquement) :
  v1 retraite toute la portée sur la même colonne.
