# Reformater « Fluide (IA) » par blocs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Au changement de format, ré-agencer le design via un LLM qui raisonne en BLOCS cohérents ; chaque bloc est transformé par une seule affine (composition interne verrouillée), avec repli `cover` déterministe garanti.

**Architecture:** Réutilise la plomberie `declineToPages` + `buildDescriptors` + `renderSourceDataUri`. Nouveau module pur `fluidBlocks.ts` (apply + schémas) + orchestrateur `fluidRelayoutToFormat.ts` + tâche LLM `design.fluidRelayout`. `declineToPages` gagne un mode `transform:'fluid'`. `useReformatPage` passe à `'fluid'`.

**Tech Stack:** React 18, TS strict (project references → `npx tsc -b`), Zod, Vitest. Spec : `docs/superpowers/specs/2026-06-14-fluid-blocks-relayout-design.md`.

---

## Task 1 : `fluidBlocks.ts` — schémas + `applyFluidBlocks` (pur, TDD)

**Files:** Create `src/features/export/fluidBlocks.ts`, `src/features/export/fluidBlocks.test.ts`.

- [ ] **Step 1 : test qui échoue** — `src/features/export/fluidBlocks.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { applyFluidBlocks, type FluidBlock } from './fluidBlocks'

const obj = (left: number, top: number, w = 100, h = 100) => ({ left, top, width: w, height: h, scaleX: 1, scaleY: 1 })

describe('applyFluidBlocks', () => {
  it('préserve la composition INTERNE d’un bloc (même facteur pour tous ses objets)', () => {
    // Deux objets d’un même bloc, source 1000×1000 → cible 500×500.
    // Bloc région plein cadre (0,0,1,1). bbox bloc = (100,100)..(300,300) → bw=bh=200.
    // contain s = min(500/200,500/200)=2.5 ; bloc centré: bw*s=500 → offX=offY=0 ; -x0*s = -250.
    const objects = [obj(100, 100), obj(200, 200)]
    const blocks: FluidBlock[] = [{ indices: [0, 1], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 500, 500, blocks)
    // o0: (100-100)*2.5 + 0 = 0 ; o1: (200-100)*2.5 + 0 = 250
    expect(out[0].left).toBe(0)
    expect(out[1].left).toBe(250)
    // écart relatif conservé (×s) : 250-0 = 2.5×(200-100)
    expect((out[1].left as number) - (out[0].left as number)).toBe(250)
    expect(out[0].scaleX).toBe(2.5)
    expect(out[1].scaleX).toBe(2.5)
  })

  it('objet sans bloc → repli cover (jamais laissé en place brut)', () => {
    // Objet d’index 1 non assigné. Source 1000×1000 → 1000×2000, cover s=max(1,2)=2.
    const objects = [obj(0, 0), obj(100, 100)]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 1000, 2000, blocks)
    expect(out[1].scaleX).toBe(2) // cover overscale
    expect(out[1].left).toBe(100 * 2 + (1000 - 1000 * 2) / 2) // = -300
  })

  it('bloc à bbox nulle → ses objets tombent en repli cover', () => {
    const objects = [{ left: 50, top: 50, width: 0, height: 0, scaleX: 1, scaleY: 1 }]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 500, 500, blocks)
    // cover d’un objet à bbox nulle : projectObjectsToFormat le scale quand même (s défini)
    expect(out[0].left).toBeDefined()
    expect(out[0]).not.toBe(objects[0]) // nouvel objet
  })

  it('région hors bornes clampée + ne mute pas la source', () => {
    const src = [obj(0, 0)]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: -1, yPct: 0, wPct: 5, hPct: 1 }]
    const out = applyFluidBlocks(src, 800, 600, 400, 300, blocks)
    expect(Number.isFinite(out[0].left as number)).toBe(true)
    expect(src[0].left).toBe(0)
  })
})
```

- [ ] **Step 2 : lancer → échec** — `npm run test:run -- src/features/export/fluidBlocks.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : implémentation** — `src/features/export/fluidBlocks.ts` :

```ts
// src/features/export/fluidBlocks.ts
// Re-layout « fluide » par BLOCS. L'IA regroupe les éléments en blocs cohérents
// et place chaque bloc ; ICI on applique UNE SEULE affine par bloc (contain dans
// sa région) → la composition INTERNE d'un bloc est verrouillée (pas d'éparpillement
// possible). Module PUR (aucune dépendance Fabric/React). Schémas pour le LLM.
import { z } from 'zod'
import { projectObjectsToFormat } from './declineLayout'
import type { DesignObject } from './relayoutMultiFormat'

