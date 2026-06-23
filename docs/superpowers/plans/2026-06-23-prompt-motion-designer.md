# Prompt motion-designer IA — Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre un prompt en langage naturel dans « Vidéo IA » (mode canvas) où l'IA produit un plan de directives d'animation par élément, rejoué sur le design capturé.

**Architecture:** Nouveau module `promptToMotionPlan.ts` (inventaire d'objets + appel Gemini schéma plat + validation/réparation). La capture tague les objets cités (`w2panim-<id>`, infra existante). Les 3 templates `design-reveal` reçoivent `vars.motionPlan` et appliquent chaque directive en GSAP seek-safe, par-dessus la chorégraphie globale (ou seule si `fromScratch`).

**Tech Stack:** React 18 + TS strict (ES2022), Zustand, React Query v5, zod, Gemini (`generateJson`), Fabric v7, GSAP 3.14 (dans les templates HyperFrames), Vitest.

## Global Constraints

- TypeScript strict, pas d'`any` ; props typées explicitement.
- Vérif types : `npx tsc -b` (project references — `tsc --noEmit` ne vérifie rien). Build : `npm run build`.
- Tests : `npm run test:run` (Vitest).
- Schéma envoyé à Gemini = **plat** (pas d'objet imbriqué) — l'imbrication déclenche INVALID_ARGUMENT 400 sur Vertex (cf. `promptToComposition.ts` L269-273).
- Seek-safe (templates) : timeline `paused` enregistrée sur `window.__timelines[<composition-id>]` ; `repeat` **fini** uniquement (jamais `-1`) ; yoyo OK ; aléatoire figé au plan (jamais `Math.random` au rendu) ; chaque cible enveloppée dans un **groupe identité** avant transform (anti-saut sur `<g matrix>`).
- Modèles IA par défaut : ne pas changer le routage ; réutiliser `generateJson` comme `promptToStyleConfig.ts`.
- Répondre en français (commentaires/UI).
- Spec de référence : `docs/superpowers/specs/2026-06-23-prompt-motion-designer-design.md`.

---

## File Structure

- **Create** `src/features/video/promptToMotionPlan.ts` — types, schéma zod, `SCHEMA_FOR_GEMINI` plat, `SYSTEM_PROMPT`, `buildSceneInventory()`, `repairMotionPlan()`, `interpretPromptToMotionPlan()`.
- **Create** `src/features/video/promptToMotionPlan.test.ts` — tests Vitest (inventaire + réparation).
- **Modify** `src/features/video/utils/captureSvg.ts` — `captureCurrentPageSvg(opts?: { tagIds?: string[] })`.
- **Modify** `src/features/video/useGenerateVideo.ts` — inventaire → plan → tagIds → threading `motionPlan` ; inputs `animationPrompt`/`fromScratch`.
- **Modify** `src/features/video/VideoModal.tsx` — champ « Instructions d'animation » + case « Partir de zéro » + threading.
- **Modify** `src/features/video/VideoResult.tsx` + `HyperframesPlayer.tsx` — threading `motionPlan` (miroir d'`objectAnimations`).
- **Modify** `public/hf-templates/design-reveal-{square,portrait,landscape}/index.html` — `applyMotionPlan()` + `fromScratch`.

---

## Task 1 : Module `promptToMotionPlan.ts` (logique pure + schéma)

**Files:**
- Create: `src/features/video/promptToMotionPlan.ts`
- Test: `src/features/video/promptToMotionPlan.test.ts`

**Interfaces:**
- Consumes : `generateJson` de `@/features/briefs/ai/geminiClient` ; `CanvasObjectProps` de `@/stores/editor.store`.
- Produces :
  - `interface SceneObject { id: string; label: string; type: string; bbox: { x: number; y: number; w: number; h: number } }`
  - `function buildSceneInventory(objs: CanvasObjectProps[]): SceneObject[]`
  - `type MotionEffect` (union, cf. spec §4) ; `interface Directive` ; `interface MotionPlan { fromScratch: boolean; directives: Directive[] }`
  - `function repairMotionPlan(raw: unknown, validIds: string[]): MotionPlan`
  - `async function interpretPromptToMotionPlan(args: { prompt: string; inventory: SceneObject[]; fromScratch: boolean }): Promise<MotionPlan>`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/features/video/promptToMotionPlan.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildSceneInventory, repairMotionPlan } from './promptToMotionPlan'
import type { CanvasObjectProps } from '@/stores/editor.store'

const obj = (p: Partial<CanvasObjectProps>): CanvasObjectProps => ({
  id: 'x', type: 'rect', left: 0, top: 0, width: 10, height: 10,
  ...p,
} as CanvasObjectProps)

describe('buildSceneInventory', () => {
  it('aplatit les objets (y compris enfants) en {id,label,type,bbox}', () => {
    const objs = [
      obj({ id: 'a', type: 'textbox', text: '22,99 DT', left: 5, top: 6, width: 30, height: 12 }),
      obj({ id: 'b', type: 'group', children: [obj({ id: 'c', type: 'image', name: 'logo' })] }),
    ]
    const inv = buildSceneInventory(objs)
    expect(inv.map((o) => o.id)).toEqual(['a', 'b', 'c'])
    expect(inv[0]).toMatchObject({ id: 'a', label: '22,99 DT', type: 'textbox', bbox: { x: 5, y: 6, w: 30, h: 12 } })
    expect(inv[2].label).toBe('logo')
  })

  it('tronque les labels longs et retombe sur le type si pas de texte/nom', () => {
    const inv = buildSceneInventory([
      obj({ id: 'a', type: 'textbox', text: 'x'.repeat(80) }),
      obj({ id: 'b', type: 'circle' }),
    ])
    expect(inv[0].label.length).toBeLessThanOrEqual(48)
    expect(inv[1].label).toBe('circle')
  })
})

describe('repairMotionPlan', () => {
  it('garde les directives valides et droppe celles dont la cible est inconnue', () => {
    const raw = {
      fromScratch: false,
      directives: [
        { target: 'a', phase: 'loop', effect: 'tilt3d', intensity: 0.6 },
        { target: 'inconnu', phase: 'loop', effect: 'pulse' },
        { target: 'all', phase: 'entry', effect: 'slide-in', direction: 'left' },
      ],
    }
    const plan = repairMotionPlan(raw, ['a', 'b'])
    expect(plan.directives.map((d) => d.target)).toEqual(['a', 'all'])
    expect(plan.fromScratch).toBe(false)
  })

  it('droppe les effets/phases invalides et clamp intensity', () => {
    const raw = {
      fromScratch: true,
      directives: [
        { target: 'a', phase: 'loop', effect: 'NOPE' },
        { target: 'a', phase: 'BAD', effect: 'pulse' },
        { target: 'a', phase: 'loop', effect: 'glow', intensity: 9 },
      ],
    }
    const plan = repairMotionPlan(raw, ['a'])
    expect(plan.directives).toHaveLength(1)
    expect(plan.directives[0].intensity).toBe(1)
    expect(plan.fromScratch).toBe(true)
  })

  it('retourne un plan vide sur entrée non-objet', () => {
    expect(repairMotionPlan(null, ['a'])).toEqual({ fromScratch: false, directives: [] })
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run : `npm run test:run -- src/features/video/promptToMotionPlan.test.ts`
Expected : FAIL (« Cannot find module './promptToMotionPlan' »).

- [ ] **Step 3 : Écrire `promptToMotionPlan.ts`**

```ts
import { z } from 'zod'
import { generateJson } from '@/features/briefs/ai/geminiClient'
import type { CanvasObjectProps } from '@/stores/editor.store'

const PHASES = ['entry', 'loop', 'exit'] as const
const DIRECTIONS = ['left', 'right', 'top', 'bottom'] as const
const EFFECTS = [
  // entry 2D
  'slide-in', 'fade-in', 'scale-in', 'blur-in', 'drop-in', 'fly-in',
  // entry 2.5D
  'flip-in', 'door-in', 'fold-in', 'depth-in',
  // loop 2D
  'pulse', 'bounce', 'wave', 'float', 'wiggle', 'color-cycle', 'glow', 'vibrate',
  // loop 2.5D
  'tilt3d', 'swing3d', 'spin3d', 'flip3d', 'wobble3d', 'depth-pop', 'coin3d',
  // exit
  'slide-out', 'fade-out', 'scale-out', 'flip-out',
] as const

export type MotionEffect = (typeof EFFECTS)[number]
export type MotionPhase = (typeof PHASES)[number]
export type MotionDirection = (typeof DIRECTIONS)[number]

const HEX = /^#[0-9a-fA-F]{6}$/

const DirectiveSchema = z.object({
  target: z.string().min(1).max(40),
  phase: z.enum(PHASES),
  effect: z.enum(EFFECTS),
  intensity: z.number().min(0).max(1).optional(),
  direction: z.enum(DIRECTIONS).optional(),
  color: z.string().regex(HEX).optional(),
  startSec: z.number().min(0).max(15).optional(),
  durationSec: z.number().min(0.1).max(15).optional(),
  stagger: z.number().min(0).max(2).optional(),
})
export type Directive = z.infer<typeof DirectiveSchema>

const MotionPlanSchema = z.object({
  fromScratch: z.boolean(),
  directives: z.array(DirectiveSchema).max(24),
})
export type MotionPlan = z.infer<typeof MotionPlanSchema>

export const EMPTY_MOTION_PLAN: MotionPlan = { fromScratch: false, directives: [] }

export interface SceneObject {
  id: string
  label: string
  type: string
  bbox: { x: number; y: number; w: number; h: number }
}

/** Aplatit les objets (récursif) en inventaire {id,label,type,bbox} pour que
 *  l'IA puisse cibler « le bloc prix » par son texte/nom. */
export function buildSceneInventory(objs: CanvasObjectProps[]): SceneObject[] {
  const out: SceneObject[] = []
  const visit = (list: CanvasObjectProps[]) => {
    for (const o of list) {
      const raw = (o.name || o.text || o.type || '').toString().trim().replace(/\s+/g, ' ')
      out.push({
        id: o.id,
        label: raw ? raw.slice(0, 48) : (o.type || 'objet'),
        type: o.type || 'objet',
        bbox: {
          x: Math.round(o.left ?? 0), y: Math.round(o.top ?? 0),
          w: Math.round(o.width ?? 0), h: Math.round(o.height ?? 0),
        },
      })
      if (o.children) visit(o.children)
    }
  }
  visit(objs)
  return out
}

const EFFECT_SET = new Set<string>(EFFECTS)
const PHASE_SET = new Set<string>(PHASES)
const DIR_SET = new Set<string>(DIRECTIONS)

/** Garde les directives valides, droppe les cibles inconnues / effets invalides,
 *  clamp les nombres. JAMAIS de rejet global → résultat partiel exploitable. */
export function repairMotionPlan(raw: unknown, validIds: string[]): MotionPlan {
  if (!raw || typeof raw !== 'object') return { fromScratch: false, directives: [] }
  const r = raw as Record<string, unknown>
  const idSet = new Set(validIds)
  const list = Array.isArray(r.directives) ? r.directives : []
  const directives: Directive[] = []
  for (const d of list) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const target = typeof o.target === 'string' ? o.target : ''
    if (target !== 'all' && !idSet.has(target)) continue
    if (typeof o.phase !== 'string' || !PHASE_SET.has(o.phase)) continue
    if (typeof o.effect !== 'string' || !EFFECT_SET.has(o.effect)) continue
    const clamp = (v: unknown, lo: number, hi: number): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined
    const dir = typeof o.direction === 'string' && DIR_SET.has(o.direction) ? (o.direction as MotionDirection) : undefined
    const color = typeof o.color === 'string' && HEX.test(o.color) ? o.color : undefined
    directives.push({
      target, phase: o.phase as MotionPhase, effect: o.effect as MotionEffect,
      intensity: clamp(o.intensity, 0, 1), direction: dir, color,
      startSec: clamp(o.startSec, 0, 15), durationSec: clamp(o.durationSec, 0.1, 15),
      stagger: clamp(o.stagger, 0, 2),
    })
    if (directives.length >= 24) break
  }
  return { fromScratch: r.fromScratch === true, directives }
}

const SCHEMA_FOR_GEMINI = {
  type: 'object',
  required: ['fromScratch', 'directives'],
  properties: {
    fromScratch: { type: 'boolean' },
    directives: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        required: ['target', 'phase', 'effect'],
        properties: {
          target: { type: 'string', description: "id d'objet de l'inventaire, ou \"all\" pour tous les éléments" },
          phase: { type: 'string', enum: [...PHASES] },
          effect: { type: 'string', enum: [...EFFECTS] },
          intensity: { type: 'number', description: '0..1 (léger≈0.3, moyen≈0.6, franc≈1)' },
          direction: { type: 'string', enum: [...DIRECTIONS] },
          color: { type: 'string', description: 'hex #RRGGBB (glow / color-cycle)' },
          startSec: { type: 'number', description: 'décalage de départ en secondes' },
          durationSec: { type: 'number', description: "durée d'un cycle / de l'entrée en secondes" },
          stagger: { type: 'number', description: 'cascade entre éléments quand target=all (secondes)' },
        },
      },
    },
  },
}

const SYSTEM_PROMPT = `Tu es un motion designer. Tu transformes une instruction d'animation en plan structuré
de directives, appliquées à un design existant (capture SVG). Tu reçois l'INVENTAIRE des objets du design
(id + libellé + type). Tu DOIS cibler chaque directive par un \`target\` = un id de l'inventaire, ou "all".

RÈGLES :
- Résous les descriptions en ids : « le bloc prix » → l'id dont le libellé contient le prix ; « le logo » →
  l'objet logo/image ; « tous les éléments » → "all".
- Chaque directive a une \`phase\` : entry (entrée), loop (boucle continue), exit (sortie).
- Effets 3D par élément (tilt3d, swing3d, spin3d, flip3d, wobble3d, depth-pop, coin3d, flip-in/out, door-in,
  fold-in, depth-in) : ce sont des effets « carte/charnière » (2.5D), choisis-les quand l'utilisateur parle de 3D,
  retournement, pivot, profondeur.
- \`intensity\` ∈ [0,1] continu : mappe tout adjectif (léger≈0.3, moyen≈0.6, franc/à fond≈1).
- ALÉATOIRE : n'écris JAMAIS "random". Si l'utilisateur demande de l'aléatoire/variété (ex. « entrée aléatoire »),
  produis PLUSIEURS directives ciblées (une par id) avec des \`direction\`/\`startSec\`/\`durationSec\` VARIÉS et
  CONCRETS, ou une directive target="all" avec un \`stagger\`. Tout doit être déterministe.
- Respecte les directions demandées (entrée gauche → direction:"left" ; sortie droite → direction:"right").
- N'invente pas d'objets : n'utilise que des ids présents dans l'inventaire (ou "all").
- Si l'instruction est vide ou non pertinente, renvoie directives: [].
- Recopie \`fromScratch\` depuis le contexte fourni.

Réponds UNIQUEMENT par le JSON.

INVENTAIRE + INSTRUCTION :
`

export async function interpretPromptToMotionPlan(args: {
  prompt: string
  inventory: SceneObject[]
  fromScratch: boolean
}): Promise<MotionPlan> {
  const prompt = (args.prompt || '').trim()
  if (!prompt) return { fromScratch: args.fromScratch, directives: [] }
  const inventoryText = args.inventory
    .map((o) => `- id=${o.id} · "${o.label}" · ${o.type}`)
    .join('\n')
  const full =
    SYSTEM_PROMPT +
    `\n[fromScratch=${args.fromScratch}]\n\n[INVENTAIRE]\n${inventoryText}\n\n[INSTRUCTION]\n${prompt}\n`
  try {
    const raw = await generateJson<unknown>({
      prompt: full,
      schema: MotionPlanSchema,
      schemaForGemini: SCHEMA_FOR_GEMINI,
      version: 'video-motion-plan-v1',
    })
    const plan = repairMotionPlan(raw, args.inventory.map((o) => o.id))
    return { ...plan, fromScratch: args.fromScratch }
  } catch (err) {
    console.warn('Interprétation motion plan échouée, plan vide :', err)
    return { fromScratch: args.fromScratch, directives: [] }
  }
}
```

> Note : `generateJson` valide déjà via `schema` (zod) ; on repasse par `repairMotionPlan` pour tolérer un
> retour partiellement valide plutôt que de jeter tout le plan, et pour filtrer les ids hallucinés.

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run : `npm run test:run -- src/features/video/promptToMotionPlan.test.ts`
Expected : PASS (5 tests).

> Si `CanvasObjectProps` n'expose pas `text`/`name`/`children`/`left`/`top`/`width`/`height`, lire
> `src/stores/editor.store.ts` et adapter `buildSceneInventory` aux champs réels (ils existent : `Animation3DPanel`
> utilise `o.children`, `o.animation3D` ; les objets Fabric exposent left/top/width/height).

- [ ] **Step 5 : Types + commit**

Run : `npx tsc -b`
Expected : aucune erreur.

```bash
git add src/features/video/promptToMotionPlan.ts src/features/video/promptToMotionPlan.test.ts
git commit -m "feat(video): module promptToMotionPlan (inventaire + plan plat + réparation)"
```

---

## Task 2 : `captureCurrentPageSvg` accepte des ids à taguer

**Files:**
- Modify: `src/features/video/utils/captureSvg.ts`

**Interfaces:**
- Produces : `captureCurrentPageSvg(opts?: { tagIds?: string[] }): Promise<SvgCaptureResult>` — tague l'union des
  objets à preset (existant) ET des `opts.tagIds`. `SvgCaptureResult.objectAnimations` inchangé (presets seuls).

- [ ] **Step 1 : Modifier la signature + l'union de tag**

Dans `captureCurrentPageSvg`, la collecte des objets à taguer doit inclure `opts.tagIds`. Remplacer le bloc de
tag pour partir de l'union :

```ts
export async function captureCurrentPageSvg(
  opts?: { tagIds?: string[] },
): Promise<SvgCaptureResult> {
  const storeAnims = collectStoreAnims(useEditorStore.getState().canvasObjects)
  const objectAnimations: CapturedObjectAnim[] = []
  const restores: { obj: FabricLike; prev: unknown }[] = []
  const canvas = globalFabricCanvas as unknown as { getObjects(): FabricLike[] } | null

  // Ids à taguer : objets à preset (pour objectAnimations) + ids cités par le plan de motion.
  const presetIds = new Set(storeAnims.map((a) => a.id))
  const extraIds = (opts?.tagIds ?? []).filter((id) => !presetIds.has(id))
  const allToTag: { id: string; config?: Animation3DConfig }[] = [
    ...storeAnims.map((a) => ({ id: a.id, config: a.config })),
    ...extraIds.map((id) => ({ id })),
  ]

  if (canvas && allToTag.length > 0) {
    const roots = canvas.getObjects()
    for (const a of allToTag) {
      const fobj = findFabricById(roots, a.id)
      if (!fobj) continue
      const svgId = ANIM_ID_PREFIX + a.id
      restores.push({ obj: fobj, prev: fobj.id })
      fobj.id = svgId
      if (a.config) objectAnimations.push({ id: svgId, config: a.config })
    }
  }

  try {
    const result = await generateCurrentPageSvg({ cropToContent: false, embedFonts: true })
    if (!result) throw new Error('Canvas non disponible')
    const uploaded = await uploadSvgToStorage(result.svg, result.width, result.height)
    return { ...uploaded, objectAnimations }
  } finally {
    for (const r of restores) r.obj.id = r.prev
  }
}
```

> `"all"` n'est PAS un id réel : le template résoudra `target:"all"` en sélectionnant tous les `[id^="w2panim-"]`.
> Pour que `all` ait des cibles, l'appelant (Task 3) ajoute à `tagIds` les ids top-level quand le plan contient
> une directive `all`.

- [ ] **Step 2 : Types + commit**

Run : `npx tsc -b`
Expected : aucune erreur (les appelants existants `captureCurrentPageSvg()` sans argument restent valides).

```bash
git add src/features/video/utils/captureSvg.ts
git commit -m "feat(video): captureCurrentPageSvg accepte des tagIds (plan de motion)"
```

---

## Task 3 : Pipeline génération — inventaire → plan → tag → threading

**Files:**
- Modify: `src/features/video/useGenerateVideo.ts`

**Interfaces:**
- Consumes : `interpretPromptToMotionPlan`, `buildSceneInventory`, `type MotionPlan` (Task 1) ; `captureCurrentPageSvg({tagIds})` (Task 2) ; `useEditorStore` (store).
- Produces : `GenerateVideoInput` gagne `animationPrompt?: string` et `fromScratch?: boolean` ; `GenerateVideoStep` et `GenerateVideoResult` gagnent `motionPlan?: MotionPlan`.

- [ ] **Step 1 : Imports + champs d'entrée/sortie**

En tête de fichier :
```ts
import { interpretPromptToMotionPlan, buildSceneInventory, type MotionPlan } from './promptToMotionPlan'
import { useEditorStore } from '@/stores/editor.store'
```
Dans `GenerateVideoInput`, après `objectPresets?: string[]` :
```ts
  /** Prompt de motion designer (mode canvas) → directives par élément. */
  animationPrompt?: string
  /** Contrôle total : ne joue QUE les directives, saute la chorégraphie globale. */
  fromScratch?: boolean
```
Dans `GenerateVideoStep`, après `objectAnimations?: CapturedObjectAnim[]` :
```ts
  motionPlan?: MotionPlan
```
Dans `GenerateVideoResult`, après `objectAnimations?: CapturedObjectAnim[]` :
```ts
  /** Mode canvas : plan de motion designer rejoué dans la vidéo. */
  motionPlan?: MotionPlan
```

- [ ] **Step 2 : Calculer le plan + taguer dans la branche canvas**

Dans `mutationFn`, branche `if (source === 'canvas')`, AVANT `const capture = await captureCurrentPageSvg()`,
insérer le calcul du plan, puis passer les `tagIds` à la capture :

```ts
      if (source === 'canvas') {
        opts?.onStep?.({ step: 'capturing', source })

        // ── Plan de motion designer (avant capture, pour savoir quels objets taguer) ──
        let motionPlan: MotionPlan | undefined
        let tagIds: string[] = []
        const animPrompt = (input.animationPrompt ?? '').trim()
        if (animPrompt) {
          const inventory = buildSceneInventory(useEditorStore.getState().canvasObjects)
          motionPlan = await interpretPromptToMotionPlan({
            prompt: animPrompt,
            inventory,
            fromScratch: input.fromScratch === true,
          })
          const cited = motionPlan.directives.map((d) => d.target)
          const wantsAll = cited.includes('all')
          tagIds = wantsAll ? inventory.map((o) => o.id) : cited.filter((t) => t !== 'all')
        }

        const capture = await captureCurrentPageSvg({ tagIds })
```

> Remplace la ligne `const capture = await captureCurrentPageSvg()` existante par la version ci-dessus
> (capturing + plan + capture). Le reste de la branche (aspect, canvasDims, files, styleConfig) est inchangé.

- [ ] **Step 3 : Threader `motionPlan` dans `done` + le retour**

Là où `objectAnimations` est déjà passé (step `done` et `return`), ajouter `motionPlan` :
```ts
        opts?.onStep?.({
          step: 'done',
          // ...champs existants...
          objectAnimations,
          motionPlan,
        })

        return {
          // ...champs existants...
          objectAnimations,
          motionPlan,
        }
```

- [ ] **Step 4 : Types + commit**

Run : `npx tsc -b`
Expected : aucune erreur.

```bash
git add src/features/video/useGenerateVideo.ts
git commit -m "feat(video): pipeline canvas calcule le motion plan + tague + le propage"
```

---

## Task 4 : Threading UI (VideoModal → VideoResult → HyperframesPlayer)

**Files:**
- Modify: `src/features/video/VideoModal.tsx`
- Modify: `src/features/video/VideoResult.tsx`
- Modify: `src/features/video/HyperframesPlayer.tsx`

**Interfaces:**
- Produces : `HyperframesPlayer` et `VideoResult` acceptent `motionPlan?: MotionPlan` ; les variables
  design-reveal incluent `motionPlan`. `MotionPlan` importé de `./promptToMotionPlan`.

> Modèle : reproduire EXACTEMENT le threading déjà en place pour `objectAnimations` (commit B-fidèle).
> Lire les diffs de ces fichiers pour `objectAnimations` et faire le miroir pour `motionPlan`.

- [ ] **Step 1 : `HyperframesPlayer.tsx`**

- Importer le type : `import type { MotionPlan } from './promptToMotionPlan'`
- Ajouter la prop `motionPlan?: MotionPlan` (à côté de `objectAnimations`), la destructurer, et l'ajouter au
  `useMemo` `variables` de la branche `!isMultiScene` :
```ts
      objectAnimations: objectAnimations && objectAnimations.length ? objectAnimations : undefined,
      motionPlan: motionPlan && motionPlan.directives.length ? motionPlan : undefined,
```
  et l'ajouter au tableau de dépendances du `useMemo`.

- [ ] **Step 2 : `VideoResult.tsx`**

- Importer `import type { MotionPlan } from './promptToMotionPlan'`
- Ajouter `motionPlan?: MotionPlan` aux `Props`, à la destructuration, à `buildVariables` (branche design-reveal) :
```ts
      objectAnimations: props.objectAnimations,
      motionPlan: props.motionPlan,
```
- Passer `motionPlan={motionPlan}` au `<HyperframesPlayer>`.

- [ ] **Step 3 : `VideoModal.tsx` — threading state**

- Importer `import type { MotionPlan } from './promptToMotionPlan'`
- Ajouter `objectAnimations?` voisin : `motionPlan?: MotionPlan` dans `ResultState` et `LivePreviewState`.
- Dans `onStep` (branche `s.svg`), ajouter `motionPlan: s.motionPlan ?? prev?.motionPlan`.
- Dans les deux `setResult` (handleGenerate + applyPrompt), ajouter `motionPlan: res.motionPlan`.
- Passer `motionPlan={preview.motionPlan}` au player du previewPanel et `motionPlan={result.motionPlan}` à
  `<VideoResult>`.

- [ ] **Step 4 : Types + commit**

Run : `npx tsc -b`
Expected : aucune erreur.

```bash
git add src/features/video/VideoModal.tsx src/features/video/VideoResult.tsx src/features/video/HyperframesPlayer.tsx
git commit -m "feat(video): threading motionPlan (preview + result + export)"
```

---

## Task 5 : UI — champ « Instructions d'animation » + « Partir de zéro »

**Files:**
- Modify: `src/features/video/VideoModal.tsx`

**Interfaces:**
- Consumes : state `animationPrompt`/`fromScratch` ; les passe à `mutation.mutate`.

- [ ] **Step 1 : State + passage à la mutation**

Ajouter le state (le champ `freeform` existant DEVIENT le champ animation — réutiliser `freeform` comme
`animationPrompt`, et ajouter `fromScratch`) :
```ts
  const [fromScratch, setFromScratch] = useState(false)
```
Dans l'objet passé à `mutation.mutate` (handleGenerate ET applyPrompt), ajouter :
```ts
        animationPrompt: freeform.trim() || undefined,
        fromScratch: fromScratch || undefined,
```
Dans `handleClear`, remettre `setFromScratch(false)`.

- [ ] **Step 2 : Renommer le champ + placeholder + case**

Remplacer le `FieldLabel`/`textarea` du champ « Instructions libres » par :
```tsx
                <div>
                  <FieldLabel
                    htmlFor="freeform"
                    optional
                    hint="L'IA traduit ces instructions en animations par élément (cible par nom : « le bloc prix », « le logo », « tous les éléments »)."
                  >
                    Instructions d'animation
                  </FieldLabel>
                  <textarea
                    id="freeform"
                    value={freeform}
                    onChange={(e) => setFreeform(e.target.value)}
                    disabled={generating}
                    rows={3}
                    placeholder="ex. effet de carte qui se retourne sur le prix ; le logo balance doucement ; entrée des éléments depuis la gauche en cascade, sortie à droite"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none disabled:opacity-50 resize-y"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fromScratch}
                      onChange={(e) => setFromScratch(e.target.checked)}
                      disabled={generating}
                      className="accent-indigo-500"
                    />
                    Partir de zéro (ne jouer que mes instructions)
                  </label>
                </div>
```

- [ ] **Step 3 : Types + commit**

Run : `npx tsc -b`
Expected : aucune erreur.

```bash
git add src/features/video/VideoModal.tsx
git commit -m "feat(video): champ « Instructions d'animation » + case « Partir de zéro »"
```

---

## Task 6 : Applicateur `applyMotionPlan` dans les 3 templates design-reveal

**Files:**
- Modify: `public/hf-templates/design-reveal-square/index.html`
- Modify: `public/hf-templates/design-reveal-portrait/index.html`
- Modify: `public/hf-templates/design-reveal-landscape/index.html`

**Interfaces:**
- Consumes : `vars.motionPlan = { fromScratch, directives[] }` ; `svgEl`, `tl`, `dur`, `amp`, `ACCENT`,
  `DUR_SCALE`, `PACE_MULT` (déjà en scope).

- [ ] **Step 1 : `fromScratch` — sauter la chorégraphie globale (square)**

Dans `design-reveal-square/index.html`, juste après la lecture de `const M = MOTION[sc.motion] || ...`, calculer :
```js
        const PLAN = (vars.motionPlan && typeof vars.motionPlan === 'object') ? vars.motionPlan : null;
        const FROM_SCRATCH = !!(PLAN && PLAN.fromScratch);
```
Englober les blocs « OSCILLATION / HUE / RESPIRATION / entrées de leaves / FLIP / WIGGLE » (PAS l'accent, PAS la
caption, PAS l'entrée du #stage) dans `if (!FROM_SCRATCH) { ... }`. L'accent (cadre + barre) et la caption restent
toujours.

> Le plus sûr : envelopper les blocs concernés dans un `if (!FROM_SCRATCH) {` ... `}` unique. Garder l'entrée du
> stage (`tl.from('#stage', ...)`) car elle ne casse pas le contrôle total et donne un point de départ propre.

- [ ] **Step 2 : Ajouter `applyMotionPlan` avant l'enregistrement de la timeline (square)**

Juste avant `window.__timelines = window.__timelines || {};` (et après le bloc objAnims B-fidèle), insérer :

```js
        // ===== PLAN DE MOTION DESIGNER (prompt IA) =====
        // Applique chaque directive par élément, par-dessus (ou à la place si fromScratch)
        // la chorégraphie globale. Seek-safe : repeat fini + yoyo ; wrapper identité anti-saut.
        function w2pWrap(node) {
          try {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            node.parentNode.insertBefore(g, node);
            g.appendChild(node);
            return g;
          } catch (e) { return node; }
        }
        function w2pTotalSec() {
          // durée approx de la timeline pour calculer les répétitions finies
          return 10 * DUR_SCALE;
        }
        function w2pApplyDirective(node, d) {
          const I = (typeof d.intensity === 'number') ? d.intensity : 0.6;
          const dir = d.direction;
          const start = (typeof d.startSec === 'number') ? d.startSec * DUR_SCALE : 0;
          const D = (typeof d.durationSec === 'number') ? d.durationSec * DUR_SCALE : null;
          const total = w2pTotalSec();
          const col = (typeof d.color === 'string') ? d.color : ACCENT;
          const offX = (dir === 'right') ? -1 : 1;     // entre depuis la gauche par défaut
          const offY = (dir === 'bottom') ? -1 : 1;
          const outX = (dir === 'right') ? 1 : (dir === 'left' ? -1 : 1);
          const outY = (dir === 'bottom') ? 1 : (dir === 'top' ? -1 : 1);
          gsap.set(node, { transformOrigin: '50% 50%' });
          const loopHalf = D ? D / 2 : Math.max(0.3, dur(0.9));
          const REP = Math.min(40, Math.max(1, Math.ceil(total / (D || (loopHalf * 2)))));
          switch (d.effect) {
            // ── entry ──
            case 'slide-in': tl.from(node, { x: offX * 140 * (0.5 + I), y: 0, opacity: 0, duration: D || dur(0.8), ease: 'power3.out' }, start); break;
            case 'fade-in':  tl.from(node, { opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            case 'scale-in': tl.from(node, { scale: 0.7, opacity: 0, duration: D || dur(0.7), ease: 'back.out(1.4)' }, start); break;
            case 'blur-in':  tl.from(node, { filter: 'blur(18px)', opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            case 'drop-in':  tl.from(node, { y: -160 * (0.5 + I), opacity: 0, duration: D || dur(0.8), ease: 'bounce.out' }, start); break;
            case 'fly-in':   tl.from(node, { x: offX * 200 * (0.5 + I), scale: 0.6, opacity: 0, duration: D || dur(0.8), ease: 'power3.out' }, start); break;
            case 'flip-in':  tl.from(node, { scaleX: 0, opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            case 'door-in':  gsap.set(node, { transformOrigin: (dir === 'right' ? '100% 50%' : '0% 50%') }); tl.from(node, { scaleX: 0, opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            case 'fold-in':  gsap.set(node, { transformOrigin: (dir === 'bottom' ? '50% 100%' : '50% 0%') }); tl.from(node, { scaleY: 0, opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            case 'depth-in': tl.from(node, { scale: 0.3 + 0.2 * (1 - I), opacity: 0, duration: D || dur(0.8), ease: 'power2.out' }, start); break;
            // ── loop ──
            case 'pulse':    tl.to(node, { scale: 1 + 0.12 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'bounce':   tl.to(node, { y: -36 * I, duration: loopHalf, ease: 'power1.out', repeat: REP, yoyo: true }, start); break;
            case 'wave':     tl.to(node, { skewX: 8 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'float':    tl.to(node, { y: -10 * I, duration: loopHalf * 1.6, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'wiggle':   tl.to(node, { rotation: 3 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'tilt3d':   tl.to(node, { scaleX: 1 - 0.18 * I, skewY: 6 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'swing3d':  tl.to(node, { skewX: 10 * I, rotation: 3 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'spin3d':   tl.to(node, { scaleX: -1, duration: loopHalf, ease: 'power1.inOut', repeat: REP, yoyo: true }, start); break;
            case 'flip3d':   tl.to(node, { scaleX: 0, duration: loopHalf, ease: 'power2.inOut', repeat: REP, yoyo: true }, start); break;
            case 'wobble3d': tl.to(node, { skewX: 8 * I, skewY: 6 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'depth-pop':tl.to(node, { scale: 1 + 0.18 * I, duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'coin3d':   tl.to(node, { scaleX: -1, duration: Math.max(0.2, loopHalf * 0.6), ease: 'none', repeat: REP, yoyo: true }, start); break;
            case 'color-cycle': gsap.set(node, { filter: 'hue-rotate(0deg)' }); tl.to(node, { filter: 'hue-rotate(180deg)', duration: D || dur(1.5), ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'glow':     gsap.set(node, { filter: 'drop-shadow(0 0 0px ' + col + ')' }); tl.to(node, { filter: 'drop-shadow(0 0 ' + (18 * I) + 'px ' + col + ')', duration: loopHalf, ease: 'sine.inOut', repeat: REP, yoyo: true }, start); break;
            case 'vibrate':  tl.fromTo(node, { x: -3 * I }, { x: 3 * I, duration: 0.06, ease: 'none', repeat: Math.min(140, REP * 8), yoyo: true }, start); break;
            // ── exit ──
            case 'slide-out':tl.to(node, { x: outX * 200, opacity: 0, duration: D || dur(0.7), ease: 'power2.in' }, start || Math.max(0, total - dur(1.0))); break;
            case 'flip-out': tl.to(node, { scaleX: 0, opacity: 0, duration: D || dur(0.7), ease: 'power2.in' }, start || Math.max(0, total - dur(1.0))); break;
            case 'fade-out': tl.to(node, { opacity: 0, duration: D || dur(0.7), ease: 'power2.in' }, start || Math.max(0, total - dur(1.0))); break;
            case 'scale-out':tl.to(node, { scale: 0.9, opacity: 0, duration: D || dur(0.7), ease: 'power2.in' }, start || Math.max(0, total - dur(1.0))); break;
            default: break;
          }
        }
        if (PLAN && Array.isArray(PLAN.directives)) {
          PLAN.directives.forEach((d) => {
            if (!d || !d.target) return;
            let nodes = [];
            if (d.target === 'all') {
              nodes = svgEl ? Array.from(svgEl.querySelectorAll('[id^="w2panim-"]')) : [];
            } else {
              let n = null;
              try { n = svgEl && svgEl.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape('w2panim-' + d.target) : 'w2panim-' + d.target)); } catch (e) { n = null; }
              if (n) nodes = [n];
            }
            const stag = (typeof d.stagger === 'number') ? d.stagger * DUR_SCALE : 0;
            nodes.forEach((node, i) => {
              const wrapped = w2pWrap(node);
              const dd = stag ? Object.assign({}, d, { startSec: ((d.startSec || 0) + i * (stag / DUR_SCALE)) }) : d;
              w2pApplyDirective(wrapped, dd);
            });
          });
        }
```

- [ ] **Step 3 : Vérifier sur le harnais (square)**

Servir les templates et injecter un `motionPlan` de test sur un SVG avec groupes `w2panim` matricés.

Run :
```bash
cd /Applications/_IA/Claude_workspace/Web2Print/public/hf-templates && python3 -m http.server 8769 --bind 127.0.0.1 &
```
Dans le navigateur (claude-in-chrome), charger `http://127.0.0.1:8769/design-reveal-square/index.html`, puis
injecter via `javascript_tool` : fetch du vrai fichier + bootstrap `window.__hyperframes` retournant un SVG avec
`<g id="w2panim-a" transform="matrix(1,0,0,1,150,150)"><circle .../></g>` et
`<g id="w2panim-b" transform="matrix(1,0,0,1,300,150)"><rect .../></g>`, et :
```js
motionPlan: { fromScratch: false, directives: [
  { target: 'a', phase: 'loop', effect: 'tilt3d', intensity: 0.8 },
  { target: 'b', phase: 'loop', effect: 'glow', intensity: 1.0, color: '#e30613' },
  { target: 'all', phase: 'entry', effect: 'slide-in', direction: 'left', stagger: 0.15 },
] }
```
Seek à 0.5 et vérifier :
- `#w2panim-a` a un `skewY`/`scaleX` (tilt3d), `#w2panim-b` un `filter: drop-shadow(...e30613...)` (glow),
- pas d'erreur JS (titre iframe ≠ "ERR:"),
- mesurer la position d'une cible relative à un élément non animé → stable (pas de saut).

Expected : les deux cibles animées distinctement, aucune erreur.

- [ ] **Step 4 : Répliquer dans portrait + landscape**

Copier les Step 1 + Step 2 à l'identique dans `design-reveal-portrait/index.html` et
`design-reveal-landscape/index.html` (le code est identique ; seules les variables d'échelle locales diffèrent
mais sont déjà en scope). Re-vérifier les deux via le harnais (contrôle programmatique : `[id^="w2panim-"]`
trouvés + style appliqué + pas d'« ERR »).

- [ ] **Step 5 : Build + commit**

Run : `npx tsc -b && npm run build`
Expected : OK.

```bash
git add public/hf-templates/design-reveal-square/index.html public/hf-templates/design-reveal-portrait/index.html public/hf-templates/design-reveal-landscape/index.html
git commit -m "feat(video): applyMotionPlan dans les 3 templates design-reveal (2.5D, seek-safe) + fromScratch"
```

---

## Task 7 : Vérification réelle + déploiement

**Files:** aucun (vérification).

- [ ] **Step 1 : Build complet**

Run : `npx tsc -b && npm run build && npm run test:run`
Expected : tout vert.

- [ ] **Step 2 : Run réel (claude-in-chrome ou utilisateur)**

Ouvrir un vrai projet → « Vidéo IA » → champ « Instructions d'animation » :
« effet de carte qui se retourne sur le prix ; entrée des éléments depuis la gauche en cascade, sortie à droite ».
Générer. Vérifier dans l'aperçu (et via inspection DOM de l'iframe) :
- `vars.motionPlan.directives` cite bien l'id du bloc prix (pas un id halluciné),
- le bloc prix joue un flip3d/tilt, les éléments entrent en cascade depuis la gauche,
- pas de saut (wrapper identité).
Tester aussi « Partir de zéro » coché → seules les instructions jouent.

- [ ] **Step 3 : Commit (si ajustements) + déploiement**

```bash
firebase deploy --only hosting
```

---

## Self-Review

**Spec coverage :**
- §4 schéma plat → Task 1 (zod + SCHEMA_FOR_GEMINI). ✓
- §5 flux (inventaire/plan/tag/transport/template) → Tasks 1,2,3,4,6. ✓
- §6 mapping effet→GSAP (dont 2.5D) → Task 6 Step 2. ✓
- §7 UI (champ renommé + « partir de zéro ») → Task 5. ✓
- §9 seek-safety (repeat fini, wrapper identité, aléatoire au plan) → Task 1 (SYSTEM_PROMPT) + Task 6. ✓
- §10 vérification (harnais + run réel) → Task 6 Step 3/4, Task 7. ✓
- §12 cibles inconnues ignorées → Task 1 `repairMotionPlan` (test). ✓

**Placeholder scan :** aucun TBD/TODO ; tout le code des nouveaux modules + applicateur est fourni in extenso.

**Type consistency :** `MotionPlan`/`Directive`/`SceneObject`/`interpretPromptToMotionPlan`/`buildSceneInventory`/
`repairMotionPlan` nommés identiquement de Task 1 à Task 6 ; `captureCurrentPageSvg({tagIds})` cohérent Task 2↔3 ;
`motionPlan` threadé sous le même nom Task 3↔4.
