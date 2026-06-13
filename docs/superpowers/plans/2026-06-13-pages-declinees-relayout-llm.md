# Pages déclinées — re-layout multi-format piloté par LLM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'homothétie « contain + centré » de « Pages déclinées » par un re-layout piloté par LLM multimodal qui réadapte automatiquement la mise en page à chaque ratio cible, avec repli déterministe garanti.

**Architecture:** Un module pur (`relayoutMultiFormat.ts`) fait la traduction descripteurs↔objets Fabric (placement LLM en % → géométrie déterministe cover/contain). Un orchestrateur (`relayoutToFormats.ts`) appelle `generateJson` (image + descripteurs) et retombe sur `projectObjectsToFormat` en cas d'échec. Le hook `useDeclineToPages` rend le PNG source et crée les pages ; `ExportModal` gère l'attente IA et le toast de repli.

**Tech Stack:** TypeScript strict (ES2022), Fabric.js v7, Zod, Vitest, le routeur LLM existant (`generateJson`), pattern multimodal de `semanticLayout.ts`.

Spec de référence : `docs/superpowers/specs/2026-06-13-pages-declinees-relayout-llm-design.md`.

---

## File Structure

| Fichier | État | Responsabilité |
|---|---|---|
| `src/features/export/relayoutMultiFormat.ts` | **créer** (pur) | Types, `RelayoutSchema` (Zod) + `relayoutJsonSchema` (JSON Schema), `buildDescriptors`, `applyRelayout`, `buildRelayoutPrompt` |
| `src/features/export/relayoutMultiFormat.test.ts` | **créer** | Tests unitaires des fonctions pures |
| `src/features/export/relayoutToFormats.ts` | **créer** | Orchestration `generateJson` + repli géométrique par format |
| `src/features/export/relayoutToFormats.test.ts` | **créer** | Test du repli (mock `generateJson`) |
| `src/features/ai/llmRouter.ts` | **modifier** | Tâche `design.relayoutMultiFormat` (union + routing + température) |
| `src/features/export/useDeclineToPages.ts` | **modifier** | Async : rend le PNG source, appelle `relayoutToFormats`, crée les pages |
| `src/features/export/ExportModal.tsx` | **modifier** | `await` async + toast repli + libellé « IA » |
| `src/features/export/declineLayout.ts` | inchangé | `projectObjectsToFormat` = repli déterministe |
| `docs/TESTS-A-FAIRE.md` | **modifier** | Réécrire la section A1 |

**Note de conception (déviation assumée vs spec) :** robustesse > strictness. Le schéma Zod valide la **structure** (types + enum `fit`) mais PAS les bornes des pourcentages ; `applyRelayout` **clampe** `xPct/yPct ∈ [0,1]` et `wPct/hPct ∈ (0,1]`. Ainsi une seule valeur hors-borne renvoyée par le LLM ne fait pas échouer TOUS les formats. La « réparation » de la spec est assurée par les retries internes de `generateJson` (JSON/transient) ; au-delà, on retombe sur le repli géométrique — pas de boucle d'error-injection dédiée (overkill ici).

---

## Task 1 : Module pur — types, schéma, `buildDescriptors`

**Files:**
- Create: `src/features/export/relayoutMultiFormat.ts`
- Test: `src/features/export/relayoutMultiFormat.test.ts`

- [ ] **Step 1 : Écrire le fichier avec types + schéma + `buildDescriptors`**

Crée `src/features/export/relayoutMultiFormat.ts` :

