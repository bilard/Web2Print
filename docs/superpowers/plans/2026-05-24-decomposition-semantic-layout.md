# Moteur décomposition sémantique hybride (Vision + Gemini 3.5) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les heuristiques pixel surcalées (clustering prix, regroupement zones, filtre zone-produit, typage) par une structuration sémantique Gemini 3.5, en gardant les positions précises de Google Vision et un fallback heuristique total.

**Architecture:** Google Vision donne textes+bbox précis → Gemini 3.5 (multimodal) regroupe/typage/compose les prix et exclut logos/pictos/packaging → build Fabric par `type` avec bbox = union des bbox Vision. Si Gemini échoue → fallback sur le pipeline heuristique actuel (préservé intact).

**Tech Stack:** TypeScript strict, Fabric.js v6, Google Vision API, `generateJson` (llmRouter → gemini-3.5-pro), zod.

**Vérification:** `npx tsc -b` (0 erreur sur les fichiers touchés) + `npx vitest run` pour les helpers purs + **test live navigateur** sur `Carrefour/Produit2.pdf` (jambon) ET `Carrefour/Produit1.pdf` (Heineken, non-régression). Les appels LLM/Vision et le rendu Fabric ne sont pas unit-testables → vérif live.

---

## File Structure

- **Créer** `src/features/svg/semanticLayout.ts` — appel Gemini 3.5 + types `LayoutBlock` ; responsabilité : structuration sémantique (1 fonction pure async).
- **Modifier** `src/features/ai/llmRouter.ts` — ajouter la task `design.semanticLayout` (routing gemini-3.5-pro).
- **Modifier** `src/features/svg/useImageToSvgDecompose.ts` — extraire l'actuel pipeline en `decomposeHeuristic()` (fallback) ; ajouter `decomposeSemantic()` (build depuis blocks) + helpers `unionBbox` / `buildStackedPrice` (extrait de PASSE 4) ; `run()` essaie semantic puis fallback.
- **Créer** `src/features/svg/semanticLayout.test.ts` — test pur de validation du schéma/parse (sans réseau).

---

## Task 1 : Task LLM `design.semanticLayout` (gemini-3.5-pro)

**Files:**
- Modify: `src/features/ai/llmRouter.ts` (union `LLMTask`, `TASK_ROUTING`, `TASK_TEMPERATURE`)

- [ ] **Step 1 : Ajouter la task au type union**

Dans le type `LLMTask`, après `| 'design.logoClassify'` :
```ts
  | 'design.semanticLayout'
```

- [ ] **Step 2 : Ajouter le routing (gemini-3.5-pro)**

Dans `TASK_ROUTING`, après l'entrée `'design.logoClassify'` :
```ts
  // Semantic Layout : structuration multimodale (image + textes Vision) → blocs typés,
  // prix composés, logos/packaging exclus. Gemini 3.5 Pro (grounding spatial + sémantique).
  'design.semanticLayout':  { primary: 'gemini', fallback: 'claude', model: 'gemini-3.5-pro' },
```

- [ ] **Step 3 : Ajouter la température (déterministe)**

Dans `TASK_TEMPERATURE`, après `'design.logoClassify':    0,` :
```ts
  'design.semanticLayout':  0,
```

- [ ] **Step 4 : Vérifier tsc**

Run: `npx tsc -b 2>&1 | grep llmRouter || echo OK`
Expected: `OK` (0 erreur)

- [ ] **Step 5 : Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(ai): task design.semanticLayout (gemini-3.5-pro)"
```

---

## Task 2 : Module `semanticLayout.ts`

**Files:**
- Create: `src/features/svg/semanticLayout.ts`
- Test: `src/features/svg/semanticLayout.test.ts`

- [ ] **Step 1 : Écrire le test pur (parse/validation, sans réseau)**

`src/features/svg/semanticLayout.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { LayoutSchema, type LayoutBlock } from './semanticLayout'

