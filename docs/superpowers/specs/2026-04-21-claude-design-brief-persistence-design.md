# Claude Design — Persistance du brief dans Firestore

**Date** : 2026-04-21
**Auteur** : fbilard

## Contexte et problème

Le panel `DesignPromptPanel` (src/features/ai-design/DesignPromptPanel.tsx) permet de saisir un brief (champ « Votre brief ») et des paramètres de génération (format, style, fond perdu, palette) qui sont consommés par `useGenerateDesign` pour produire un design SVG via le pipeline Art Director → SVG Engineer.

Ces valeurs vivent aujourd'hui dans 7 `useState` locaux au panel. Elles sont perdues :
- au reload de la page,
- au changement de projet,
- quand le panel est démonté/remonté (il est `CollapsiblePanel`, draggable via `@dnd-kit`).

L'utilisateur veut pouvoir modifier le brief et les paramètres après une génération réussie pour itérer sur le résultat. Il faut donc persister ces valeurs dans Firestore au même titre que `canvasData`, `paletteColors`, `dataSource`, etc.

## Approche retenue

Stocker un champ unique `claudeDesignBrief` (JSON stringifié) sur le document `projects/{projectId}`. Un store Zustand dédié détient l'état en mémoire ; l'autosave/load existant lit/écrit via le store.

Rejeté :
- Sous-collection `projects/{id}/briefs/{briefId}` — overkill, pas de besoin d'historique.
- Persistance localStorage (Zustand `persist`) — incompatible avec le besoin Firebase, multi-device, partage de projet.

## Shape Firestore

Ajouté au document `projects/{projectId}` :

```ts
claudeDesignBrief: string | null
```

Contenu (après `JSON.parse`) :

```ts
interface DesignBriefState {
  prompt: string
  formatId: string              // id PRINT_FORMAT ou 'custom'
  customWidthMm?: number
  customHeightMm?: number
  style: DesignStyle            // 'corporate' | 'minimaliste' | …
  includeBleed: boolean
  paletteText: string           // texte brut du champ — pas parsé
  updatedAt: number             // epoch ms
}
```

`paletteText` est stocké brut (non parsé) pour respecter le contenu exact du champ UI. La validation hex (`/^#[0-9a-fA-F]{6}$/`) reste dans `onSubmit` du panel.

## Store Zustand

Nouveau fichier `src/stores/designBrief.store.ts` :

```ts
interface DesignBriefStore {
  brief: DesignBriefState | null
  setBrief: (patch: Partial<DesignBriefState>) => void
  resetBrief: () => void
  hydrateBrief: (brief: DesignBriefState | null) => void
}

// Sélecteur utilitaire
export function useDesignBrief(): DesignBriefState
```

- `brief === null` tant qu'aucun projet n'est chargé ou qu'un projet n'a jamais enregistré de brief.
- `useDesignBrief()` renvoie `brief ?? DEFAULTS`, où `DEFAULTS = { prompt: '', formatId: DEFAULT_FORMAT_ID, customWidthMm: undefined, customHeightMm: undefined, style: 'corporate', includeBleed: true, paletteText: '', updatedAt: 0 }`.
- `setBrief` fait un patch partiel et met `updatedAt = Date.now()`.
- `resetBrief` remet à `null` (appelé à chaque changement de projet).
- `hydrateBrief` écrase entièrement avec la valeur fournie (appelé par `useLoadCanvas`).

## Intégration

### `DesignPromptPanel.tsx`
Remplace les `useState` locaux (`prompt`, `formatId`, `customWidthMm`, `customHeightMm`, `style`, `includeBleed`, `paletteText`) par des lectures du store :

```ts
const brief = useDesignBrief()
const setBrief = useDesignBriefStore((s) => s.setBrief)
```

Chaque handler `onChange` appelle `setBrief({ champ: valeur })`.

La logique métier (sync format ↔ canvas via les deux `useEffect`, construction de `DesignRequest` dans `onSubmit`) lit depuis `brief` au lieu des states locaux. `progressDismissed` reste un `useState` local (purement UI, éphémère).

### `useAutoSave.ts`
Dans le `updateDoc(...)`, ajouter :

```ts
const briefState = useDesignBriefStore.getState().brief
// ...
claudeDesignBrief: briefState ? JSON.stringify(briefState) : null,
```

Déclencher `setSaveStatus('unsaved')` quand le store change : nouvel `useEffect` dans le hook qui `subscribe` au store et appelle `setSaveStatus('unsaved')` (guardé par `_loadingInProgress` pour ne pas marquer dirty pendant l'hydratation).

### `useLoadCanvas.ts`
Avant le load des données :

```ts
useDesignBriefStore.getState().resetBrief()
```

Après `getDoc(...)` et restauration canvas :

```ts
try {
  const raw = data.claudeDesignBrief
  const parsed = raw ? JSON.parse(raw) as DesignBriefState : null
  useDesignBriefStore.getState().hydrateBrief(parsed)
} catch {
  useDesignBriefStore.getState().hydrateBrief(null)
}
```

## Migration

Projets existants : champ `claudeDesignBrief` absent → `data.claudeDesignBrief` est `undefined` → `hydrateBrief(null)` → le panel rend les `DEFAULTS`. Aucune migration en base nécessaire.

## Tests

**Unit — `src/stores/designBrief.store.test.ts`** :
- `setBrief` applique un patch partiel sans écraser les autres champs, met à jour `updatedAt`.
- `resetBrief` remet `brief` à `null`.
- `hydrateBrief(null)` met `brief` à `null`.
- `hydrateBrief(obj)` écrase entièrement `brief`.
- `useDesignBrief` sélecteur : renvoie `DEFAULTS` quand `brief === null`, sinon renvoie `brief`.

**Manuel** :
1. Créer un projet → remplir brief + paramètres → reload page → valeurs restaurées.
2. Créer projet A avec brief `"affiche bleue"`. Naviguer vers projet B (sans brief) → panel doit afficher les defaults, pas `"affiche bleue"`.
3. Lancer une génération → après succès, le brief reste identique dans le panel (pas écrasé par le résultat LLM).
4. Modifier un champ → vérifier indicateur `unsaved`. Sauvegarder → reload → valeurs conservées.

## Non-objectifs

- Historique des briefs (une seule version stockée par projet).
- Sauvegarde dans une sous-collection.
- Synchronisation temps-réel multi-onglets (hérite du comportement actuel des autres champs projet — pas de listener Firestore live).
- Export/import du brief avec le projet dupliqué — à voir séparément si besoin (`useDuplicateProject.ts` copie déjà tout le doc, donc le champ sera dupliqué automatiquement).

## Risques et points de vigilance

- **Fuite inter-projet** : mitigée par `resetBrief()` au début de `useLoadCanvas`.
- **Marking unsaved au chargement** : mitigé par `_loadingInProgress` existant qui bloque l'autosave pendant le load. Le `subscribe` au store doit aussi respecter ce flag avant de marquer `unsaved`.
- **Debounce autosave** : `useAutoSave` actuel n'a pas de debounce interne — `globalSave()` est appelé explicitement (toolbar, blur, etc.). Ce spec ne change pas ce comportement. Si un debounce futur est ajouté, il couvrira le brief automatiquement.
