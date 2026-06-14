# Reformater (IA) au changement de format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand l'utilisateur change le format dans le panneau PAGE, réadapter automatiquement le contenu au nouveau format via le moteur de re-layout LLM existant, en créant une nouvelle page adaptée (page d'origine intacte).

**Architecture:** Fine couche d'orchestration au-dessus du moteur existant (`relayoutToFormats` / `useDeclineToPages`). Trois ajustements : (1) une règle de déclenchement pure et testable ; (2) une option de navigation vers la page créée dans `useDeclineToPages` + correctif de `navigateToPage` qui n'applique pas aujourd'hui les dimensions de page au canvas ; (3) un hook mince `useReformatPage` branché dans `PagePanel`.

**Tech Stack:** React 18, TypeScript strict (project references → vérifier avec `npx tsc -b`), Zustand v4, Fabric.js v7, Vitest, Sonner (via `@/lib/notify`), `withProgress` (`@/stores/progress.store`).

**Spec:** `docs/superpowers/specs/2026-06-14-reformat-ia-relayout-page-design.md`

---

## File Structure

- **Create** `src/features/export/reformatRule.ts` — fonction pure `shouldReformat(...)` + `buildReformatTarget(...)`. Aucune dépendance React/Fabric. Testable isolément.
- **Create** `src/features/export/reformatRule.test.ts` — tests Vitest de la règle.
- **Modify** `src/features/export/useDeclineToPages.ts` — ajouter l'option `navigateToLast` au callback ; navigation via `usePageNavigation`.
- **Modify** `src/features/editor/usePageNavigation.ts` — appliquer `page.width/height` au canvas (`setCanvasSize`) lors de la navigation.
- **Create** `src/features/export/useReformatPage.ts` — hook mince : applique la règle, construit la cible, appelle `declineToPages([target], { navigateToLast:true })` sous `withProgress` + `notify`.
- **Modify** `src/components/panels/PagePanel.tsx` — `applySize` route vers `useReformatPage` ou retombe sur `setCanvasSize` ; état de chargement local.

Conventions projet : composants ≤150 lignes, hooks `useCamelCase.ts`, pas de logique métier dans l'UI, typer explicitement (pas d'`any`), réponses/commentaires en français. Vérif types : **`npx tsc -b`** (jamais `tsc --noEmit`). Tests : `npm run test:run`.

---

## Task 1 : Règle de déclenchement pure (`reformatRule.ts`)

**Files:**
- Create: `src/features/export/reformatRule.ts`
- Test: `src/features/export/reformatRule.test.ts`

La règle décide si un changement de format doit lancer le re-layout IA (nouvelle page) ou simplement retailler la page courante en place. Elle construit aussi la `DeclineTarget` à partir du format choisi. Pure (aucun accès store/Fabric) pour être testable.

- [ ] **Step 1: Write the failing test**

Create `src/features/export/reformatRule.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldReformat, buildReformatTarget } from './reformatRule'

describe('shouldReformat', () => {
  it('refuse si la page n’a aucun objet de design', () => {
    expect(
      shouldReformat({ designObjectCount: 0, srcW: 595, srcH: 842, dstW: 842, dstH: 595 }),
    ).toBe(false)
  })

  it('refuse si les dimensions sont inchangées (arrondi)', () => {
    expect(
      shouldReformat({ designObjectCount: 3, srcW: 842, srcH: 595, dstW: 842.4, dstH: 594.6 }),
    ).toBe(false)
  })

  it('accepte si contenu présent et dimensions réellement différentes', () => {
    expect(
      shouldReformat({ designObjectCount: 1, srcW: 595, srcH: 842, dstW: 1684, dstH: 1191 }),
    ).toBe(true)
  })
})

describe('buildReformatTarget', () => {
  it('produit un id déterministe et un label depuis un preset', () => {
    expect(buildReformatTarget(842, 595, 'A4 Paysage')).toEqual({
      id: 'reformat-842x595',
      label: 'A4 Paysage',
      w: 842,
      h: 595,
    })
  })

  it('génère un label en mm quand aucun nom de preset n’est fourni', () => {
    // 595 pt → 210 mm, 842 pt → 297 mm (A4)
    const t = buildReformatTarget(595, 842)
    expect(t.id).toBe('reformat-595x842')
    expect(t.label).toBe('210 × 297 mm')
    expect(t.w).toBe(595)
    expect(t.h).toBe(842)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/export/reformatRule.test.ts`