/** Bloc placé par le LLM : indices des objets + région cible (fractions [0..1]). */
export interface FluidBlock {
  indices: number[]
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

/** Schéma Zod (structure ; bornes clampées à l'application). */
export const FluidSchema = z.object({
  formats: z.array(
    z.object({
      id: z.string(),
      blocks: z.array(
        z.object({
          indices: z.array(z.number().int()),
          xPct: z.number(),
          yPct: z.number(),
          wPct: z.number(),
          hPct: z.number(),
        }),
      ),
    }),
  ),
})

/** JSON Schema (Gemini responseSchema / Claude input_schema). */
export const fluidJsonSchema = {
  type: 'object',
  properties: {
    formats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indices: { type: 'array', items: { type: 'number' } },
                xPct: { type: 'number' },
                yPct: { type: 'number' },
                wPct: { type: 'number' },
                hPct: { type: 'number' },
              },
              required: ['indices', 'xPct', 'yPct', 'wPct', 'hPct'],
            },
          },
        },
        required: ['id', 'blocks'],
      },
    },
  },
  required: ['formats'],
} as const

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo

/**
 * Applique le placement par bloc. Pour chaque bloc : bbox source de ses objets →
 * contain dans la région cible → MÊME facteur d'échelle + translation pour TOUS
 * ses objets (compo interne intacte). Objets sans bloc OU bloc à bbox nulle →
 * repli cover (`projectObjectsToFormat(...,'cover')`). Sources non mutées.
 */
export function applyFluidBlocks<T extends DesignObject>(
  objects: readonly T[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  blocks: readonly FluidBlock[],
): T[] {
  const result = objects.map((o) => o) // placeholders, remplacés ci-dessous
  const assigned = new Set<number>()

  for (const b of blocks) {
    const idxs = b.indices.filter((i) => i >= 0 && i < objects.length && !assigned.has(i))
    if (idxs.length === 0) continue
    // bbox source du bloc
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const i of idxs) {
      const o = objects[i]
      const ox = o.left ?? 0
      const oy = o.top ?? 0
      const ow = (o.width ?? 0) * (o.scaleX ?? 1)
      const oh = (o.height ?? 0) * (o.scaleY ?? 1)
      x0 = Math.min(x0, ox); y0 = Math.min(y0, oy)
      x1 = Math.max(x1, ox + ow); y1 = Math.max(y1, oy + oh)
    }
    const bw = x1 - x0
    const bh = y1 - y0
    if (!(bw > 0) || !(bh > 0)) continue // bbox nulle → laissés au repli cover
    const rx = clamp(b.xPct, 0, 1) * dstW
    const ry = clamp(b.yPct, 0, 1) * dstH
    const rw = Math.max(clamp(b.wPct, 0, 1), 0.01) * dstW
    const rh = Math.max(clamp(b.hPct, 0, 1), 0.01) * dstH
    const s = Math.min(rw / bw, rh / bh)
    const offX = rx + (rw - bw * s) / 2
    const offY = ry + (rh - bh * s) / 2
    for (const i of idxs) {
      const o = objects[i]
      result[i] = {
        ...o,
        left: ((o.left ?? 0) - x0) * s + offX,
        top: ((o.top ?? 0) - y0) * s + offY,
        scaleX: (o.scaleX ?? 1) * s,
        scaleY: (o.scaleY ?? 1) * s,
      }
      assigned.add(i)
    }
  }

  // Objets non assignés (aucun bloc, ou bloc à bbox nulle) → repli cover.
  return result.map((o, i) =>
    assigned.has(i) ? o : projectObjectsToFormat([objects[i]], srcW, srcH, dstW, dstH, 'cover')[0],
  )
}
```

- [ ] **Step 4 : lancer → succès** — `npm run test:run -- src/features/export/fluidBlocks.test.ts` → PASS (4 tests). Puis `npx tsc -b` → exit 0.

> ⚠ knip signalera `FluidSchema`/`fluidJsonSchema` inutilisés jusqu'à la Task 3 — attendu, ne pas « ronger » ; la Task 3 les consomme. Ne pas faire de `npx knip` bloquant ici.

- [ ] **Step 5 : commit**

```bash
git add src/features/export/fluidBlocks.ts src/features/export/fluidBlocks.test.ts
git commit -m "feat(export): fluidBlocks — apply par bloc (compo interne verrouillée) + schémas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : tâche LLM `design.fluidRelayout` (`llmRouter.ts`)