describe('semanticLayout schema', () => {
  it('parse une réponse Gemini valide', () => {
    const parsed = LayoutSchema.parse({
      blocks: [
        { type: 'price', text: '5,49 €', memberIndices: [3, 4], priceValue: '5,49 €' },
        { type: 'headline', text: 'LES 2 POUR', memberIndices: [0, 1] },
      ],
    })
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('price')
  })
  it('rejette un type inconnu', () => {
    expect(() => LayoutSchema.parse({ blocks: [{ type: 'logo', text: 'x', memberIndices: [] }] })).toThrow()
  })
})
```

- [ ] **Step 2 : Run test → échoue (module absent)**

Run: `npx vitest run src/features/svg/semanticLayout.test.ts`
Expected: FAIL (cannot find module './semanticLayout')

- [ ] **Step 3 : Écrire le module**

`src/features/svg/semanticLayout.ts` :
```ts
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

export type LayoutBlockType = 'price' | 'headline' | 'title' | 'description' | 'mention' | 'unitprice'

export interface LayoutBlock {
  type: LayoutBlockType
  /** Texte composé/nettoyé (multi-ligne avec \n si besoin) */
  text: string
  /** Index dans la liste de textes Vision → bbox précise par union */
  memberIndices: number[]
  /** Pour type=price : valeur réassemblée "X,YY €" */
  priceValue?: string
}

export const LayoutSchema = z.object({
  blocks: z.array(z.object({
    type: z.enum(['price', 'headline', 'title', 'description', 'mention', 'unitprice']),
    text: z.string(),
    memberIndices: z.array(z.number()),
    priceValue: z.string().optional(),
  })),
})

const layoutJsonSchema = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['price', 'headline', 'title', 'description', 'mention', 'unitprice'] },
          text: { type: 'string' },
          memberIndices: { type: 'array', items: { type: 'number' } },
          priceValue: { type: 'string' },
        },
        required: ['type', 'text', 'memberIndices'],
      },
    },
  },
  required: ['blocks'],
} as const

const PROMPT = `Tu analyses une CRÉA PROMOTIONNELLE retail (supermarché). Image fournie + liste de textes OCR (chaque item : index "i", "text", position "xPct"/"yPct" en % de l'image).

Regroupe les textes en BLOCS ÉDITABLES et type chacun :
- "price" : un prix (gros chiffre + €/décimales, souvent composé). Réassemble la valeur exacte dans "priceValue" au format "X,YY €" (virgule décimale). Mets dans "memberIndices" TOUS les index OCR du prix.
- "headline" : accroche promo en capitales ("LES 2 POUR", "-50% SUR LE 2ÈME"…).
- "title" : nom/désignation du produit.
- "description" : texte descriptif, mentions, ingrédients.
- "mention" : petites mentions légales / "Au rayon …".
- "unitprice" : prix au kg/litre ("Le kg : 22,88 €").

RÈGLES STRICTES :
- EXCLUS totalement (n'inclus dans AUCUN bloc) : tout texte appartenant à un LOGO / PICTO / SCEAU / CERTIFICATION / label qualité / origine / marque dessinée (ex "origine France", "élevé sans antibiotique", "le porc français", "filière qualité"), ET tout texte imprimé sur le PACKAGING/PRODUIT photographié.
- "text" = texte propre, lisible, multi-ligne avec \\n si le bloc occupe plusieurs lignes.
- N'invente pas de texte ; n'utilise que les libellés OCR fournis.

Retourne UNIQUEMENT du JSON {"blocks":[…]}.`

/**
 * Structuration sémantique d'une créa via Gemini 3.5 (multimodal). Reçoit l'image
 * + les textes Vision (index/position) ; renvoie des blocs éditables typés, prix
 * composés, logos/pictos/packaging exclus. Échec → [] (le caller fait le fallback).
 */
export async function semanticLayout(
  imageDataUri: string,
  texts: { i: number; text: string; xPct: number; yPct: number }[],
): Promise<LayoutBlock[]> {
  if (texts.length === 0) return []
  const list = texts.map((t) => ({ i: t.i, text: t.text.slice(0, 80), xPct: Math.round(t.xPct), yPct: Math.round(t.yPct) }))
  try {
    const res = await generateJson({
      task: 'design.semanticLayout',
      prompt: `${PROMPT}\n\nTEXTES OCR :\n${JSON.stringify(list)}`,
      schema: LayoutSchema,
      schemaForLLM: layoutJsonSchema,
      schemaForClaude: layoutJsonSchema,
      version: 'semantic-layout-v1',
      imageDataUris: [imageDataUri],
    })
    return res.blocks as LayoutBlock[]
  } catch (err) {
    console.warn('[semanticLayout] failed:', err)
    return []
  }
}
```

- [ ] **Step 4 : Run test → passe**

Run: `npx vitest run src/features/svg/semanticLayout.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5 : Vérifier tsc**

