# Nano Banana 2 as Primary Render — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Préserver la richesse créative du PNG Nano Banana 2 en l'utilisant comme rendu principal lockée sur le canvas, et ajouter des overlays éditables Fabric (Textbox + FabricImage) uniquement sur les zones data critiques (prix, titre, features, photo, logo) via masquage couleur.

**Architecture:** Pipeline retail (β1) — l'image NB2 devient le background lockée du canvas. Claude Vision allégée renvoie un mode (`retail` | `creative`) et, en mode retail, uniquement les zones data avec leur couleur de fond local pour permettre le masquage. Pipeline creative (β2) conservé pour designs non-retail et fallback compose-direct, avec `mode: 'creative'` explicite.

**Tech Stack:** TypeScript strict, Fabric.js v6, vitest pour helpers purs, React 18 + Vite 5 pour le shell, Anthropic SDK (Claude Vision via le proxy local).

**Working tree:** Direct sur master (pas de worktree, voir `feedback_no_worktree.md`).

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `src/features/ai-design/analyzeDesignForEdit.ts` | Modifié | Types `DesignAnalysis` étendus (mode, role, backgroundColor, backgroundIsUniform) + prompt Claude Vision adaptatif retail/creative |
| `src/features/ai-design/composeDesignFromScrapedData.ts` | Modifié | Set `mode: 'creative'` dans la `DesignAnalysis` retournée (vectorielle complète) |
| `src/features/ai-design/createHybridDesignCanvas.ts` | Renommé → `renderNanoBananaCanvas.ts` | Renderer principal : helpers vectoriels (creative) + helpers overlay (retail) |
| `src/features/ai-design/sampleColor.ts` | Créé | Helper pur `sampleAvgColorAroundBbox` — testable hors browser via canvas mocké jsdom |
| `src/features/ai-design/sampleColor.test.ts` | Créé | Tests vitest du helper |
| `src/features/ai-design/useGenerateDesign.ts` | Modifié | Routing β1+β2 : retail → renderNanoBananaWithOverlays, creative → ancien pipeline |
| `src/features/ai-design/types.ts` | Modifié (cosmétique) | Ajustement éventuel de DesignResult |

---

## Task 1: Étendre les types `DesignAnalysis`

**Files:**
- Modify: `src/features/ai-design/analyzeDesignForEdit.ts:15-78`

- [ ] **Step 1.1: Lire le fichier complet pour situer les types**

```bash
sed -n '1,80p' src/features/ai-design/analyzeDesignForEdit.ts
```

- [ ] **Step 1.2: Étendre `TextElement` avec `role`, `backgroundColor`, `backgroundIsUniform`**

Remplacer l'interface `TextElement` actuelle (lignes ~15-34) par :

```ts
export type TextRole =
  | 'price'
  | 'oldPrice'
  | 'title'
  | 'feature'
  | 'rating'
  | 'reviewCount'
  | 'badge'
  | 'cta'
  | 'other'

export interface TextElement {
  id: string
  text: string
  /** Position et taille en POURCENTAGES (0-100) du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Rôle data : sert au routing override + détection retail */
  role: TextRole
  /** Taille de police en % de la hauteur du canvas (ex: 6 = 6% de canvasHeight) */
  fontSizePct: number
  /** Nom exact d'une famille Google Fonts */
  fontFamily: string
  /** Couleur du texte (hex) */
  color: string
  bold: boolean
  italic?: boolean
  /** Barré (pour les prix d'origine barrés) */
  strikethrough?: boolean
  align: 'left' | 'center' | 'right'
  /** Couleur du fond local sous le texte (hex). Utilisée pour masquer le texte
   *  NB2 sous-jacent quand on overlay un Textbox éditable par-dessus. */
  backgroundColor: string
  /** false si le fond local est un gradient/photo/dégradé. Dans ce cas, le
   *  renderer fallback sur sample pixel client-side. */
  backgroundIsUniform: boolean
}
```

- [ ] **Step 1.3: Étendre `ImageSlot` avec `backgroundColor`, `backgroundIsUniform`**

Remplacer l'interface `ImageSlot` actuelle (lignes ~38-44) par :

```ts
export interface ImageSlot {
  id: string
  role: ImageSlotRole
  bbox: { x: number; y: number; w: number; h: number }
  description: string
  /** Couleur du fond local sous le slot (hex). Voir TextElement.backgroundColor. */
  backgroundColor: string
  backgroundIsUniform: boolean
}
```

- [ ] **Step 1.4: Ajouter `DesignMode` et marquer `background` / `decorativeShapes` optionnels**

Remplacer l'interface `DesignAnalysis` actuelle (lignes ~73-78) par :

```ts
export type DesignMode = 'retail' | 'creative'

export interface DesignAnalysis {
  /** Décide quel renderer utiliser. retail = NB2 lockée + overlays. creative = reconstruction vectorielle complète (ancien pipeline + fallback compose-direct). */
  mode: DesignMode
  texts: TextElement[]
  imageSlots: ImageSlot[]
  /** Présent uniquement si mode='creative'. Optionnel sinon. */
  background?: BackgroundDef
  /** Présent uniquement si mode='creative'. Optionnel sinon. */
  decorativeShapes?: DecorativeShape[]
}
```

- [ ] **Step 1.5: Vérifier que la compilation TS ne casse pas (yet)**

```bash
npx tsc -b --noEmit 2>&1 | head -50
```

Expected: erreurs sur `composeDesignFromScrapedData.ts`, `createHybridDesignCanvas.ts`, `useGenerateDesign.ts` (ils référencent les anciens types). C'est attendu — on les corrige dans les tâches suivantes. Ne pas committer encore.