**Files:** Modify `src/features/ai/llmRouter.ts`.

- [ ] **Step 1 : ajouter le type de tâche** — dans l'union `LLMTask`, juste après la ligne `| 'design.relayoutMultiFormat'` :

```ts
  | 'design.fluidRelayout'
```

- [ ] **Step 2 : ajouter le routage** — dans `TASK_ROUTING`, juste après la ligne `'design.relayoutMultiFormat': { … },` :

```ts
  'design.fluidRelayout': { primary: 'gemini', fallback: 'claude', model: 'gemini-3.1-pro-preview' },
```

- [ ] **Step 3 : ajouter la température** — dans la map des températures, juste après `'design.relayoutMultiFormat': 0,` :

```ts
  'design.fluidRelayout': 0,
```

- [ ] **Step 4 : types** — `npx tsc -b` → exit 0 (le `Record<LLMTask, …>` force l'exhaustivité : si une map oublie la clé, tsc échoue — corriger jusqu'au vert).

- [ ] **Step 5 : commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(ai): tâche LLM design.fluidRelayout (gemini→claude, temp 0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : orchestrateur `fluidRelayoutToFormat.ts`

**Files:** Create `src/features/export/fluidRelayoutToFormat.ts`.

Construit les descripteurs + prompt, appelle le LLM, applique `applyFluidBlocks`. **Repli cover garanti**, ne lève jamais.

- [ ] **Step 1 : créer le fichier**

```ts
// src/features/export/fluidRelayoutToFormat.ts
// Orchestration du re-layout « fluide » par blocs : image source + descripteurs
// par objet → LLM (regroupe en blocs + place les blocs) → applyFluidBlocks.
// RETOMBE sur projectObjectsToFormat(...,'cover') (composition entière préservée)
// en cas d'échec/indisponibilité. Ne lève jamais.
import { generateJson } from '@/features/ai/llmRouter'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import { buildDescriptors, type DesignObject } from './relayoutMultiFormat'
import { applyFluidBlocks, FluidSchema, fluidJsonSchema } from './fluidBlocks'

export interface FluidOutcome {
  objects: DesignObject[]
  usedFallback: boolean
}

const PROMPT = `Tu es directeur artistique. On te donne une AFFICHE/CRÉA (image de référence) et la liste de ses ÉLÉMENTS (index "i", "type", "role" éventuel, "text" éventuel, boîte source "xPct"/"yPct"/"wPct"/"hPct" en fractions [0..1] de la page source).

1) REGROUPE les éléments en 2 à 5 BLOCS cohérents — un bloc = des éléments qui forment une unité visuelle (le VISUEL PRODUIT et ce qui le recouvre, le bloc PRIX/PROMO, le bloc TEXTE, le FOND/CADRE). Chaque index "i" doit appartenir à EXACTEMENT un bloc.

2) Pour le FORMAT CIBLE (ratio différent de la source), PLACE chaque bloc : région "xPct"/"yPct" (coin haut-gauche, fractions [0..1] de la page CIBLE) et "wPct"/"hPct" (taille de la région). EXPLOITE l'espace selon l'orientation : en paysage, dispose les blocs CÔTE À CÔTE (ex. produit à gauche, prix/texte à droite) ; en portrait, EMPILE-les. Le bloc FOND/CADRE couvre toute la page (xPct=0,yPct=0,wPct=1,hPct=1). Préserve la hiérarchie (le prix reste proéminent, le logo petit). Ne fais pas déborder un bloc hors de la page.

Réponds UNIQUEMENT en JSON {"formats":[{"id":"<id format>","blocks":[{"indices":[…],"xPct":…,"yPct":…,"wPct":…,"hPct":…}]}]}.`

export async function fluidRelayoutToFormat(params: {
  imageDataUri: string
  objects: readonly DesignObject[]
  srcW: number
  srcH: number
  target: DeclineTarget
}): Promise<FluidOutcome> {
  const { imageDataUri, objects, srcW, srcH, target } = params
  const coverFallback = (): FluidOutcome => ({
    objects: projectObjectsToFormat(objects, srcW, srcH, target.w, target.h, 'cover'),
    usedFallback: true,
  })

  const descriptors = buildDescriptors(objects, srcW, srcH)
  if (descriptors.length === 0) return coverFallback()

  try {
    const prompt = `${PROMPT}