Expected: FAIL — `Cannot find module './reformatRule'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/export/reformatRule.ts`:

```ts
// src/features/export/reformatRule.ts
// Règle PURE décidant si un changement de format doit lancer le re-layout IA
// (nouvelle page adaptée) plutôt qu'une simple retaille en place, et construction
// de la cible de format. Aucune dépendance React/Fabric : testable isolément.
import type { DeclineTarget } from './declineLayout'
import { canvasPxToMm } from '@/features/print/dimensions'

export interface ReformatDecisionInput {
  /** Nombre d'objets de design (hors grille / marques / fond de page). */
  designObjectCount: number
  srcW: number
  srcH: number
  dstW: number
  dstH: number
}

/** Vrai si l'auto-reformat IA doit se déclencher : il faut du contenu à adapter
 * ET un changement de dimensions réel (comparé sur valeurs arrondies au pt). */
export function shouldReformat({ designObjectCount, srcW, srcH, dstW, dstH }: ReformatDecisionInput): boolean {
  if (designObjectCount < 1) return false
  const sameW = Math.round(srcW) === Math.round(dstW)
  const sameH = Math.round(srcH) === Math.round(dstH)
  if (sameW && sameH) return false
  return true
}

/** Construit la cible de re-layout. `presetLabel` fourni → on l'utilise comme
 * libellé ; sinon libellé en mm (cohérent avec l'affichage du panneau PAGE).
 * `id` déterministe pour permettre l'idempotence (régénérer la même page adaptée). */
export function buildReformatTarget(wPt: number, hPt: number, presetLabel?: string): DeclineTarget {
  const w = Math.round(wPt)
  const h = Math.round(hPt)
  const label = presetLabel ?? `${Math.round(canvasPxToMm(w))} × ${Math.round(canvasPxToMm(h))} mm`
  return { id: `reformat-${w}x${h}`, label, w, h }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/export/reformatRule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/export/reformatRule.ts src/features/export/reformatRule.test.ts
git commit -m "feat(export): règle pure de déclenchement du reformat IA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Appliquer les dimensions de page à la navigation (`usePageNavigation.ts`)

**Files:**
- Modify: `src/features/editor/usePageNavigation.ts:21-45`

Correctif requis : `navigateToPage` charge le `canvasJSON` de la page cible mais laisse le canvas aux dimensions de la page précédente. Sans ce correctif, la page adaptée s'afficherait au format de la page source. On applique `page.width/height` via `setCanvasSize` du store UI (ce qui **recale automatiquement le viewport** grâce à l'effet existant de `CanvasContainer.tsx:148-149`, déclenché par `[canvasWidth, canvasHeight]`), puis on rafraîchit le rectangle de fond de page via `ensurePageBgRect` (fonction exportée de `useCanvas.ts:32`).

> Note : ce module n'a pas de test unitaire existant (dépend du canvas Fabric global). On le valide par `tsc -b` + le smoke test de la Task 6. Pas de nouveau test unitaire ici (la logique ajoutée est un simple appel store conditionnel). Ne PAS importer `fitToContainer` : c'est un `useCallback` interne au hook `useCanvas`, non exporté — le refit est déjà géré par l'effet de `CanvasContainer`.

- [ ] **Step 1: Modifier `navigateToPage`**

Dans `src/features/editor/usePageNavigation.ts`, ajouter les imports en tête de fichier (après les imports existants) :

```ts
import { useUIStore } from '@/stores/ui.store'
import { ensurePageBgRect } from './useCanvas'
```

Puis, dans `navigateToPage`, juste après `if (!newPage) return` (ligne ~30) et avant le nettoyage des objets, appliquer les dimensions de la page cible :

```ts
      // La page cible peut avoir un format différent : on l'applique au canvas
      // (sinon le contenu chargé s'afficherait aux dimensions de la page précédente).
      // setCanvasSize recale aussi le viewport via l'effet de CanvasContainer.
      if (newPage.width && newPage.height) {
        useUIStore.getState().setCanvasSize(newPage.width, newPage.height)
      }
```

Et juste après `canvas.requestRenderAll()` (avant `syncToStore(canvas)`), rafraîchir le fond de page au nouveau format :

```ts
      ensurePageBgRect(canvas)
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/editor/usePageNavigation.ts src/features/editor/useCanvas.ts
git commit -m "fix(editor): appliquer les dimensions de la page cible à la navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Option `navigateToLast` dans `useDeclineToPages`