```ts
// src/features/export/relayoutMultiFormat.ts
// Déclinaisons multi-format v3 — re-layout piloté par LLM. Module PUR (aucune
// dépendance Fabric/React) : traduit les objets Fabric sérialisés en descripteurs
// pour le LLM, et traduit le placement renvoyé (boîtes en %) en objets transformés
// (cover/contain déterministe). Voir relayoutToFormats.ts pour l'orchestration.
import { z } from 'zod'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'

/** Objet Fabric sérialisé, sous-ensemble des champs qu'on lit/transforme. */
export interface DesignObject {
  left?: number
  top?: number
  scaleX?: number
  scaleY?: number
  width?: number
  height?: number
  type?: string
  text?: string
  data?: { role?: string; [k: string]: unknown }
  [key: string]: unknown
}

/** Descripteur compact envoyé au LLM (bbox source en fractions [0..1]). */
export interface RelayoutDescriptor {
  i: number
  type: string
  role?: string
  text?: string
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

/** Placement renvoyé par le LLM pour un objet dans un format cible. */
export interface RelayoutElement {
  i: number
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  fit: 'cover' | 'contain'
}

/** Schéma Zod — valide la STRUCTURE (les bornes sont clampées à l'application). */
export const RelayoutSchema = z.object({
  formats: z.array(
    z.object({
      id: z.string(),
      elements: z.array(
        z.object({
          i: z.number().int(),
          xPct: z.number(),
          yPct: z.number(),
          wPct: z.number(),
          hPct: z.number(),
          fit: z.enum(['cover', 'contain']),
        }),
      ),
    }),
  ),
})

export type RelayoutResult = z.infer<typeof RelayoutSchema>

/** JSON Schema (Gemini responseSchema / Claude input_schema). */
export const relayoutJsonSchema = {
  type: 'object',
  properties: {
    formats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          elements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                i: { type: 'number' },
                xPct: { type: 'number' },
                yPct: { type: 'number' },
                wPct: { type: 'number' },
                hPct: { type: 'number' },
                fit: { type: 'string', enum: ['cover', 'contain'] },
              },
              required: ['i', 'xPct', 'yPct', 'wPct', 'hPct', 'fit'],
            },
          },
        },
        required: ['id', 'elements'],
      },
    },
  },
  required: ['formats'],
} as const

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Construit un descripteur indexé par objet (même ordre que le tableau source →
 * l'index `i` est la clé de mapping retour). bbox rendue en fractions de la page.
 */
export function buildDescriptors(
  objects: readonly DesignObject[],
  srcW: number,
  srcH: number,
): RelayoutDescriptor[] {
  if (srcW <= 0 || srcH <= 0) return []
  return objects.map((o, i) => {
    const w = (o.width ?? 0) * (o.scaleX ?? 1)
    const h = (o.height ?? 0) * (o.scaleY ?? 1)
    const d: RelayoutDescriptor = {
      i,
      type: String(o.type ?? 'object'),
      xPct: round2((o.left ?? 0) / srcW),
      yPct: round2((o.top ?? 0) / srcH),
      wPct: round2(w / srcW),
      hPct: round2(h / srcH),
    }
    const role = o.data?.role
    if (typeof role === 'string') d.role = role
    if (typeof o.text === 'string' && o.text.trim()) d.text = o.text.slice(0, 60)
    return d
  })
}

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo

/**
 * Applique le placement LLM (boîtes en %) aux objets sérialisés vers un format
 * cible. Le LLM PLACE (région), le calcul DIMENSIONNE (cover/contain, ratio
 * préservé). Objets sans placement ou sans dimensions → repli homothétique.
 * Renvoie de NOUVEAUX objets (sources non mutées).
 */
export function applyRelayout<T extends DesignObject>(
  objects: readonly T[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  elements: readonly RelayoutElement[],
): T[] {
  const byIndex = new Map(elements.map((e) => [e.i, e]))
  return objects.map((o, i) => {
    const el = byIndex.get(i)
    const curW = (o.width ?? 0) * (o.scaleX ?? 1)
    const curH = (o.height ?? 0) * (o.scaleY ?? 1)
    if (!el || curW <= 0 || curH <= 0) {
      return projectObjectsToFormat([o], srcW, srcH, dstW, dstH)[0]
    }
    const bx = clamp(el.xPct, 0, 1) * dstW
    const by = clamp(el.yPct, 0, 1) * dstH
    const bw = Math.max(clamp(el.wPct, 0, 1), 0.01) * dstW
    const bh = Math.max(clamp(el.hPct, 0, 1), 0.01) * dstH
    const f =
      el.fit === 'cover'
        ? Math.max(bw / curW, bh / curH)
        : Math.min(bw / curW, bh / curH)
    return {
      ...o,
      left: bx + (bw - curW * f) / 2,
      top: by + (bh - curH * f) / 2,
      scaleX: (o.scaleX ?? 1) * f,
      scaleY: (o.scaleY ?? 1) * f,
    }
  })
}

const DA_PROMPT = `Tu es directeur artistique. On te donne une AFFICHE/CRÉA (image de référence) et la liste de ses ÉLÉMENTS (index "i", "type", "role" éventuel, "text" éventuel, et boîte source "xPct"/"yPct"/"wPct"/"hPct" en fractions [0..1] de la page source).