PAGE SOURCE : ${srcW}×${srcH} (ratio ${Math.round((srcW / srcH) * 100) / 100}).

FORMAT CIBLE : ${JSON.stringify({ id: target.id, label: target.label, w: target.w, h: target.h, ratio: Math.round((target.w / target.h) * 100) / 100 })}

ÉLÉMENTS :
${JSON.stringify(descriptors)}`

    const res = await generateJson({
      task: 'design.fluidRelayout',
      prompt,
      schema: FluidSchema,
      schemaForLLM: fluidJsonSchema,
      schemaForClaude: fluidJsonSchema,
      version: 'fluid-v1',
      imageDataUris: [imageDataUri],
    })
    const fmt = res.formats.find((f) => f.id === target.id) ?? res.formats[0]
    if (!fmt || fmt.blocks.length === 0) return coverFallback()
    return {
      objects: applyFluidBlocks(objects, srcW, srcH, target.w, target.h, fmt.blocks),
      usedFallback: false,
    }
  } catch (err) {
    console.warn('[fluidRelayoutToFormat] LLM indisponible, repli cover :', err)
    return coverFallback()
  }
}
```

- [ ] **Step 2 : types** — `npx tsc -b` → exit 0. Vérifier que `generateJson`'s options (`task`, `prompt`, `schema`, `schemaForLLM`, `schemaForClaude`, `version`, `imageDataUris`) correspondent à la signature réelle (modèle de référence : `src/features/export/relayoutToFormats.ts`). Adapter les noms d'options SEULEMENT s'ils diffèrent, en signalant l'écart.

- [ ] **Step 3 : knip** — `npx knip` → exit 0 attendu (ce module consomme `FluidSchema`/`fluidJsonSchema`/`applyFluidBlocks` ; il est lui-même consommé en Task 4). Si knip flagge `fluidRelayoutToFormat` comme inutilisé, c'est attendu jusqu'à la Task 4 — ne pas bloquer.

- [ ] **Step 4 : commit**

```bash
git add src/features/export/fluidRelayoutToFormat.ts
git commit -m "feat(export): orchestrateur fluidRelayoutToFormat (LLM blocs + repli cover)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : brancher `transform:'fluid'` dans `useDeclineToPages`

**Files:** Modify `src/features/export/useDeclineToPages.ts`.

- [ ] **Step 1 : import** — ajouter en tête :

```ts
import { fluidRelayoutToFormat } from './fluidRelayoutToFormat'
```

- [ ] **Step 2 : étendre le type d'option** — dans la signature, remplacer `transform?: 'ai' | 'contain' | 'cover'` par :

```ts
      options?: { navigateToLast?: boolean; transform?: 'ai' | 'contain' | 'cover' | 'fluid' },
```

- [ ] **Step 3 : brancher la branche fluid** — le bloc actuel calcule `byFormat`/`usedFallback`. Aujourd'hui il y a `if (transform === 'contain' || transform === 'cover') { … } else { … LLM 'ai' … }`. Insérer une branche `fluid` AVANT le `else`. Remplacer la structure par :

```ts
      let byFormat: Record<string, DesignObject[]>
      let usedFallback = false
      if (transform === 'contain' || transform === 'cover') {
        byFormat = Object.fromEntries(
          targets.map((t) => [
            t.id,
            projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h, transform),
          ]),
        )
      } else if (transform === 'fluid') {
        // Re-layout par blocs piloté LLM (image source requise pour la vision),
        // repli cover garanti par fluidRelayoutToFormat.
        const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
        if (!imageDataUri) {
          byFormat = Object.fromEntries(
            targets.map((t) => [
              t.id,
              projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h, 'cover'),
            ]),
          )
          usedFallback = true
        } else {
          const entries = await Promise.all(
            targets.map(async (t) => {
              const out = await fluidRelayoutToFormat({
                imageDataUri,
                objects: designObjects,
                srcW: canvasWidth,
                srcH: canvasHeight,
                target: t,
              })
              if (out.usedFallback) usedFallback = true
              return [t.id, out.objects] as const
            }),
          )
          byFormat = Object.fromEntries(entries)
        }
      } else {
        const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
        const outcome = imageDataUri
          ? await relayoutToFormats({
              imageDataUri,
              objects: designObjects,
              srcW: canvasWidth,
              srcH: canvasHeight,
              targets,
            })
          : {
              byFormat: Object.fromEntries(
                targets.map((t) => [
                  t.id,
                  projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h),
                ]),
              ),
              usedFallback: true,
            }
        byFormat = outcome.byFormat
        usedFallback = outcome.usedFallback
      }