Run: `npx tsc -b 2>&1 | grep semanticLayout || echo OK`
Expected: `OK`

- [ ] **Step 6 : Commit**

```bash
git add src/features/svg/semanticLayout.ts src/features/svg/semanticLayout.test.ts
git commit -m "feat(svg): module semanticLayout (Gemini 3.5 structuration hybride)"
```

---

## Task 3 : Helpers réutilisables — `unionBbox` + extraction `buildStackedPrice`

**Files:**
- Modify: `src/features/svg/useImageToSvgDecompose.ts`

Contexte : la construction du prix empilé (gros entier ancré centre + pile €/décimales ancrée bas) est aujourd'hui INLINE dans la boucle PASSE 4. On l'extrait en fonction réutilisable pour que `decomposeSemantic` (Task 4) l'appelle avec `priceValue`.

- [ ] **Step 1 : Ajouter `unionBbox` (après les helpers bbox existants, ex. après `rectDistance`)**

```ts
type Bbox = VisionParagraph['bbox']
function unionBbox(boxes: Bbox[]): Bbox {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  for (const x of boxes) {
    l = Math.min(l, x.left); t = Math.min(t, x.top)
    r = Math.max(r, x.left + x.width); b = Math.max(b, x.top + x.height)
  }
  return { left: l, top: t, width: r - l, height: b - t }
}
```

- [ ] **Step 2 : Extraire `buildStackedPrice` à partir du corps de la boucle PASSE 4**

Créer la fonction (au niveau module, près de `buildTextbox`). Elle encapsule la logique actuelle (BOOST 1.6, intOpts originY center, pile originY bottom, priceGroupId) en partant d'une `priceValue` et d'une bbox + props typo :

```ts
function buildStackedPrice(
  canvas: Canvas,
  priceValue: string,
  bbox: VisionParagraph['bbox'],
  fontFamily: string,
  fontWeight: number | string,
  fill: string,
): void {
  const parts = parsePriceParts(priceValue)
  if (!parts) {
    const fs = Math.max((bbox.height) * 0.95, 10)
    const tb = buildTextbox(priceValue, bbox, fs, fill, typeof fontWeight === 'number' ? fontWeight : 900)
    canvas.add(tb)
    return
  }
  const detFs = Math.max(bbox.height * 0.95, 10)
  const centerY = bbox.top + bbox.height / 2
  const leftX = bbox.left
  const BOOST = 1.6
  const bigFs = Math.round(detFs * BOOST)
  const intWidth = parts.integer.length * bigFs * 0.62
  const intTb = new Textbox(parts.integer, {
    originX: 'left', originY: 'center', left: leftX, top: centerY, width: intWidth,
    fontSize: bigFs, fontFamily, fontWeight, fill, lineHeight: 0.9, textAlign: 'left',
    editable: true, selectable: true, evented: true, objectCaching: true,
  })
  ;(intTb as FabricObject & { data?: Record<string, unknown> }).data = { role: 'image-decompose-text', name: '', type: 'text' }
  canvas.add(intTb)
  const stackText = parts.decimals ? `${parts.currency}\n${parts.decimals}` : parts.currency
  const stackFs = Math.max(Math.round(bigFs * 0.45), 10)
  const stack = new Textbox(stackText, {
    originX: 'left', originY: 'bottom',
    left: leftX + intWidth + Math.round(bigFs * 0.03), top: centerY + Math.round(bigFs * 0.36),
    width: stackFs * 1.8, fontSize: stackFs, fontFamily, fontWeight, fill, lineHeight: 0.85, textAlign: 'left',
    editable: true, selectable: true, evented: true, objectCaching: true,
  })
  ;(stack as FabricObject & { data?: Record<string, unknown> }).data = { role: 'image-decompose-text', name: '', type: 'text' }
  canvas.add(stack)
  const gid = `price-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`
  ;(intTb as FabricObject & { data?: Record<string, unknown> }).data = { ...(intTb as FabricObject & { data?: Record<string, unknown> }).data, priceGroupId: gid }
  ;(stack as FabricObject & { data?: Record<string, unknown> }).data = { ...(stack as FabricObject & { data?: Record<string, unknown> }).data, priceGroupId: gid }
}
```