Tu dois RÉADAPTER la mise en page à plusieurs FORMATS cibles de ratios différents (carré, story verticale, paysage, bannière).

Pour CHAQUE format et CHAQUE élément, renvoie une boîte cible "xPct"/"yPct" (coin haut-gauche, fractions [0..1] de la page CIBLE), "wPct"/"hPct" (taille de la boîte en fractions), et "fit" :
- "cover" : UNIQUEMENT le fond pleine-page (la grande image/forme d'arrière-plan) — il doit COUVRIR toute la page cible (xPct=0, yPct=0, wPct=1, hPct=1, fit="cover").
- "contain" : TOUT le reste (titre, prix, photo produit, logo, mentions) — placé dans une région qui respecte son ratio.

RÈGLES :
- Préserve la hiérarchie visuelle (un gros prix reste proéminent, un logo reste petit dans un coin).
- Adapte la disposition au ratio : en story verticale, empile verticalement ; en bannière horizontale, aligne sur une bande.
- Ne fais pas déborder les éléments "contain" hors de la page (0 ≤ xPct, xPct+wPct ≤ 1, idem en y).
- Renvoie un placement pour CHAQUE index "i" de CHAQUE format.

Réponds UNIQUEMENT en JSON {"formats":[{"id":"<id format>","elements":[{"i":…,"xPct":…,"yPct":…,"wPct":…,"hPct":…,"fit":"cover|contain"}]}]}.`

/** Assemble le prompt envoyé au LLM (image passée séparément en imageDataUris). */
export function buildRelayoutPrompt(
  descriptors: readonly RelayoutDescriptor[],
  targets: readonly DeclineTarget[],
  srcW: number,
  srcH: number,
): string {
  const fmts = targets.map((t) => ({
    id: t.id,
    label: t.label,
    w: t.w,
    h: t.h,
    ratio: round2(t.w / t.h),
  }))
  return `${DA_PROMPT}

PAGE SOURCE : ${srcW}×${srcH} (ratio ${round2(srcW / srcH)}).

FORMATS CIBLES :
${JSON.stringify(fmts)}

ÉLÉMENTS :
${JSON.stringify(descriptors)}`
}
```

- [ ] **Step 2 : Écrire les tests (qui échouent d'abord)**

Crée `src/features/export/relayoutMultiFormat.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  buildDescriptors,
  applyRelayout,
  RelayoutSchema,
  type DesignObject,
  type RelayoutElement,
} from './relayoutMultiFormat'

const bg: DesignObject = { type: 'image', left: 0, top: 0, width: 1000, height: 1000, scaleX: 1, scaleY: 1, data: { role: 'background' } }
const title: DesignObject = { type: 'textbox', left: 100, top: 100, width: 400, height: 80, scaleX: 1, scaleY: 1, text: 'Promo du jour', data: { role: 'title' } }

describe('buildDescriptors', () => {
  it('exprime la bbox en fractions et extrait role/text', () => {
    const [d0, d1] = buildDescriptors([bg, title], 1000, 1000)
    expect(d0).toMatchObject({ i: 0, type: 'image', role: 'background', xPct: 0, yPct: 0, wPct: 1, hPct: 1 })
    expect(d1).toMatchObject({ i: 1, type: 'textbox', role: 'title', text: 'Promo du jour', xPct: 0.1, yPct: 0.1, wPct: 0.4 })
    expect(d1.hPct).toBeCloseTo(0.08, 5)
  })

  it('renvoie [] si dimensions source invalides', () => {
    expect(buildDescriptors([bg], 0, 1000)).toEqual([])
  })
})

describe('applyRelayout', () => {
  const dst = { w: 1080, h: 1920 } // story 9:16

  it('cover remplit la page cible (déborde, jamais de vide)', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }]
    const [out] = applyRelayout([bg], 1000, 1000, dst.w, dst.h, els)
    // cover sur 1000×1000 → f = max(1080/1000, 1920/1000) = 1.92
    expect(out.scaleX).toBeCloseTo(1.92, 5)
    expect(out.scaleY).toBeCloseTo(1.92, 5)
    const renderedW = (out.width as number) * (out.scaleX as number)
    const renderedH = (out.height as number) * (out.scaleY as number)
    expect(renderedW).toBeGreaterThanOrEqual(dst.w) // couvre la largeur
    expect(renderedH).toBeGreaterThanOrEqual(dst.h) // couvre la hauteur
  })

  it('contain tient dans la boîte assignée, ratio préservé, centré', () => {
    // boîte = moitié haute, pleine largeur : x0 y0 w1 h0.5 → 1080×960
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 0.5, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    // title 400×80 → contain dans 1080×960 → f = min(1080/400, 960/80) = 2.7
    expect(out.scaleX).toBeCloseTo(2.7, 5)
    expect(out.scaleX).toBe(out.scaleY) // pas de distorsion
    // centré horizontalement : left = 0 + (1080 - 400*2.7)/2 = 0
    expect(out.left).toBeCloseTo(0, 5)
    // centré verticalement dans la boîte 960 : top = 0 + (960 - 80*2.7)/2 = 372
    expect(out.top).toBeCloseTo(372, 5)
  })

  it('objet sans placement → repli homothétique', () => {
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, [])
    // homothétie contain 1000→1080×1920 : s = min(1.08, 1.92) = 1.08
    expect(out.scaleX).toBeCloseTo(1.08, 5)
  })

  it('clampe les pourcentages hors-borne', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: -1, yPct: 2, wPct: 5, hPct: 1, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    expect(Number.isFinite(out.left as number)).toBe(true)
    expect(Number.isFinite(out.top as number)).toBe(true)
  })

  it('préserve les propriétés non géométriques', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    expect(out.text).toBe('Promo du jour')
    expect((out.data as { role?: string }).role).toBe('title')
    expect(out.type).toBe('textbox')
  })
})

describe('RelayoutSchema', () => {
  it('accepte une réponse valide', () => {
    const ok = RelayoutSchema.safeParse({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] }] })
    expect(ok.success).toBe(true)
  })
  it('rejette un fit inconnu', () => {
    const ko = RelayoutSchema.safeParse({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'stretch' }] }] })
    expect(ko.success).toBe(false)
  })
})
```

- [ ] **Step 3 : Lancer les tests, vérifier qu'ils passent**

Run: `npm run test:run -- relayoutMultiFormat`
Expected: tous les tests du fichier PASS.

- [ ] **Step 4 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/export/relayoutMultiFormat.ts src/features/export/relayoutMultiFormat.test.ts
git commit -m "feat(declinees): module pur re-layout LLM (descripteurs + applyRelayout)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Enregistrer la tâche LLM `design.relayoutMultiFormat`

**Files:**
- Modify: `src/features/ai/llmRouter.ts` (union `LLMTask` ~46-64, `TASK_ROUTING` ~77-127, `TASK_TEMPERATURE` ~130-151)

- [ ] **Step 1 : Ajouter le membre à l'union `LLMTask`**

Dans `src/features/ai/llmRouter.ts`, après la ligne `| 'design.semanticLayout'`, ajoute :

```ts
  | 'design.relayoutMultiFormat'
```

- [ ] **Step 2 : Ajouter l'entrée de routage**

Dans `TASK_ROUTING`, après la ligne `'design.semanticLayout': { ... },`, ajoute :

```ts
  // Re-layout multi-format : placement sémantique multimodal (image + descripteurs
  // d'objets) → boîtes par format. Même profil que semanticLayout : gemini-3.1-pro-preview
  // (responseSchema fiable sur v1beta), Claude en fallback si la clé Gemini manque.
  'design.relayoutMultiFormat': { primary: 'gemini', fallback: 'claude', model: 'gemini-3.1-pro-preview' },
```

- [ ] **Step 3 : Ajouter la température**

Dans `TASK_TEMPERATURE`, après la ligne `'design.semanticLayout': 0,`, ajoute :

```ts
  'design.relayoutMultiFormat': 0,
```

- [ ] **Step 4 : Vérifier les types (les Record<LLMTask, …> forcent l'exhaustivité)**

Run: `npx tsc -b`
Expected: aucune erreur (si une des 3 tables manque la clé, tsc échoue → c'est le test).

- [ ] **Step 5 : Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(declinees): tâche LLM design.relayoutMultiFormat (gemini→claude, temp 0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : Orchestrateur `relayoutToFormats` (+ repli)

**Files:**
- Create: `src/features/export/relayoutToFormats.ts`
- Test: `src/features/export/relayoutToFormats.test.ts`

- [ ] **Step 1 : Écrire l'orchestrateur**

Crée `src/features/export/relayoutToFormats.ts` :

```ts
// src/features/export/relayoutToFormats.ts
// Orchestration du re-layout multi-format : envoie l'image source + les descripteurs
// au LLM (1 seul appel pour tous les formats), applique le placement renvoyé, et
// RETOMBE sur projectObjectsToFormat (homothétie) en cas d'échec. Ne lève jamais.
import { generateJson } from '@/features/ai/llmRouter'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import {
  buildDescriptors,
  buildRelayoutPrompt,
  applyRelayout,
  RelayoutSchema,
  relayoutJsonSchema,
  type DesignObject,
} from './relayoutMultiFormat'

export interface RelayoutOutcome {
  /** Objets transformés par id de format cible. */
  byFormat: Record<string, DesignObject[]>
  /** true si on a utilisé le repli géométrique (LLM indisponible/échec). */
  usedFallback: boolean
}

function geometricFallback(
  objects: readonly DesignObject[],
  srcW: number,
  srcH: number,
  targets: readonly DeclineTarget[],
): Record<string, DesignObject[]> {
  const out: Record<string, DesignObject[]> = {}
  for (const t of targets) out[t.id] = projectObjectsToFormat(objects, srcW, srcH, t.w, t.h)
  return out
}

export async function relayoutToFormats(params: {
  imageDataUri: string
  objects: readonly DesignObject[]
  srcW: number
  srcH: number
  targets: readonly DeclineTarget[]
}): Promise<RelayoutOutcome> {
  const { imageDataUri, objects, srcW, srcH, targets } = params
  const descriptors = buildDescriptors(objects, srcW, srcH)
  if (descriptors.length === 0) {
    return { byFormat: geometricFallback(objects, srcW, srcH, targets), usedFallback: true }
  }
  try {
    const res = await generateJson({
      task: 'design.relayoutMultiFormat',
      prompt: buildRelayoutPrompt(descriptors, targets, srcW, srcH),
      schema: RelayoutSchema,
      schemaForLLM: relayoutJsonSchema,
      schemaForClaude: relayoutJsonSchema,
      version: 'relayout-v1',
      imageDataUris: [imageDataUri],
    })
    const out: Record<string, DesignObject[]> = {}
    for (const t of targets) {
      const fmt = res.formats.find((f) => f.id === t.id)
      out[t.id] = fmt
        ? applyRelayout(objects, srcW, srcH, t.w, t.h, fmt.elements)
        : projectObjectsToFormat(objects, srcW, srcH, t.w, t.h)
    }
    return { byFormat: out, usedFallback: false }
  } catch (err) {
    console.warn('[relayoutToFormats] LLM indisponible, repli géométrique :', err)
    return { byFormat: geometricFallback(objects, srcW, srcH, targets), usedFallback: true }
  }
}
```

- [ ] **Step 2 : Écrire le test du repli (mock `generateJson`)**

Crée `src/features/export/relayoutToFormats.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateJson = vi.fn()
vi.mock('@/features/ai/llmRouter', () => ({ generateJson: (...a: unknown[]) => generateJson(...a) }))

import { relayoutToFormats } from './relayoutToFormats'
import type { DesignObject } from './relayoutMultiFormat'

const objects: DesignObject[] = [
  { type: 'image', left: 0, top: 0, width: 1000, height: 1000, scaleX: 1, scaleY: 1, data: { role: 'background' } },
]
const targets = [
  { id: 'story', label: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'banniere', label: 'Bannière', w: 1500, h: 500 },
] as const

beforeEach(() => generateJson.mockReset())

describe('relayoutToFormats', () => {
  it('applique le placement LLM quand il répond', async () => {
    generateJson.mockResolvedValue({
      formats: [
        { id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] },
        { id: 'banniere', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] },
      ],
    })
    const { byFormat, usedFallback } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(usedFallback).toBe(false)
    // cover story : f = max(1080/1000, 1920/1000) = 1.92
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.92, 5)
    expect(byFormat.banniere[0]).toBeDefined()
  })

  it('retombe sur l’homothétie si le LLM lève', async () => {
    generateJson.mockRejectedValue(new Error('no key'))
    const { byFormat, usedFallback } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(usedFallback).toBe(true)
    // homothétie contain story : s = min(1.08, 1.92) = 1.08
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.08, 5)
    expect(Object.keys(byFormat)).toEqual(['story', 'banniere'])
  })

  it('repli si un format est absent de la réponse', async () => {
    generateJson.mockResolvedValue({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] }] })
    const { byFormat } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.92, 5) // LLM
    expect(byFormat.banniere[0].scaleX).toBeCloseTo(0.5, 5) // homothétie : min(1500/1000,500/1000)=0.5
  })
})
```

- [ ] **Step 3 : Lancer les tests**

Run: `npm run test:run -- relayoutToFormats`
Expected: les 3 tests PASS.

- [ ] **Step 4 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/export/relayoutToFormats.ts src/features/export/relayoutToFormats.test.ts
git commit -m "feat(declinees): orchestrateur relayoutToFormats + repli géométrique

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : Brancher le hook `useDeclineToPages` (async + PNG source)

**Files:**
- Modify: `src/features/export/useDeclineToPages.ts` (réécriture complète)

- [ ] **Step 1 : Réécrire le hook**

Remplace tout le contenu de `src/features/export/useDeclineToPages.ts` par :

```ts
// src/features/export/useDeclineToPages.ts
// Déclinaisons multi-format v3 — crée une page éditable par format cible. Le
// re-layout est piloté par LLM (relayoutToFormats), avec repli géométrique
// (projectObjectsToFormat) garanti. Rend la page source en PNG pour le LLM.
import { useCallback } from 'react'
import type { Canvas } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { FABRIC_SERIALIZED_PROPS } from '@/features/editor/serializationProps'
import { usePagesStore } from '@/stores/pages.store'
import { useUIStore } from '@/stores/ui.store'
import { relayoutToFormats } from './relayoutToFormats'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import type { DesignObject } from './relayoutMultiFormat'

interface SerializedCanvas {
  objects?: Array<DesignObject & { data?: { isGrid?: boolean; isPrintMark?: boolean; role?: string } }>
  [key: string]: unknown
}

export interface DeclineOutcome {
  created: number
  usedFallback: boolean
}

/** Rend la page courante en PNG (grille + marques masquées), bornée à 1024 px. */
function renderSourceDataUri(canvas: Canvas, srcW: number, srcH: number): string | null {
  canvas.discardActiveObject()
  const hidden = canvas.getObjects().filter((o) => o.data?.isGrid || o.data?.isPrintMark)
  hidden.forEach((o) => { o.visible = false })
  const multiplier = Math.min(1, 1024 / Math.max(srcW, srcH, 1))
  try {
    return canvas.toDataURL({ format: 'png', multiplier, quality: 0.9 })
  } catch (err) {
    console.warn('[declineToPages] toDataURL a échoué (CORS ?), repli sans image :', err)
    return null
  } finally {
    hidden.forEach((o) => { o.visible = true })
    canvas.requestRenderAll()
  }
}

export function useDeclineToPages() {
  const declineToPages = useCallback(
    async (targets: readonly DeclineTarget[]): Promise<DeclineOutcome> => {
      const canvas = globalFabricCanvas
      if (!canvas) throw new Error('Canvas indisponible.')
      if (targets.length === 0) return { created: 0, usedFallback: false }

      const { canvasWidth, canvasHeight } = useUIStore.getState()
      const serialized = canvas.toObject(FABRIC_SERIALIZED_PROPS) as SerializedCanvas
      const allObjects = serialized.objects ?? []
      // La grille et les marques de coupe sont propres au format source.
      const designObjects = allObjects.filter(
        (o) => !o.data?.isGrid && !o.data?.isPrintMark,
      )

      const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
      const { byFormat, usedFallback } = imageDataUri
        ? await relayoutToFormats({
            imageDataUri,
            objects: designObjects,
            srcW: canvasWidth,
            srcH: canvasHeight,
            targets,
          })
        : {
            // Pas d'image (toDataURL a échoué, ex. CORS) → repli homothétique direct.
            byFormat: Object.fromEntries(
              targets.map((t) => [
                t.id,
                projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h),
              ]),
            ),
            usedFallback: true,
          }

      const { pages, currentPageIndex, updatePage, addPage, setCurrentPage } = usePagesStore.getState()
      const originalIndex = currentPageIndex
      let created = 0

      targets.forEach((target) => {
        const projected = byFormat[target.id] ?? []
        const json = JSON.stringify({ ...serialized, objects: projected })
        // addPage déplace currentPageIndex sur la nouvelle page (en fin de liste).
        addPage(target.w, target.h)
        const next = usePagesStore.getState().pages
        const newPage = next[next.length - 1]
        if (newPage) {
          updatePage(newPage.id, { canvasJSON: json, label: target.label })
          created++
        }
      })

      // Le canvas affiche toujours la page source : on y recale l'index.
      setCurrentPage(Math.min(originalIndex, pages.length - 1))
      return { created, usedFallback }
    },
    [],
  )

  return { declineToPages }
}
```

- [ ] **Step 2 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur. (Si `o.text` n'existe pas sur le type filtré, le cast `DesignObject` via `SerializedCanvas.objects` le couvre.)

- [ ] **Step 3 : Lancer la suite de tests (non-régression)**

Run: `npm run test:run`
Expected: pas de nouvelle régression (tests existants verts).

- [ ] **Step 4 : Commit**

```bash
git add src/features/export/useDeclineToPages.ts
git commit -m "feat(declinees): hook async — PNG source + re-layout LLM + repli

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : Adapter `ExportModal` (await async + toast repli + copy)

**Files:**
- Modify: `src/features/export/ExportModal.tsx` (handler `decline` ~57-78, texte panneau ~270-272)

- [ ] **Step 1 : Rendre le handler `decline` asynchrone et gérer le repli**

Dans `src/features/export/ExportModal.tsx`, remplace le bloc `if (format === 'decline') { … }` (lignes ~57-78) par :

```tsx
    // « Pages déclinées » ne télécharge rien : crée des pages dans le document.
    if (format === 'decline') {
      const targets = DECLINE_TARGETS.filter((t) => declineTargets.includes(t.id))
      if (targets.length === 0) {
        setError('Sélectionne au moins un format.')
        setStatus('error')
        return
      }
      setStatus('exporting')
      setError(null)
      try {
        const { created, usedFallback } = await withProgress(
          'Adaptation IA des formats…',
          () => declineToPages(targets),
        )
        setStatus('done')
        const pages = `${created} page${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''}`
        if (usedFallback) {
          notify.warning('Déclinaisons créées (repli géométrique)', `${pages} — adaptation IA indisponible, mise à l’échelle simple appliquée.`)
        } else {
          notify.success('Déclinaisons créées', `${pages} — réadaptées par IA, ajuste-les puis exporte.`)
        }
        setTimeout(onClose, 1500)
      } catch (err) {
        console.error(err)
        setError(String(err))
        setStatus('error')
        notify.error('Déclinaison échouée', String(err).slice(0, 160))
      }
      return
    }
```

- [ ] **Step 2 : Vérifier que `notify.warning` existe ; sinon utiliser `notify.success`**

Run: `grep -n "warning" src/lib/notify.ts`
- Si `warning` est exporté → garder `notify.warning`.
- Sinon → remplacer la ligne `notify.warning('Déclinaisons créées (repli géométrique)', …)` par `notify.success('Déclinaisons créées (repli géométrique)', …)`.

- [ ] **Step 3 : Mettre à jour le texte du panneau (ne plus dire « centré / gratuit »)**

Remplace le paragraphe d'aide (lignes ~270-272) par :

```tsx
              <p className="text-[11px] text-white/40 leading-relaxed">
                Crée une <span className="text-white/60">page éditable</span> par format : la mise en page est <span className="text-white/60">réadaptée automatiquement au ratio (IA)</span>, puis ajustable à la main avant export. Repli sur mise à l’échelle simple si l’IA est indisponible.
              </p>
```

- [ ] **Step 4 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur (le handler `await`-e bien une `Promise<DeclineOutcome>`).

- [ ] **Step 5 : Commit**

```bash
git add src/features/export/ExportModal.tsx
git commit -m "feat(declinees): UI — attente IA + toast repli + libellé réadaptation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : Mettre à jour la checklist A1 + vérif finale

**Files:**
- Modify: `docs/TESTS-A-FAIRE.md` (section A1, lignes ~14-21)

- [ ] **Step 1 : Réécrire la section A1**

Dans `docs/TESTS-A-FAIRE.md`, remplace la section `### A1. …` (lignes ~14-21) par :

```markdown
### A1. Pages déclinées (re-layout multi-format piloté par LLM)
Éditeur → **Exporter** → format **« Pages déclinées »** (nécessite une clé LLM + budget).
- [ ] Cocher 1+ formats (carré / story / paysage / bannière) → **Créer les pages** (« Adaptation IA… »).
- [ ] Une page éditable par format est ajoutée au document.
- [ ] Le **fond pleine-page remplit** chaque ratio (cover) — **aucun vide letterboxé**.
- [ ] Le contenu (titre, prix, photo, logo) est **replacé cohéremment** selon le ratio (pas juste réduit/centré).
- [ ] Les objets sont **réellement éditables** (déplaçables, redimensionnables), pas une image figée.
- [ ] La page source reste affichée et **intacte** après création.
- [ ] La grille et les marques de coupe ne sont PAS recopiées dans les déclinaisons.
- [ ] **Repli** : retirer la clé LLM (ou budget épuisé) → toast « repli géométrique », pages créées quand même (mise à l’échelle simple).
```

- [ ] **Step 2 : Vérification finale complète**

Run: `npx tsc -b && npm run test:run && npm run lint`
Expected: types OK, tests verts, lint sans erreur bloquante.

- [ ] **Step 3 : Vérifier l'absence de code mort introduit**

Run: `npx knip`
Expected: exit 0 (baseline). Si `relayoutToFormats`/`relayoutMultiFormat` ressortent comme inutilisés, vérifier qu'ils sont bien importés par `useDeclineToPages`/l'orchestrateur (ne PAS exporter de symboles utilisés seulement localement).

- [ ] **Step 4 : Commit**

```bash
git add docs/TESTS-A-FAIRE.md
git commit -m "docs(tests): A1 réécrit pour le re-layout LLM + cas de repli

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (effectuée)

- **Couverture spec** : rendu PNG source (Task 4), descripteurs + appel LLM 1× (Task 3+1), schéma+validation (Task 1), application cover/contain (Task 1), repli déterministe par format (Task 3), pages éditables + source intacte (Task 4), UI attente/toast (Task 5), tâche LLM routée (Task 2), tests (Task 1/3), checklist (Task 6). ✓
- **Placeholders** : aucun — tout le code est explicite.
- **Cohérence des types** : `DesignObject`, `RelayoutElement`, `RelayoutResult`, `RelayoutOutcome`, `DeclineOutcome` définis une fois et réutilisés ; `buildDescriptors`/`applyRelayout` partagent l'ordre de tableau (clé `i`). `declineToPages` renvoie `Promise<DeclineOutcome>` et est `await`-é dans `ExportModal`. ✓
- **Déviation** : bornes des % validées par clamp à l'application (pas par Zod) — robustesse ; documentée en tête de plan.
```