```

(Le reste de la fonction — `targets.forEach` création de pages, navigation, `return` — est inchangé.)

- [ ] **Step 4 : types** — `npx tsc -b` → exit 0. `DesignObject` est déjà importé dans ce fichier ; sinon l'ajouter depuis `./relayoutMultiFormat`.

- [ ] **Step 5 : commit**

```bash
git add src/features/export/useDeclineToPages.ts
git commit -m "feat(export): declineToPages — mode transform:'fluid' (re-layout par blocs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : `useReformatPage` → `transform:'fluid'` + toast

**Files:** Modify `src/features/export/useReformatPage.ts`.

- [ ] **Step 1 : passer 'fluid' + récupérer usedFallback** — remplacer le bloc try actuel par :

```ts
      const target = buildReformatTarget(wPt, hPt, presetLabel)
      try {
        // « Mise en page fluide » : l'IA ré-agence le design par BLOCS cohérents
        // pour le nouveau format ; repli proportionnel (cover) garanti.
        const { usedFallback, updated } = await withProgress(
          'Mise en page fluide (IA)…',
          () => declineToPages([target], { navigateToLast: true, transform: 'fluid' }),
        )
        const verb = updated > 0 ? 'régénérée' : 'créée'
        if (usedFallback) {
          notify.warning('Format adapté (repli proportionnel)', `Page « ${target.label} » ${verb} — IA indisponible, mise à l'échelle proportionnelle appliquée.`)
        } else {
          notify.success('Mise en page fluide appliquée', `Page « ${target.label} » ${verb} — design ré-agencé par l'IA, page d'origine conservée.`)
        }
      } catch (err) {
        console.error('[reformatPage] échec :', err)
        notify.error('Adaptation du format échouée', String(err).slice(0, 160))
      }
      return true
```

- [ ] **Step 2 : vérif complète** — `npx tsc -b && npm run lint && npm run test:run && npx knip` → tout vert, knip exit 0 (toute la chaîne fluidBlocks→fluidRelayoutToFormat→declineToPages→useReformatPage est câblée).

- [ ] **Step 3 : commit**

```bash
git add src/features/export/useReformatPage.ts
git commit -m "feat(page): reformat = mise en page fluide IA par blocs (repli cover)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : doc smoke test

**Files:** Modify `docs/TESTS-A-FAIRE.md` (§A1bis).

- [ ] **Step 1** — mettre à jour §A1bis : le reformat utilise désormais la **mise en page fluide IA par blocs** (défaut), repli proportionnel `cover`. Cas clé à vérifier : flyer **portrait → A4 Paysage** → produit et bloc prix/texte **ré-agencés** (côte à côte) ; chaque bloc interne intact ; sans clé LLM → repli proportionnel.

- [ ] **Step 2 : commit**

```bash
git add docs/TESTS-A-FAIRE.md
git commit -m "docs: smoke test — reformat = mise en page fluide IA par blocs"
```

---

## Self-Review (à la rédaction)

- **Couverture spec** : applyFluidBlocks (T1), tâche LLM (T2), orchestrateur + prompt + repli (T3), branche declineToPages (T4), wiring + toast (T5), doc (T6). ✓
- **Compo interne garantie** : transformation unique par bloc (T1) — testée. ✓
- **Repli cover garanti** : fluidRelayoutToFormat try/catch + image absente (T3/T4). ✓
- **Pas de régression** : 'ai'/'contain'/'cover' inchangés ; déclinées export intactes. ✓
- **Types** : `FluidBlock`, `FluidSchema`, `fluidJsonSchema`, `applyFluidBlocks` (T1) consommés par `fluidRelayoutToFormat` (T3) ; `transform:'fluid'` (T4) appelé par `useReformatPage` (T5). ✓
- **Risque** : T2 doit ajouter la clé dans LES DEUX maps (`TASK_ROUTING` + températures) sinon `Record<LLMTask,…>` casse `tsc`. T3 doit vérifier la signature réelle de `generateJson` (modèle `relayoutToFormats.ts`).