**Files:**
- Modify: `src/features/export/useDeclineToPages.ts:51-110`

`declineToPages` revient aujourd'hui sur la page source. On ajoute une option pour naviguer vers la **dernière** page créée, via `navigateToPage` (pour charger le `canvasJSON` et appliquer le nouveau format grâce à la Task 2). On gère aussi l'**idempotence de format** : si une cible a le même `id` qu'une page déjà créée en fin de liste (régénération du même format), on met à jour cette page au lieu d'en empiler une nouvelle. Comme `id` de cible n'est pas stocké sur la page, on repère via `label` ET dimensions de la dernière page.

- [ ] **Step 1: Modifier la signature et l'import**

En tête de `useDeclineToPages.ts`, ajouter :

```ts
import { usePageNavigation } from '@/features/editor/usePageNavigation'
```

Remplacer la signature du `useCallback` pour accepter des options. Le bloc actuel :

```ts
  const declineToPages = useCallback(
    async (targets: readonly DeclineTarget[]): Promise<DeclineOutcome> => {
```

devient :

```ts
  const { navigateToPage } = usePageNavigation()
  const declineToPages = useCallback(
    async (
      targets: readonly DeclineTarget[],
      options?: { navigateToLast?: boolean },
    ): Promise<DeclineOutcome> => {
```

> Le hook `usePageNavigation()` doit être appelé au niveau du composant `useDeclineToPages` (corps de la fonction hook), pas dans le `useCallback`. Le placer juste avant `const declineToPages = useCallback(`.

- [ ] **Step 2: Idempotence + navigation à la fin**

Dans la boucle `targets.forEach((target) => { ... })`, remplacer le corps par une version qui réutilise une page existante de mêmes `label`+dimensions si elle est en fin de liste :

```ts
      targets.forEach((target) => {
        const projected = byFormat[target.id] ?? []
        const json = JSON.stringify({ ...serialized, objects: projected })
        const existing = usePagesStore.getState().pages
        const last = existing[existing.length - 1]
        // Idempotence de format : ré-appliquer le même format met à jour la
        // dernière page adaptée au lieu d'en empiler une nouvelle.
        const reuse =
          last && last.label === target.label &&
          Math.round(last.width) === target.w && Math.round(last.height) === target.h
        if (reuse && last) {
          updatePage(last.id, { canvasJSON: json, label: target.label })
          created++
          return
        }
        // addPage déplace currentPageIndex sur la nouvelle page (en fin de liste).
        addPage(target.w, target.h)
        const next = usePagesStore.getState().pages
        const newPage = next[next.length - 1]
        if (newPage) {
          updatePage(newPage.id, { canvasJSON: json, label: target.label })
          created++
        }
      })
```

Puis remplacer la fin de la fonction (le bloc `setCurrentPage(...)` + `return`) par :

```ts
      if (options?.navigateToLast) {
        const finalPages = usePagesStore.getState().pages
        await navigateToPage(finalPages.length - 1)
      } else {
        // Le canvas affiche toujours la page source : on y recale l'index.
        setCurrentPage(Math.min(originalIndex, pages.length - 1))
      }
      return { created, usedFallback }
```

- [ ] **Step 3: Étendre les dépendances du `useCallback`**

Ajouter `navigateToPage` au tableau de dépendances du `useCallback` (actuellement `[]`) :

```ts
    [navigateToPage],
  )
```

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur. Vérifier que `ExportModal.tsx` (appelant existant sans options) compile toujours — `options` est optionnel, donc OK.

- [ ] **Step 5: Commit**

```bash
git add src/features/export/useDeclineToPages.ts
git commit -m "feat(export): option navigateToLast + idempotence de format dans declineToPages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Hook d'orchestration `useReformatPage`

**Files:**
- Create: `src/features/export/useReformatPage.ts`

Hook mince qui encapsule : lecture du nombre d'objets de design sur le canvas, évaluation de `shouldReformat`, construction de la cible, appel `declineToPages([target], { navigateToLast:true })` sous `withProgress`, et notifications. Retourne `reformatPage(wPt, hPt, presetLabel?)` qui renvoie `true` si le re-layout IA a été lancé (l'appelant sait alors qu'il ne doit PAS retailler la page en place).

- [ ] **Step 1: Créer le hook**

Create `src/features/export/useReformatPage.ts`:

```ts
// src/features/export/useReformatPage.ts
// Orchestration UI du « Reformater (IA) » : au changement de format, décide
// (shouldReformat) de lancer le re-layout LLM vers une NOUVELLE page adaptée
// (page source intacte). Réutilise le moteur existant via declineToPages.
import { useCallback } from 'react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useUIStore } from '@/stores/ui.store'
import { withProgress } from '@/stores/progress.store'
import { notify } from '@/lib/notify'
import { useDeclineToPages } from './useDeclineToPages'
import { shouldReformat, buildReformatTarget } from './reformatRule'