- [ ] **Step 3 : Vérifier tsc (la fonction est ajoutée, pas encore appelée — toléré)**

Run: `npx tsc -b 2>&1 | grep useImageToSvgDecompose || echo OK`
Expected: `OK` (si erreur "déclaré mais non utilisé", garder — sera utilisé Task 4 ; sinon ignorer)

- [ ] **Step 4 : Commit**

```bash
git add src/features/svg/useImageToSvgDecompose.ts
git commit -m "refactor(svg): extraire unionBbox + buildStackedPrice (réutilisables)"
```

---

## Task 4 : `decomposeHeuristic()` (fallback) + `decomposeSemantic()` + orchestration `run()`

**Files:**
- Modify: `src/features/svg/useImageToSvgDecompose.ts`

- [ ] **Step 1 : Renommer l'actuel corps de décomposition en `decomposeHeuristic`**

Le bloc PASSE 1→PASSE 5 actuellement dans `run()` (après obtention de `result`, `ctx`, `width`, `height`) est déplacé tel quel dans une fonction async privée :
```ts
async function decomposeHeuristic(
  canvas: Canvas, ctx: CanvasRenderingContext2D, dataUri: string,
  result: VisionDecomposeResult, width: number, height: number, toastId: string | number,
): Promise<number> {
  // ... CORPS ACTUEL (PASSE 1 collecte items, PASSE 1.5 classifyLogoTexts, PASSE 2 zones,
  //     PASSE 3 masques+textboxes, PASSE 4 prix, PASSE 5 regroupements) ...
  // return kept
}
```
(Copie intégrale du code existant ; aucun changement de logique. `run()` ne le contient plus directement.)

- [ ] **Step 2 : Écrire `decomposeSemantic` (nouveau)**

```ts
async function decomposeSemantic(
  canvas: Canvas, ctx: CanvasRenderingContext2D, dataUri: string,
  result: VisionDecomposeResult, width: number, height: number, toastId: string | number,
): Promise<number | null> {
  const texts = result.paragraphs.map((p, i) => ({
    i, text: p.text,
    xPct: ((p.bbox.left + p.bbox.width / 2) / width) * 100,
    yPct: ((p.bbox.top + p.bbox.height / 2) / height) * 100,
  }))
  toast.loading('Analyse sémantique (Gemini 3.5)…', { id: toastId })
  const blocks = await semanticLayout(dataUri, texts)
  if (blocks.length === 0) return null // → fallback

  // Construit (bbox, couleur, fond) par bloc à partir des bbox Vision précises.
  interface Built { block: LayoutBlock; bbox: VisionParagraph['bbox']; color: string; bgHex: string; bgUniform: boolean }
  const built: Built[] = []
  for (const block of blocks) {
    const members = block.memberIndices
      .filter((i) => i >= 0 && i < result.paragraphs.length)
      .map((i) => result.paragraphs[i])
    if (members.length === 0) continue
    const bbox = unionBbox(members.map((m) => m.bbox))
    const bg = sampleBackground(ctx, bbox, width, height)
    const color = sampleTextColor(ctx, bbox, bg.hex, width, height)
    built.push({ block, bbox, color, bgHex: bg.hex, bgUniform: bg.uniform })
  }
  if (built.length === 0) return null

  // Masques : regroupe les blocs sur fond couleur uniforme (non blanc) par couleur+proximité,
  // grow sur l'aplat réel (réutilise la logique existante via groupItemsByZone-like).
  const colored = built.filter((b) => b.bgUniform && !isNearWhite(b.bgHex))
  const maskZones = groupBuiltByColor(colored) // helper Step 3
  for (const z of maskZones) {
    const grown = growBoxToColorExtent(ctx, z.bbox, z.bgHex, width, height)
    canvas.add(buildMaskRect(grown, z.bgHex, 2, 2))
  }

  // Textes par type.
  for (const b of built) {
    const fontWeight = detectFontWeight(ctx, b.bbox, b.color, width, height)
    const fontFamily = fontWeight >= 900 ? 'Arial Black' : 'Arial'
    if (b.block.type === 'price') {
      buildStackedPrice(canvas, b.block.priceValue ?? b.block.text, b.bbox, fontFamily, fontWeight, b.color)
      continue
    }
    const fontSize = Math.max((b.bbox.height / Math.max(b.block.text.split('\n').length, 1)) * 0.95, 10)
    const { text, styles } = buildTextAndStyles([{ text: b.block.text, bbox: b.bbox }], fontSize)
    canvas.add(buildTextbox(text, b.bbox, fontSize, b.color, fontWeight, styles))
  }
  return built.length
}
```