- [ ] **Step 1.6: Pas de commit ici** — laisser le code en état "broken-by-design" jusqu'à la fin de la Task 3 où la compile redeviendra clean.

---

## Task 2: Adapter le prompt Claude Vision pour `mode` + `backgroundColor`

**Files:**
- Modify: `src/features/ai-design/analyzeDesignForEdit.ts:80-300` (le `PROMPT` constant et le parsing JSON)

- [ ] **Step 2.1: Lire le prompt actuel et la fonction d'appel**

```bash
sed -n '80,400p' src/features/ai-design/analyzeDesignForEdit.ts
```

- [ ] **Step 2.2: Ajouter le préambule mode + le contrat de sortie unifié dans `PROMPT`**

Insérer en haut du prompt (juste après "Décompose cette image…") un bloc :

```
## ÉTAPE 0 — DÉCISION DE MODE

Avant tout, décide si l'image est :
- "retail" : produit avec prix + titre + photo produit clairement identifiables (flyer commerce, promo, carte produit)
- "creative" : poster artistique, invitation, affiche événementielle, design typographique sans data produit explicite

Retourne `mode` dans ta réponse JSON.

## CONTRAT DE SORTIE

Si mode = "retail" :
  Retourne EXACTEMENT { mode, texts, imageSlots }. NE retourne PAS background NI decorativeShapes (ils ne sont pas utilisés).

Si mode = "creative" :
  Retourne EXACTEMENT { mode, background, decorativeShapes, texts, imageSlots }.

Dans les deux cas, chaque texte/slot doit inclure `backgroundColor` (couleur du fond local hex) + `backgroundIsUniform` (true si fond local plat, false si gradient/photo/dégradé).
```

- [ ] **Step 2.3: Étendre la spec `texts` du prompt avec `role`, `backgroundColor`, `backgroundIsUniform`**

Dans la section `## 3. texts`, ajouter aux champs listés :

```
- role : "price" | "oldPrice" | "title" | "feature" | "rating" | "reviewCount" | "badge" | "cta" | "other"
  Choisis le rôle qui correspond le mieux. "title" pour le headline produit. "price" pour le prix gros chiffres. "oldPrice" pour le prix barré. "feature" pour les bullets. "rating" pour la note "4.3" ou "4.3/5". "reviewCount" pour "127 avis". "badge" pour "OFFRE EXCLUSIVE", "PROMO", etc. "cta" pour "J'EN PROFITE", "ACHETER", etc. "other" sinon.
- backgroundColor : couleur hex du fond local SOUS ce texte (échantillonne autour de la bbox, pas dedans).
- backgroundIsUniform : true si fond local plat (couleur unie), false si gradient, photo, ou dégradé visible.
```

- [ ] **Step 2.4: Étendre la spec `imageSlots` du prompt avec `backgroundColor`, `backgroundIsUniform`**

Dans la section `## 4. imageSlots`, ajouter :

```
- backgroundColor : couleur hex du fond local AUTOUR de l'imageSlot (pas dans la bbox).
- backgroundIsUniform : true si fond local plat, false sinon.
```

- [ ] **Step 2.5: Lire et adapter la fonction `analyzeDesignForEdit` pour parser le nouveau schema**

Trouver où le JSON Claude est parsé (chercher `JSON.parse` ou `JSON.parse(content)`) :

```bash
grep -n "JSON.parse\|return.*background\|texts.*imageSlots" src/features/ai-design/analyzeDesignForEdit.ts
```

- [ ] **Step 2.6: Modifier la validation/normalisation post-parse pour accepter `mode`**

Après le `JSON.parse`, ajouter une normalisation defensive qui fournit des défauts si Claude renvoie un schema incomplet :

```ts
const parsed = JSON.parse(jsonText) as Partial<DesignAnalysis>

// Mode obligatoire — défaut retail si absent (backward compat)
const mode: DesignMode = parsed.mode === 'creative' ? 'creative' : 'retail'

// Normalise textZones : role défaut 'other', backgroundColor défaut '#ffffff', backgroundIsUniform défaut true
const texts: TextElement[] = (parsed.texts ?? []).map((t) => ({
  ...t,
  role: t.role ?? 'other',
  backgroundColor: t.backgroundColor ?? '#ffffff',
  backgroundIsUniform: t.backgroundIsUniform ?? true,
})) as TextElement[]

const imageSlots: ImageSlot[] = (parsed.imageSlots ?? []).map((s) => ({
  ...s,
  backgroundColor: s.backgroundColor ?? '#ffffff',
  backgroundIsUniform: s.backgroundIsUniform ?? true,
})) as ImageSlot[]

const result: DesignAnalysis = {
  mode,
  texts,
  imageSlots,
}

if (mode === 'creative') {
  result.background = parsed.background
  result.decorativeShapes = parsed.decorativeShapes ?? []
}

return result
```