export function useReformatPage() {
  const { declineToPages } = useDeclineToPages()

  /** Lance le re-layout IA vers une nouvelle page si la règle l'autorise.
   * Renvoie true si le re-layout a été déclenché (l'appelant ne doit alors PAS
   * retailler la page courante en place). */
  const reformatPage = useCallback(
    async (wPt: number, hPt: number, presetLabel?: string): Promise<boolean> => {
      const canvas = globalFabricCanvas
      if (!canvas) return false
      const { canvasWidth, canvasHeight } = useUIStore.getState()
      const designObjectCount = canvas
        .getObjects()
        .filter((o) => !o.data?.isGrid && !o.data?.isPrintMark).length

      if (!shouldReformat({ designObjectCount, srcW: canvasWidth, srcH: canvasHeight, dstW: wPt, dstH: hPt })) {
        return false
      }

      const target = buildReformatTarget(wPt, hPt, presetLabel)
      try {
        const { usedFallback } = await withProgress(
          'Adaptation IA du format…',
          () => declineToPages([target], { navigateToLast: true }),
        )
        if (usedFallback) {
          notify.warning('Format adapté (repli géométrique)', `Nouvelle page « ${target.label} » — adaptation IA indisponible, mise à l'échelle simple appliquée.`)
        } else {
          notify.success('Format adapté par IA', `Nouvelle page « ${target.label} » créée — la page d'origine est conservée.`)
        }
      } catch (err) {
        console.error('[reformatPage] échec :', err)
        notify.error('Adaptation du format échouée', String(err).slice(0, 160))
      }
      return true
    },
    [declineToPages],
  )

  return { reformatPage }
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur. (Si `o.data` est typé `unknown`, le projet expose déjà `data` sur `FabricObject` via `src/types/fabric.d.ts` — même accès que dans `useDeclineToPages.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/export/useReformatPage.ts
git commit -m "feat(export): hook useReformatPage (orchestration reformat IA → nouvelle page)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Brancher dans `PagePanel`

**Files:**
- Modify: `src/components/panels/PagePanel.tsx:35-87,152-174`

`applySize` devient le point de décision : il tente d'abord le re-layout IA (`reformatPage`), et ne retombe sur `setCanvasSize` (retaille en place) que si le re-layout n'a pas été déclenché. Un état de chargement local désactive presets + champs pendant l'adaptation.

- [ ] **Step 1: Importer le hook et ajouter l'état de chargement**

Dans `PagePanel.tsx`, ajouter l'import :

```ts
import { useReformatPage } from '@/features/export/useReformatPage'
```

Dans le composant, après la destructuration `useUIStore()`, ajouter :

```ts
  const { reformatPage } = useReformatPage()
  const [reformatting, setReformatting] = useState(false)
```

- [ ] **Step 2: Router `applySize` vers le re-layout IA**

Remplacer la fonction `applySize` actuelle par une version asynchrone qui tente d'abord le re-layout :

```ts
  // Reçoit les dimensions en pt (= px canvas). Tente le re-layout IA (nouvelle
  // page adaptée) ; à défaut (page vide / dims inchangées / canvas absent),
  // retaille la page courante en place comme avant.
  const applySize = async (wPt: number, hPt: number, presetLabel?: string) => {
    const cw = Math.max(50, wPt)
    const ch = Math.max(50, hPt)
    setWidthMm(roundMm(canvasPxToMm(cw)))
    setHeightMm(roundMm(canvasPxToMm(ch)))
    setReformatting(true)
    try {
      const handled = await reformatPage(cw, ch, presetLabel)
      if (handled) return
      setCanvasSize(cw, ch)
      triggerSave()
    } finally {
      setReformatting(false)
    }
  }
```

> Note : `applySizeMm` appelle déjà `applySize` — il devient implicitement asynchrone, aucun changement nécessaire de son corps. Le bouton « Origine » appelle `applySize(originWidth, originHeight)` sans label : la règle `shouldReformat` refusera si les dimensions == origine courante, donc retour à un simple `setCanvasSize` — comportement attendu.

- [ ] **Step 3: Passer le label de preset + désactiver pendant le chargement**

Dans la liste des presets (`FORMAT_PRESETS.map`), passer le label du preset à `applySize` :

```tsx
              <button key={p.label} onClick={() => applySize(p.w, p.h, p.label)} disabled={reformatting}
                className={`px-2 py-1 text-[10px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
                {p.label}
              </button>
```

Ajouter `disabled={reformatting}` aux deux champs `<input type="number" ...>` (largeur et hauteur) et au bouton « Origine ».

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier le build, le lint, les tests et le code mort**

Run:
```bash
npx tsc -b && npm run lint && npm run test:run && npx knip
```
Expected : types OK, lint sans erreur bloquante, tests verts (dont `reformatRule.test.ts`), knip exit 0 (les nouveaux hooks/fonctions sont importés → pas de code mort ; `shouldReformat`/`buildReformatTarget` sont exportés ET utilisés par `useReformatPage` + tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/PagePanel.tsx
git commit -m "feat(page): changement de format → re-layout IA vers nouvelle page adaptée

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : Smoke test manuel + documentation

**Files:**
- Modify: `docs/TESTS-A-FAIRE.md`

La qualité du re-layout IA n'est vérifiable qu'avec une vraie clé LLM + budget (cf. mémoire `project_declinees_relayout_llm`). On documente le test manuel.

- [ ] **Step 1: Ajouter l'entrée de test**

Ajouter à `docs/TESTS-A-FAIRE.md` une section :

```markdown
## Reformater (IA) au changement de format

- [ ] Ouvrir un projet avec un seul élément collé en haut-à-gauche d'une grande page (ex. tuile produit sur A4).
- [ ] Panneau PAGE → choisir un format de ratio différent (ex. A4 Paysage, ou saisir un grand format type A1).
- [ ] Vérifier : toast « Adaptation IA du format… », puis une NOUVELLE page au format cible apparaît et devient courante.
- [ ] Vérifier : sur la page adaptée, le contenu est replacé/redimensionné cohéremment (fond remplissant, contenu recentré), objets éditables.
- [ ] Vérifier : la page d'origine (A4) est INTACTE (format + contenu).
- [ ] Ré-appliquer le MÊME format → la page adaptée est régénérée, PAS empilée.
- [ ] Sur une page VIDE, changer le format → retaille en place, aucune nouvelle page créée.
- [ ] Sans clé LLM (ou budget épuisé) → toast « repli géométrique », contenu mis à l'échelle contain+centré sur la nouvelle page.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TESTS-A-FAIRE.md
git commit -m "docs: checklist smoke test du reformat IA au changement de format

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (effectuée à la rédaction)

**Couverture spec :**
- Déclenchement auto au changement de format → Task 5 (`applySize` route vers `reformatPage`).
- Nouvelle page, original intact → Tasks 3-4 (`declineToPages` crée une page, `navigateToLast`).
- Réutilisation moteur existant, pas de pipeline parallèle → Tasks 3-4 réutilisent `relayoutToFormats` via `declineToPages`.
- Règle anti-spam (page vide / dims inchangées) → Task 1 (`shouldReformat`).
- Idempotence de format → Task 3 (réutilisation de la dernière page).
- Correctif navigation (dims de page appliquées) → Task 2.
- Repli sans LLM garanti → hérité de `relayoutToFormats`/`declineToPages`, signalé via `usedFallback` (Task 4).
- Smoke test manuel → Task 6.

**Placeholders :** aucun TODO/TBD ; chaque step montre le code.

**Cohérence des types :** `shouldReformat` / `buildReformatTarget` (Task 1) consommés tels quels par `useReformatPage` (Task 4) ; `declineToPages(targets, options?)` (Task 3) appelé avec `{ navigateToLast:true }` (Task 4) ; `reformatPage(wPt, hPt, presetLabel?)` (Task 4) appelé par `applySize` (Task 5). `DeclineTarget` réutilisé (champ `id/label/w/h`), `notify`/`withProgress` aux mêmes chemins que `ExportModal.tsx`.

**Risque résiduel :** Task 2 s'appuie sur le refit viewport automatique de `CanvasContainer` (effet `[canvasWidth, canvasHeight]`) plutôt que sur un appel direct à `fitToContainer` (non exporté) — vérifié dans `CanvasContainer.tsx:148-149`.