- [ ] **Step 3 : Ajouter `groupBuiltByColor` (regroupement masque sur les blocs)**

```ts
function groupBuiltByColor(
  items: { bbox: VisionParagraph['bbox']; bgHex: string }[],
): { bbox: VisionParagraph['bbox']; bgHex: string }[] {
  const zones: { bbox: VisionParagraph['bbox']; bgHex: string }[] = []
  for (const it of items) {
    const z = zones.find((z) => colorDistL1(z.bgHex, it.bgHex) <= 60 && rectDistance(z.bbox, it.bbox) <= 100)
    if (z) z.bbox = unionBbox([z.bbox, it.bbox])
    else zones.push({ bbox: { ...it.bbox }, bgHex: it.bgHex })
  }
  return zones
}
```

- [ ] **Step 4 : Câbler l'orchestration dans `run()`**

À l'endroit où `run()` appelait l'ancien corps, remplacer par :
```ts
      let kept = await decomposeSemantic(canvas, ctx, dataUri, result, width, height, toastId)
      if (kept === null) {
        // Fallback : Gemini indisponible/échec → pipeline heuristique calé.
        kept = await decomposeHeuristic(canvas, ctx, dataUri, result, width, height, toastId)
      }
      // ... suite existante : cacher bg, requestRenderAll, syncToStore, setState, toast succès (kept) ...
```

- [ ] **Step 5 : Adapter `buildTextAndStyles` pour accepter un mot unique**

`buildTextAndStyles(words)` prend des `VisionWord[]`. Dans `decomposeSemantic` on passe `[{ text, bbox }]` (1 "mot" = le bloc). Vérifier que la signature accepte `{ text: string; bbox: Bbox }[]` (c'est le type `VisionWord`). Si l'heuristique % / ordinaux par-mot ne s'applique pas sur un bloc multi-mots, c'est acceptable (le texte Gemini est déjà propre) — les heuristiques % / ordinaux restent actives via le regex de fin de `buildTextAndStyles`.

- [ ] **Step 6 : Vérifier tsc (tous les fichiers touchés)**

Run: `npx tsc -b 2>&1 | grep -E "useImageToSvgDecompose|semanticLayout|llmRouter" || echo OK`
Expected: `OK`

- [ ] **Step 7 : Commit**

```bash
git add src/features/svg/useImageToSvgDecompose.ts
git commit -m "feat(svg): décomposition sémantique Gemini 3.5 + fallback heuristique"
```

---

## Task 5 : Vérification live (critère de succès)

**Files:** aucun (test manuel navigateur).

- [ ] **Step 1 : Lancer le serveur de dev**

Run: `npm run dev` (arrière-plan) ; noter l'URL Vite.

- [ ] **Step 2 : Tester le jambon (Produit2)**

Copier `Carrefour/Produit2.pdf` dans `public/__pdftest.pdf`, importer via la carte « PDF → SVG éditable », cliquer « Décomposer ».
Attendu : prix `5,49 €` et `8,90 €` corrects et empilés ; « LES 2 POUR » complet ; titre/description placés ; **aucun** texte de logo/picto/packaging.

- [ ] **Step 3 : Tester le Heineken (Produit1) — non-régression**

Idem avec `Carrefour/Produit1.pdf`.
Attendu : résultat ≥ qualité actuelle (prix `9⁵⁹€`/`4⁷⁹€`, `-50%`, `SUR LE 2ᴱᴹᴱ`).

- [ ] **Step 4 : Nettoyage**

`rm -f public/__pdftest.pdf` ; arrêter le serveur de dev.

- [ ] **Step 5 : Commit final si ajustements**

```bash
git add -A && git commit -m "fix(svg): ajustements post-test live décomposition sémantique"
```