(Le code exact dépend de la structure actuelle du fichier ; à fusionner avec la fonction existante en respectant son flux d'erreur.)

- [ ] **Step 2.7: Pas de commit ici** — la compile reste cassée pour useGenerateDesign et createHybridDesignCanvas, on poursuit.

---

## Task 3: Set `mode: 'creative'` dans `composeDesignFromScrapedData`

**Files:**
- Modify: `src/features/ai-design/composeDesignFromScrapedData.ts:1-217`

- [ ] **Step 3.1: Ajouter `role` aux textes existants**

Pour chaque `texts.push({...})` dans le fichier, ajouter le champ `role` approprié (`title`, `price`, `oldPrice`, `feature`, `rating`, `reviewCount`, `badge`, `cta`).

Mapping :
- `badge_label` → `role: 'badge'`
- `product_title` → `role: 'title'`
- `feature_${i}` → `role: 'feature'`
- `rating_stars` → `role: 'rating'`
- `rating_text` → `role: 'rating'` (la string complète "4.3/5 · 127 AVIS")
- `price_old` → `role: 'oldPrice'`
- `price_current` → `role: 'price'`
- `cta_label` → `role: 'cta'`

- [ ] **Step 3.2: Ajouter `backgroundColor` + `backgroundIsUniform` aux textes et imageSlots**

Comme c'est nous qui posons le fond, on connaît la couleur exacte. Exemple pour `badge_label` (fond vert) :
```ts
backgroundColor: PALETTE.accent,
backgroundIsUniform: true,
```

Pour `product_title` (fond crème) :
```ts
backgroundColor: PALETTE.bg,
backgroundIsUniform: true,
```

Pour `price_current` (fond noir) :
```ts
backgroundColor: PALETTE.priceBlock,
backgroundIsUniform: true,
```

Pour `cta_label` (fond vert) :
```ts
backgroundColor: PALETTE.accent,
backgroundIsUniform: true,
```

Pour `brand_logo` et `product_photo` imageSlots :
```ts
backgroundColor: PALETTE.bg,
backgroundIsUniform: true,
```

- [ ] **Step 3.3: Ajouter `mode: 'creative'` au retour final**

Modifier le `return` final (ligne ~211) :

```ts
return {
  mode: 'creative',
  background,
  decorativeShapes,
  texts,
  imageSlots,
}
```

- [ ] **Step 3.4: Vérifier la compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "composeDesign|analyzeDesign" | head -20
```

Expected: zéro erreur sur `composeDesignFromScrapedData.ts` et `analyzeDesignForEdit.ts`. Erreurs restantes attendues sur `createHybridDesignCanvas.ts` (lecture des champs sans optional chaining) et `useGenerateDesign.ts`.

- [ ] **Step 3.5: Commit point intermédiaire**

```bash
git add src/features/ai-design/analyzeDesignForEdit.ts src/features/ai-design/composeDesignFromScrapedData.ts
git commit -m "$(cat <<'EOF'
feat(ai-design): extend DesignAnalysis schema with mode + role + masking colors

- Ajoute DesignMode ('retail' | 'creative') sur DesignAnalysis
- Ajoute role + backgroundColor + backgroundIsUniform sur TextElement
- Ajoute backgroundColor + backgroundIsUniform sur ImageSlot
- background et decorativeShapes deviennent optionnels (présents si creative)
- composeDesignFromScrapedData set mode='creative' explicitement
- Prompt Claude Vision étendu pour retourner le nouveau schéma

Step intermédiaire — useGenerateDesign et createHybridDesignCanvas
suivent dans les commits suivants.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Renommer `createHybridDesignCanvas.ts` → `renderNanoBananaCanvas.ts`

**Files:**
- Rename: `src/features/ai-design/createHybridDesignCanvas.ts` → `src/features/ai-design/renderNanoBananaCanvas.ts`
- Modify: `src/features/ai-design/useGenerateDesign.ts:9-14` (imports)

- [ ] **Step 4.1: Renommer le fichier (préserve l'historique git)**

```bash
git mv src/features/ai-design/createHybridDesignCanvas.ts src/features/ai-design/renderNanoBananaCanvas.ts
```

- [ ] **Step 4.2: Mettre à jour l'import dans `useGenerateDesign.ts`**

Remplacer (ligne ~9-14) :
```ts
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
} from './createHybridDesignCanvas'
```

par :
```ts
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
} from './renderNanoBananaCanvas'
```

- [ ] **Step 4.3: Chercher d'autres imports résiduels**

```bash
grep -rn "createHybridDesignCanvas" src/ 2>/dev/null
```

Expected: 0 résultat. Si match, mettre à jour les imports correspondants.

- [ ] **Step 4.4: Vérifier la compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "renderNanoBanana|createHybridDesign" | head -10
```

Expected: pas d'erreur de module manquant. Les erreurs liées aux nouveaux types restent.

- [ ] **Step 4.5: Pas de commit ici** — on continue avec le sample helper, puis batch commit après ajout des helpers.

---

## Task 5: Helper pur `sampleAvgColorAroundBbox` + tests vitest

**Files:**
- Create: `src/features/ai-design/sampleColor.ts`
- Create: `src/features/ai-design/sampleColor.test.ts`

- [ ] **Step 5.1: Écrire le test failant d'abord (TDD)**

Créer `src/features/ai-design/sampleColor.test.ts` :

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { sampleAvgColorAroundBbox } from './sampleColor'

function makeImage(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLImageElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  paint(ctx)
  const dataUrl = c.toDataURL('image/png')
  const img = new Image()
  img.src = dataUrl
  // jsdom Image doesn't fire onload synchronously; we set width/height directly for the helper
  Object.defineProperty(img, 'naturalWidth', { value: width })
  Object.defineProperty(img, 'naturalHeight', { value: height })
  Object.defineProperty(img, 'width', { value: width, configurable: true })
  Object.defineProperty(img, 'height', { value: height, configurable: true })
  // Inject the source canvas as the decoded source for the helper
  ;(img as unknown as { __testCanvas: HTMLCanvasElement }).__testCanvas = c
  return img
}

describe('sampleAvgColorAroundBbox', () => {
  it('échantillonne le rouge pur autour d\'une bbox sur fond rouge', () => {
    const img = makeImage(100, 100, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 100, 100)
      // text noir au centre — ne doit PAS être sampled
      ctx.fillStyle = '#000000'
      ctx.fillRect(40, 40, 20, 20)
    })
    const color = sampleAvgColorAroundBbox(img, { x: 40, y: 40, w: 20, h: 20 })
    expect(color.toLowerCase()).toBe('#ff0000')
  })

  it('moyenne pondérée si fond bicolore', () => {
    const img = makeImage(200, 100, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 100, 100)
      ctx.fillStyle = '#0000ff'
      ctx.fillRect(100, 0, 100, 100)
    })
    // bbox au centre → moitié rouge moitié bleu autour
    const color = sampleAvgColorAroundBbox(img, { x: 47, y: 40, w: 6, h: 20 })
    // moyenne attendue ~ #800080 (purple)
    expect(color.toLowerCase()).toMatch(/^#[78][0-9a-f]00[78][0-9a-f]$/)
  })

  it('clampe la zone de sampling aux bornes de l\'image', () => {
    const img = makeImage(50, 50, (ctx) => {
      ctx.fillStyle = '#00ff00'
      ctx.fillRect(0, 0, 50, 50)
    })
    // bbox qui touche le bord — la zone d'échantillonnage doit clamp
    const color = sampleAvgColorAroundBbox(img, { x: 0, y: 0, w: 100, h: 100 })
    expect(color.toLowerCase()).toBe('#00ff00')
  })
})
```

- [ ] **Step 5.2: Lancer le test pour vérifier qu'il échoue (module manquant)**

```bash
npx vitest run src/features/ai-design/sampleColor.test.ts
```

Expected: FAIL with "Cannot find module './sampleColor'".

- [ ] **Step 5.3: Implémenter `sampleAvgColorAroundBbox`**

Créer `src/features/ai-design/sampleColor.ts` :

```ts
type Bbox = { x: number; y: number; w: number; h: number }

/**
 * Échantillonne la couleur moyenne d'une couronne autour de la bbox dans
 * l'image décodée. Sample en dehors de la bbox (jamais dedans) pour ne pas
 * capturer le texte/objet overlayé. Retourne une string CSS hex (#rrggbb).
 *
 * Paramètres :
 *  - img : HTMLImageElement décodée (naturalWidth/Height définis)
 *  - bbox : zone en POURCENTAGES (0-100) de l'image
 *
 * Implementation :
 *  - convertit la bbox en pixels source
 *  - définit une couronne externe de padding `ringPx` autour de la bbox,
 *    clampée aux bornes de l'image
 *  - sample N points uniformément dans la couronne, moyenne RGB
 */
export function sampleAvgColorAroundBbox(
  img: HTMLImageElement,
  bbox: Bbox,
  options: { ringPx?: number; samplesPerSide?: number } = {}
): string {
  const ringPx = options.ringPx ?? 6
  const samplesPerSide = options.samplesPerSide ?? 8

  const W = img.naturalWidth || img.width
  const H = img.naturalHeight || img.height

  const bx = clamp(0, W, (bbox.x / 100) * W)
  const by = clamp(0, H, (bbox.y / 100) * H)
  const bw = clamp(0, W - bx, (bbox.w / 100) * W)
  const bh = clamp(0, H - by, (bbox.h / 100) * H)

  // Dans les tests jsdom, on injecte le canvas source via __testCanvas pour
  // contourner le fait que jsdom ne décode pas vraiment l'image src=data:.
  const sourceCanvas =
    (img as unknown as { __testCanvas?: HTMLCanvasElement }).__testCanvas ??
    drawImageToCanvas(img, W, H)
  const ctx = sourceCanvas.getContext('2d')
  if (!ctx) return '#ffffff'

  const points: Array<[number, number]> = []
  // Top edge (juste au-dessus de la bbox)
  for (let i = 0; i < samplesPerSide; i++) {
    const fx = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + fx * bw, by - ringPx])
  }
  // Bottom edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fx = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + fx * bw, by + bh + ringPx])
  }
  // Left edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fy = i / Math.max(1, samplesPerSide - 1)
    points.push([bx - ringPx, by + fy * bh])
  }
  // Right edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fy = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + bw + ringPx, by + fy * bh])
  }

  let r = 0, g = 0, b = 0, n = 0
  for (const [px, py] of points) {
    const cx = clamp(0, W - 1, Math.round(px))
    const cy = clamp(0, H - 1, Math.round(py))
    const data = ctx.getImageData(cx, cy, 1, 1).data
    r += data[0]
    g += data[1]
    b += data[2]
    n++
  }
  if (n === 0) return '#ffffff'
  return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n))
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v))
}

function drawImageToCanvas(img: HTMLImageElement, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(img, 0, 0)
  return c
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
```

- [ ] **Step 5.4: Re-lancer les tests**

```bash
npx vitest run src/features/ai-design/sampleColor.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/features/ai-design/sampleColor.ts src/features/ai-design/sampleColor.test.ts src/features/ai-design/renderNanoBananaCanvas.ts src/features/ai-design/useGenerateDesign.ts
git commit -m "$(cat <<'EOF'
feat(ai-design): rename canvas renderer + add sampleAvgColorAroundBbox helper

- Rename createHybridDesignCanvas.ts → renderNanoBananaCanvas.ts (preserves git history)
- New helper sampleColor.ts : échantillonne la couleur moyenne d'une couronne
  autour d'une bbox dans une image décodée. Utilisé pour le masquage M2
  fallback quand backgroundIsUniform=false.
- Tests vitest : couleur unie, bicolore, clamp aux bords.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Helpers `pickMaskColor` + `buildMaskRect` + `buildEditableTextbox`

**Files:**
- Modify: `src/features/ai-design/renderNanoBananaCanvas.ts` (ajouter en haut, après imports)

- [ ] **Step 6.1: Importer `sampleAvgColorAroundBbox`**

Ajouter en haut de `renderNanoBananaCanvas.ts` :

```ts
import { sampleAvgColorAroundBbox } from './sampleColor'
import type { TextElement, ImageSlot } from './analyzeDesignForEdit'
```

(Vérifier qu'il n'y a pas déjà un import depuis `analyzeDesignForEdit` à enrichir au lieu d'en ajouter un nouveau.)

- [ ] **Step 6.2: Ajouter `pickMaskColor`**

Après les helpers existants (`computeLinearGradientCoords`, `clamp01`), ajouter :

```ts
/**
 * Détermine la couleur de masque sous une zone overlay :
 *  - M1 : couleur fournie par Claude Vision si backgroundIsUniform=true
 *  - M2 (fallback) : sample pixel client-side si Claude Vision a flagué
 *    backgroundIsUniform=false ou si backgroundColor est manquant
 */
export function pickMaskColor(
  zone: Pick<TextElement | ImageSlot, 'bbox' | 'backgroundColor' | 'backgroundIsUniform'>,
  decoded: HTMLImageElement | null
): string {
  if (zone.backgroundIsUniform && zone.backgroundColor) return zone.backgroundColor
  if (decoded) return sampleAvgColorAroundBbox(decoded, zone.bbox)
  return zone.backgroundColor || '#ffffff'
}
```

- [ ] **Step 6.3: Ajouter `buildMaskRect`**

```ts
/**
 * Construit un Rect Fabric servant de masque opaque sous une zone overlay.
 * Padding clamp à 4px max pour ne pas grignoter le design adjacent.
 */
export function buildMaskRect(
  color: string,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number
): Rect {
  const PAD = 4
  const rect = new Rect({
    left: xPx - PAD,
    top: yPx - PAD,
    width: wPx + PAD * 2,
    height: hPx + PAD * 2,
    fill: color,
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    originX: 'left',
    originY: 'top',
  })
  rect.data = { isMaskRect: true }
  return rect
}
```

- [ ] **Step 6.4: Ajouter `buildEditableTextbox`**

La formule fontSize est exactement celle utilisée par `addEditableTextOverlays` aujourd'hui (`((fontSizePct/100) * canvasHeight)`). On passe `canvasHeight` en argument :

```ts
/**
 * Construit un Textbox Fabric éditable pour overlay data. Style typographique
 * exactement aligné sur ce que Claude Vision a détecté dans le PNG NB2.
 */
export function buildEditableTextbox(
  t: TextElement,
  xPx: number,
  yPx: number,
  wPx: number,
  canvasHeight: number
): Textbox {
  const fontSize = Math.max(8, ((t.fontSizePct ?? 2) / 100) * canvasHeight)
  const tb = new Textbox(t.text, {
    left: xPx,
    top: yPx,
    width: Math.max(wPx, 40),
    fontSize,
    fontFamily: t.fontFamily?.trim() || 'Inter',
    fill: t.color || '#111111',
    fontWeight: t.bold ? 'bold' : 'normal',
    fontStyle: t.italic ? 'italic' : 'normal',
    linethrough: !!t.strikethrough,
    textAlign: t.align || 'left',
    originX: 'left',
    originY: 'top',
    selectable: true,
    editable: true,
    padding: 2,
  })
  tb.data = { id: t.id, role: t.role, editableText: true }
  return tb
}
```

- [ ] **Step 6.5: Vérifier la compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "renderNanoBanana" | head -10
```

Expected: zéro erreur dans `renderNanoBananaCanvas.ts` (mais erreurs encore dans useGenerateDesign si on lit des champs nouveaux).

- [ ] **Step 6.6: Pas de commit ici** — on continue avec resolveImageForSlot et renderNanoBananaWithOverlays, puis commit groupé.

---

## Task 7: Helper `resolveImageForSlot` (extraction de la logique URL Jina/Clearbit/crop NB2)

**Files:**
- Modify: `src/features/ai-design/renderNanoBananaCanvas.ts`

- [ ] **Step 7.1: Identifier la logique existante**

Dans `addEditableImageSlots` (ligne ~233-380), la résolution d'image suit une cascade :
1. URL produit scrapée (validée par `isLikelyProductImage`)
2. Crop NB2 (productPhoto fallback)
3. Clearbit / Google Favicon (logo)
4. Crop NB2 (logo fallback)
5. Placeholder rect

- [ ] **Step 7.2: Extraire en `resolveImageForSlot` réutilisable**

Ajouter à `renderNanoBananaCanvas.ts` :

```ts
/**
 * Résout l'image à charger pour un imageSlot, dans l'ordre :
 *  1. productPhoto : URL scrapée (validée) → crop NB2 → null
 *  2. logo : Clearbit/Google Favicon (via brandDomain ou description) → crop NB2 → null
 *
 * Retourne une FabricImage prête à placer, ou null si tout a échoué (le caller
 * pose alors un Rect placeholder).
 */
export async function resolveImageForSlot(
  slot: ImageSlot,
  productImageUrl: string | undefined,
  brandDomain: string | undefined,
  decoded: HTMLImageElement | null
): Promise<FabricImage | null> {
  // ─── productPhoto ────────────────────────────────────────────────────────
  if (slot.role === 'productPhoto') {
    const validProductUrl = productImageUrl && isLikelyProductImage(productImageUrl)
      ? productImageUrl
      : undefined
    if (validProductUrl) {
      try {
        const proxied = proxiedImageUrl(validProductUrl)
        const img = await FabricImage.fromURL(proxied, { crossOrigin: 'anonymous' })
        if (img && img.width && img.height) return img
      } catch (err) {
        console.warn(`[renderNB] productPhoto URL failed for ${slot.id}:`, err)
      }
    }
    if (decoded) {
      try {
        const cropped = cropFromDecoded(decoded, slot.bbox)
        const img = await FabricImage.fromURL(cropped, { crossOrigin: 'anonymous' })
        if (img && img.width && img.height) return img
      } catch (err) {
        console.warn(`[renderNB] productPhoto crop fallback failed for ${slot.id}:`, err)
      }
    }
    return null
  }

  // ─── logo ────────────────────────────────────────────────────────────────
  if (slot.role === 'logo') {
    const candidates = brandDomain
      ? resolveBrandLogoCandidates(brandDomain)
      : resolveBrandLogoCandidates(slot.description)
    for (const candidate of candidates) {
      try {
        const proxied = proxiedImageUrl(candidate)
        const logo = await FabricImage.fromURL(proxied, { crossOrigin: 'anonymous' })
        if (logo && logo.width && logo.height && logo.width >= 16 && logo.height >= 16) return logo
      } catch (err) {
        console.warn(`[renderNB] logo candidate failed for ${slot.id} (${candidate.slice(0, 60)})`, err)
      }
    }
    if (decoded) {
      try {
        const cropped = cropFromDecoded(decoded, slot.bbox)
        const logo = await FabricImage.fromURL(cropped, { crossOrigin: 'anonymous' })
        if (logo && logo.width && logo.height) return logo
      } catch (err) {
        console.warn(`[renderNB] logo crop fallback failed for ${slot.id}:`, err)
      }
    }
    return null
  }

  return null
}
```

- [ ] **Step 7.3: Vérifier que `decodeImage`, `cropFromDecoded`, `proxiedImageUrl`, `resolveBrandLogoCandidates`, `isLikelyProductImage` sont déjà accessibles dans le fichier**

Si import manquant, ajouter :
```ts
import { resolveBrandLogoCandidates } from './brandLogos'
import { isLikelyProductImage } from './scrapeProductForDesign'
```

(Probablement déjà présents puisque la logique existait dans le même fichier.)

- [ ] **Step 7.4: Pas de commit ici** — continue avec renderNanoBananaWithOverlays.

---

## Task 8: Fonction principale `renderNanoBananaWithOverlays`

**Files:**
- Modify: `src/features/ai-design/renderNanoBananaCanvas.ts`

- [ ] **Step 8.1: Ajouter la fonction principale**

À la suite des helpers, ajouter :

```ts
/**
 * Pipeline retail (β1) : place le PNG Nano Banana 2 plein canvas comme background
 * lockée, puis pour chaque zone data critique (text + image) :
 *   - pose un masque opaque (M1 backgroundColor → M2 sample pixel fallback)
 *   - pose l'overlay éditable par-dessus (Textbox / FabricImage)
 *
 * Si une zone n'a aucune image résoluble (productPhoto sans URL ni crop, etc.),
 * un Rect placeholder dashé est posé pour permettre le drag & drop ultérieur.
 */
export async function renderNanoBananaWithOverlays(
  canvas: Canvas,
  nanoBananaDataUri: string,
  analysis: { texts: TextElement[]; imageSlots: ImageSlot[] },
  canvasWidth: number,
  canvasHeight: number,
  productImageUrl?: string,
  brandDomain?: string
): Promise<void> {
  // 1. Background NB2 plein canvas, lockée
  const bg = await FabricImage.fromURL(nanoBananaDataUri, { crossOrigin: 'anonymous' })
  if (!bg || !bg.width || !bg.height) {
    throw new Error('Nano Banana background image failed to load')
  }
  bg.set({
    left: 0,
    top: 0,
    scaleX: canvasWidth / bg.width,
    scaleY: canvasHeight / bg.height,
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hoverCursor: 'default',
    originX: 'left',
    originY: 'top',
  })
  bg.data = { isNanoBananaBg: true }
  canvas.add(bg)

  // Place juste au-dessus du pageBg (sous tous les overlays et marques d'impression)
  const pageBg = canvas.getObjects().find((o) => o.data?.isPageBg)
  if (pageBg) {
    const idx = canvas.getObjects().indexOf(pageBg)
    canvas.moveObjectTo(bg, idx + 1)
  } else {
    canvas.sendObjectToBack(bg)
  }

  // 2. Pré-décode pour M2 sample pixel fallback
  const decoded = await decodeImage(nanoBananaDataUri).catch(() => null)

  // 3. Overlays texte
  for (const t of analysis.texts) {
    const { xPx, yPx, wPx, hPx } = bboxToPx(t.bbox, canvasWidth, canvasHeight)
    const maskColor = pickMaskColor(t, decoded)
    canvas.add(buildMaskRect(maskColor, xPx, yPx, wPx, hPx))
    canvas.add(buildEditableTextbox(t, xPx, yPx, wPx, canvasHeight))
  }

  // 4. Overlays image (logo + productPhoto)
  for (const s of analysis.imageSlots) {
    const { xPx, yPx, wPx, hPx } = bboxToPx(s.bbox, canvasWidth, canvasHeight)
    const maskColor = pickMaskColor(s, decoded)
    canvas.add(buildMaskRect(maskColor, xPx, yPx, wPx, hPx))

    const img = await resolveImageForSlot(s, productImageUrl, brandDomain, decoded)
    if (img) {
      canvas.add(placeFabricImage(img, s, xPx, yPx, wPx, hPx))
    } else {
      // Placeholder dashé — l'utilisateur peut drag&drop dedans
      const ph = new Rect({
        left: xPx,
        top: yPx,
        width: wPx,
        height: hPx,
        fill: 'rgba(99, 102, 241, 0.05)',
        stroke: 'rgba(99, 102, 241, 0.4)',
        strokeDashArray: [6, 4],
        strokeWidth: 1,
        originX: 'left',
        originY: 'top',
        selectable: true,
      })
      ph.data = { id: s.id, editableImageSlot: true, role: s.role, description: s.description }
      canvas.add(ph)
    }
  }
}
```

- [ ] **Step 8.2: Vérifier la compile**

```bash
npx tsc -b --noEmit 2>&1 | grep -E "renderNanoBanana|ai-design" | head -20
```

Expected: zéro erreur dans `renderNanoBananaCanvas.ts`. Erreurs restantes : `useGenerateDesign.ts` (à fixer Task 9).

- [ ] **Step 8.3: Pas de commit ici** — commit groupé après le routing dans Task 9.

---

## Task 9: Routing β1+β2 dans `useGenerateDesign`

**Files:**
- Modify: `src/features/ai-design/useGenerateDesign.ts:9-14, 244-356`

- [ ] **Step 9.1: Mettre à jour les imports**

Remplacer (lignes ~9-14) :
```ts
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
} from './renderNanoBananaCanvas'
```

par :
```ts
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
  renderNanoBananaWithOverlays,
} from './renderNanoBananaCanvas'
```

- [ ] **Step 9.2: Lire le bloc Phase 3 (reconstruction vectorielle, ligne ~332-363)**

```bash
sed -n '320,365p' src/features/ai-design/useGenerateDesign.ts
```

Le bloc actuel applique systématiquement `renderBackground` + `renderDecorativeShapes` + `addEditableTextOverlays` + `addEditableImageSlots`.

- [ ] **Step 9.3: Remplacer Phase 3 par un switch sur `analysis.mode`**

Localiser le bloc `try { ... } catch ` qui contient les renderBackground / renderDecorativeShapes / addEditableTextOverlays / addEditableImageSlots, et le remplacer par :

```ts
try {
  if (analysis.mode === 'retail') {
    // Pipeline β1 : NB2 background lockée + overlays data masqués
    if (!dataUri) {
      // Cas impossible normalement (retail implique NB2 OK), mais guard de sécurité
      failAt('rendering', 'Mode retail mais image NB2 absente')
      return
    }
    // Charge les fonts utilisées par les Textbox overlay AVANT le rendu
    const fontsReady = ensureGoogleFontsLoaded(analysis.texts.map((t) => t.fontFamily))
    await fontsReady
    await renderNanoBananaWithOverlays(
      canvas,
      dataUri,
      { texts: analysis.texts, imageSlots: analysis.imageSlots },
      canvasWidth,
      canvasHeight,
      productImageUrl,
      scrapedProductData?.brandDomain,
    )
  } else {
    // Pipeline β2 : reconstruction vectorielle complète (ancien path)
    if (!analysis.background || !analysis.decorativeShapes) {
      failAt('rendering', 'Mode creative mais background/decorativeShapes absents')
      return
    }
    const fontsReady = ensureGoogleFontsLoaded(analysis.texts.map((t) => t.fontFamily))
    renderBackground(canvas, analysis.background, canvasWidth, canvasHeight)
    renderDecorativeShapes(canvas, analysis.decorativeShapes, canvasWidth, canvasHeight)
    await fontsReady
    addEditableTextOverlays(canvas, analysis.texts, canvasWidth, canvasHeight)
    await addEditableImageSlots(
      canvas,
      analysis.imageSlots,
      canvasWidth,
      canvasHeight,
      dataUri,
      productImageUrl,
      scrapedProductData?.brandDomain,
    )
  }
  canvas.requestRenderAll()
  syncToStore(canvas)
  requestAnimationFrame(() => globalFitCanvas?.())
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  failAt('rendering', `Construction canvas échouée : ${msg}`)
  return
}
```

- [ ] **Step 9.4: S'assurer que `scrapedProductData?.brandDomain` est lu correctement**

Vérifier que `scrapedProductData` est dans le scope (déclarée plus haut dans la fonction `generate`). Aucune nouvelle variable à introduire.

- [ ] **Step 9.5: Adapter la branche fallback (NB2 KO + scrapedData OK)**

Lignes ~317-329 actuelles : si NB2 échoue, `composeDesignFromScrapedData` est appelée et l'analyse est utilisée. Comme `composeDesignFromScrapedData` retourne maintenant `mode: 'creative'`, le switch ci-dessus la routera automatiquement vers l'ancien pipeline. Pas de changement supplémentaire requis. Confirmer en lisant le bloc :

```bash
sed -n '317,330p' src/features/ai-design/useGenerateDesign.ts
```

- [ ] **Step 9.6: Forcer `mode: 'retail'` si `scrapedProductData` est présent**

Per spec : si scrapedProductData != null, on force mode retail (cas product/retail certain). Insérer juste après la branche d'override de textes (ligne ~316, dans le bloc `if (scrapedProductData) { ... analysis.texts = overrideTextsWithScrapedData(...) ... }`) :

```ts
if (scrapedProductData) {
  // ... override existant ...

  // Si scrape produit OK, on est explicitement en mode retail (override sécurité
  // au cas où Claude Vision aurait choisi 'creative' à tort sur un flyer produit).
  if (analysis.mode !== 'retail') {
    console.log('[Claude Design] Forcing mode=retail because scrapedProductData is present')
    analysis = { ...analysis, mode: 'retail' }
  }
}
```

- [ ] **Step 9.7: Vérifier la compile finale**

```bash
npx tsc -b --noEmit 2>&1 | head -30
```

Expected: zéro erreur sur les fichiers ai-design.

- [ ] **Step 9.8: Lancer le linter pour rattraper les imports inutilisés**

```bash
npm run lint -- src/features/ai-design/ 2>&1 | head -30
```

Si imports inutilisés : nettoyer.

- [ ] **Step 9.9: Lancer la suite de tests**

```bash
npm run test:run -- src/features/ai-design/ 2>&1 | tail -20
```

Expected: tests `sampleColor.test.ts` passent. Aucune régression sur le reste.

- [ ] **Step 9.10: Commit final du pipeline**

```bash
git add src/features/ai-design/renderNanoBananaCanvas.ts src/features/ai-design/useGenerateDesign.ts
git commit -m "$(cat <<'EOF'
feat(ai-design): NB2 as primary render with editable data overlays (β1)

- Nouveau pipeline retail : Nano Banana 2 PNG en background lockée plein
  canvas + overlays Fabric (Textbox + FabricImage) sur les zones data
  critiques (prix, titre, features, photo, logo). Préserve la richesse
  créative de NB2 — fond photo, gradients, illustrations.
- Pipeline creative conservé pour designs non-retail et fallback
  compose-direct (mode='creative' explicite).
- Routing β1+β2 dans useGenerateDesign : auto-switch selon analysis.mode.
- Force mode='retail' si scrapedProductData présent (sécurité).
- Masquage des zones overlayées : M1 backgroundColor de Claude Vision,
  M2 sample pixel client-side en fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Validation E2E manuelle

**Files:** Aucun changement de code — vérification visuelle dans le browser.

- [ ] **Step 10.1: Démarrer le dev server**

```bash
npm run dev
```

Attendre que Vite affiche "Local: http://localhost:..." et que server.mjs ait bind. Note : le dev server doit pouvoir tourner sans erreur. Si crash → corriger le code AVANT de continuer.

- [ ] **Step 10.2: Test 1 — URL Brico Dépôt (référence)**

Ouvrir l'app, ouvrir le modal Claude Design, coller l'URL :
```
https://www.bricodepot.fr/...robot-tondeuse-v3plus-1000  (URL exacte fournie par l'utilisateur)
```

Lancer la génération. Attendre la fin.

**Critères de succès** :
- Le PNG NB2 est visible plein canvas (fond photo jardin, photo robot HD, badges colorés)
- Le titre n'est pas tronqué (pas de "Robot tondeus" coupé à droite)
- Le prix "699€00" est éditable au double-clic
- Le logo Brico Dépôt est lisible (rouge/blanc, au bon endroit)
- Pas de halo gris/blanc visible autour des overlays texte

Si l'un de ces critères échoue → diagnostic via la console browser (`[Claude Design]` logs) et itérer. Documenter le bug dans un commentaire de la PR.

- [ ] **Step 10.3: Test 2 — URL Decathlon (générique)**

Même procédure, URL produit Decathlon. Vérifier que le pipeline retail s'active et que les overlays sont au bon endroit.

- [ ] **Step 10.4: Test 3 — Fallback compose-direct**

Forcer NB2 à échouer : ouvrir `src/features/ai-design/generateNanoBananaRef.ts`, ajouter temporairement `throw new Error('test fallback')` au début de la fonction. Recharger l'app et regénérer.

**Critère de succès** : design fallback (vectoriel) s'affiche, est 100% éditable, le toast warning "Image IA indisponible — design composé depuis les données produit" s'affiche.

Retirer le `throw` et confirmer.

- [ ] **Step 10.5: Test 4 — Poster non-retail (mode creative)**

Lancer le modal sans URL site, prompt libre type "affiche événement vernissage galerie d'art moderne". Vérifier que :
- NB2 génère une image
- Claude Vision retourne `mode: 'creative'`
- L'ancien pipeline vectoriel s'active (le canvas est full-éditable, on peut sélectionner les formes décoratives)

- [ ] **Step 10.6: Vérifier la perf**

Console DevTools : ouvrir Performance, lancer une génération retail. Mesurer wall-time entre clic "Générer" et apparition du canvas final.

**Cible** : < 30s pour Nano Banana 2 + Claude Vision allégée. Si > 45s, profiler les appels.

- [ ] **Step 10.7: Commit final si ajustements**

S'il y a eu des micro-corrections pendant les tests E2E, commit-les avec un message clair :

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(ai-design): NB2 overlay pipeline post-E2E adjustments

Corrections issues du test visuel sur URL Brico Dépôt + Decathlon :
[liste des fixes effectivement faits]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (déjà passée au moment de la rédaction)

- ✅ Spec coverage : chaque section de la spec a au moins une tâche correspondante (types → Task 1, prompt → Task 2, compose-direct → Task 3, rename → Task 4, helpers → Tasks 5-7, renderer → Task 8, routing → Task 9, validation → Task 10).
- ✅ Pas de placeholder "TBD/TODO" dans les steps.
- ✅ Cohérence des noms de fonctions : `renderNanoBananaWithOverlays`, `pickMaskColor`, `buildMaskRect`, `buildEditableTextbox`, `resolveImageForSlot`, `sampleAvgColorAroundBbox` — utilisés de la même façon partout.
- ✅ Cohérence des types : `DesignMode`, `TextRole`, `TextElement.role`, `backgroundColor`/`backgroundIsUniform` ont les mêmes signatures dans toutes les tâches.
- ✅ Task 6 step 6.4 : signature `buildEditableTextbox(t, xPx, yPx, wPx, canvasHeight)` cohérente avec l'appel dans `renderNanoBananaWithOverlays` (Task 8) qui passe `canvasHeight` en 5e argument.
