# Briefs IA — Lot 5 : Étape 5 — Export PPTX final — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'étape 5 (et finale) de l'éditeur de brief : assembler un fichier PowerPoint commercial à partir de `brief.deck.slides`, `brief.cart`, et des images générées au Lot 4 (récupérées depuis Firebase Storage). Le PPTX applique le branding client (couleurs, logo). L'utilisateur clique « Télécharger le PPTX » → le fichier descend localement → le brief passe en `status='completed'`.

**Architecture:**
- Librairie : `pptxgenjs` (v4, déjà installée).
- Code organisé en couches :
  - `branding.ts` — extrait `{ companyName, logoUrl, primaryColor, secondaryColor }` depuis `brief.client.values`, avec fallbacks et sanitization couleur. **Pur, TDD.**
  - `slideBuilders.ts` — une fonction `buildXxxSlide(pres, slide, ctx)` par type (cover, context, product_grid, product_focus, budget, cta). Chaque builder ajoute UNE slide au `pres` reçu en paramètre. **Pas de tests** (interaction PptxGenJS).
  - `imageFetcher.ts` — `fetchImageAsBase64(url)` télécharge depuis Storage et retourne `data:image/...;base64,...` (PptxGenJS accepte data URL). Pas de tests (réseau).
  - `buildBriefPptx.ts` — orchestrateur : construit `ctx`, télécharge en parallèle toutes les images, dispatche chaque slide vers son builder, retourne `Blob` via `pres.write({ outputType: 'blob' })`.
  - `useExportBriefPptx.ts` — hook React Query mutation : appelle `buildBriefPptx` → déclenche download navigateur → met à jour `brief.status='completed'`.
- UI : `Step5Export` affiche un récapitulatif (nb slides, nb images), un bouton « Télécharger le PPTX » et un message de succès. Branché dans `BriefEditorModal` quand `currentStep === 5`.
- **Pas d'upload du PPTX** dans Storage par défaut (download direct). Si l'utilisateur veut conserver une copie côté serveur plus tard, on l'ajoutera en option.

**Tech Stack:** React 18, React Query, PptxGenJS 4, Firebase Storage (lecture uniquement), sonner.

**Spec de référence :** `docs/superpowers/specs/2026-04-07-taxonomy-briefs-design.md` sections 6.5 (UI étape 5), 5 (data brief.deck/pptxUrl)
**Dépend de :** Lots 1-4 terminés (deck généré, images dans `briefs/{id}/images`, panier figé).

---

## File Structure

**Création (logique pure / TDD) :**
- `src/features/briefs/pptx/branding.ts`
- `src/features/briefs/pptx/branding.test.ts`

**Création (logique impure, pas de tests) :**
- `src/features/briefs/pptx/imageFetcher.ts`
- `src/features/briefs/pptx/slideBuilders.ts`
- `src/features/briefs/pptx/buildBriefPptx.ts`

**Création (hook + UI) :**
- `src/features/briefs/pptx/useExportBriefPptx.ts`
- `src/components/briefs/editor/Step5Export.tsx`

**Modification :**
- `src/components/briefs/editor/BriefEditorModal.tsx` — brancher `Step5Export` quand `currentStep === 5`

**Aucune modification des types ni des hooks Firestore Lot 1.**

---

## Conventions pour ce lot

- **TDD** uniquement sur `branding.ts` (extraction et sanitization). Cible : ~7 tests ajoutés.
- **Composants ≤ 150 lignes**.
- **Dark mode** (mêmes tokens).
- **Pas de `any`** sur les API publiques. PptxGenJS n'a pas d'export type pour l'instance — utiliser `import pptxgen from 'pptxgenjs'` puis `type Pres = InstanceType<typeof pptxgen>`.
- **Slides 16:9** (16 × 9 pouces, ratio par défaut PptxGenJS = `LAYOUT_WIDE`).
- **Couleurs PPTX** : sans `#`. Fallback `6366F1` (indigo) si absent.
- **Texte** : Helvetica par défaut, tailles : titre 32pt, sous-titre 18pt, body 14pt.
- **git hygiene** : stager uniquement les fichiers explicites de chaque task, jamais `git add -A`.

---

## Task 1 : `branding.ts` (TDD)

**Files:**
- Create: `src/features/briefs/pptx/branding.ts`
- Create: `src/features/briefs/pptx/branding.test.ts`

But : exposer `extractBranding(brief)` qui retourne `{ companyName, logoUrl, primaryColor, secondaryColor }` avec couleurs sanitisées (sans `#`, valides hex 6 chars, fallback indigo).

- [ ] **Step 1: Tests**

Create `src/features/briefs/pptx/branding.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { extractBranding, sanitizeHex } from './branding'
import type { Brief } from '@/features/briefs/types'

const briefBase = {
  id: 'b',
  taxonomyId: 't',
  ownerId: 'u',
  clientName: 'Acme',
  status: 'deck_ready',
  currentStep: 5,
  client: {
    formTemplateSnapshot: [],
    values: {},
  },
} as unknown as Brief

describe('sanitizeHex', () => {
  it('strips a leading hash', () => {
    expect(sanitizeHex('#FF6600')).toBe('FF6600')
  })
  it('uppercases the result', () => {
    expect(sanitizeHex('#ff6600')).toBe('FF6600')
  })
  it('expands a 3-digit shorthand', () => {
    expect(sanitizeHex('#f60')).toBe('FF6600')
  })
  it('returns the fallback for invalid input', () => {
    expect(sanitizeHex('not a color', '6366F1')).toBe('6366F1')
    expect(sanitizeHex(undefined, '6366F1')).toBe('6366F1')
    expect(sanitizeHex('', '6366F1')).toBe('6366F1')
  })
})

describe('extractBranding', () => {
  it('reads values from brief.client.values', () => {
    const brief = {
      ...briefBase,
      client: {
        formTemplateSnapshot: [],
        values: {
          companyName: 'Acme Corp',
          logoUrl: 'https://x/logo.png',
          primaryColor: '#FF6600',
          secondaryColor: '#003366',
        },
      },
    } as Brief
    expect(extractBranding(brief)).toEqual({
      companyName: 'Acme Corp',
      logoUrl: 'https://x/logo.png',
      primaryColor: 'FF6600',
      secondaryColor: '003366',
    })
  })

  it('falls back to brief.clientName when companyName is missing', () => {
    expect(extractBranding(briefBase).companyName).toBe('Acme')
  })

  it('falls back to indigo when colors are missing', () => {
    const b = extractBranding(briefBase)
    expect(b.primaryColor).toBe('6366F1')
    expect(b.secondaryColor).toBe('4F46E5')
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- branding`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/pptx/branding.ts`:
```ts
import type { Brief } from '@/features/briefs/types'

const HEX6 = /^[0-9A-F]{6}$/

export interface Branding {
  companyName: string
  logoUrl?: string
  primaryColor: string   // 6 hex chars, no #
  secondaryColor: string
}

const FALLBACK_PRIMARY = '6366F1'
const FALLBACK_SECONDARY = '4F46E5'

export function sanitizeHex(input: string | undefined, fallback = FALLBACK_PRIMARY): string {
  if (!input) return fallback
  let v = input.trim().replace(/^#/, '').toUpperCase()
  if (v.length === 3) {
    v = v.split('').map((c) => c + c).join('')
  }
  return HEX6.test(v) ? v : fallback
}

function readString(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function extractBranding(brief: Brief): Branding {
  const v = brief.client.values
  return {
    companyName: readString(v, 'companyName') ?? brief.clientName ?? 'Client',
    logoUrl: readString(v, 'logoUrl'),
    primaryColor: sanitizeHex(readString(v, 'primaryColor'), FALLBACK_PRIMARY),
    secondaryColor: sanitizeHex(readString(v, 'secondaryColor'), FALLBACK_SECONDARY),
  }
}
```

- [ ] **Step 4: Run, expect pass (7)**

Run: `npm run test:run -- branding`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/pptx/branding.ts src/features/briefs/pptx/branding.test.ts
git commit -m "feat(briefs): add PPTX branding extractor"
```

---

## Task 2 : `imageFetcher.ts`

**Files:**
- Create: `src/features/briefs/pptx/imageFetcher.ts`

But : télécharger une image depuis une URL Firebase Storage et la retourner en data URL base64 (format que PptxGenJS accepte directement dans `addImage({ data })`).

- [ ] **Step 1: Créer**

Create `src/features/briefs/pptx/imageFetcher.ts`:
```ts
/**
 * Télécharge une image depuis une URL et retourne une data URL base64
 * (format accepté par PptxGenJS via `addImage({ data })`).
 *
 * Nécessite que le bucket Firebase Storage autorise CORS sur l'origin de l'app.
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Téléchargement image ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('FileReader: résultat inattendu'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader: erreur'))
    reader.readAsDataURL(blob)
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/pptx/imageFetcher.ts
git commit -m "feat(briefs): add image fetcher (URL -> base64 data URL)"
```

---

## Task 3 : `slideBuilders.ts`

**Files:**
- Create: `src/features/briefs/pptx/slideBuilders.ts`

But : 6 fonctions, une par type de `SlideSpec`, qui ajoutent UNE slide formatée au `pres` PptxGenJS reçu. Chaque builder reçoit un `ctx` partagé (branding, panier, map d'images base64).

- [ ] **Step 1: Créer**

Create `src/features/briefs/pptx/slideBuilders.ts`:
```ts
import type pptxgen from 'pptxgenjs'
import type { SlideSpec, CartItem } from '@/features/briefs/types'
import type { Branding } from './branding'
import { computeSubtotal, computeTotal } from '@/features/briefs/cart/cartMath'

type Pres = InstanceType<typeof pptxgen>

export interface SlideContext {
  branding: Branding
  cart: CartItem[]
  discount: { type: 'percent' | 'amount'; value: number } | undefined
  /** id (`hero` ou `product_${sku}`) → data URL base64 */
  images: Map<string, string>
}

const FONT = 'Helvetica'
const TITLE_OPTS = { fontFace: FONT, bold: true, fontSize: 32 }
const BODY_OPTS = { fontFace: FONT, fontSize: 14 }
const SUB_OPTS = { fontFace: FONT, fontSize: 18 }

function addBrandHeader(slide: pptxgen.Slide, ctx: SlideContext) {
  // Bandeau couleur primaire en haut
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.35,
    fill: { color: ctx.branding.primaryColor },
    line: { color: ctx.branding.primaryColor },
  })
  if (ctx.branding.logoUrl && ctx.images.has('logo')) {
    slide.addImage({ data: ctx.images.get('logo'), x: 0.3, y: 0.05, w: 0.5, h: 0.25 })
  }
  slide.addText(ctx.branding.companyName, {
    x: 0.9,
    y: 0.05,
    w: 8,
    h: 0.25,
    fontFace: FONT,
    fontSize: 10,
    color: 'FFFFFF',
  })
}

export function buildCoverSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'cover' }>, ctx: SlideContext) {
  const slide = pres.addSlide()
  slide.background = { color: '0F0F0F' }
  const hero = ctx.images.get('hero')
  if (hero) {
    slide.addImage({ data: hero, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover', w: 13.33, h: 7.5 } })
    // overlay sombre
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '000000', transparency: 40 }, line: { color: '000000' } })
  }
  slide.addText(spec.title, { x: 0.6, y: 4.5, w: 12, h: 1.4, ...TITLE_OPTS, fontSize: 44, color: 'FFFFFF' })
  slide.addText(spec.subtitle, { x: 0.6, y: 5.9, w: 12, h: 0.6, ...SUB_OPTS, color: 'FFFFFFCC' })
  slide.addShape('rect', {
    x: 0.6,
    y: 6.7,
    w: 1.5,
    h: 0.08,
    fill: { color: ctx.branding.primaryColor },
    line: { color: ctx.branding.primaryColor },
  })
}

export function buildContextSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'context' }>, ctx: SlideContext) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  slide.addText(spec.title, { x: 0.6, y: 0.7, w: 12, h: 0.8, ...TITLE_OPTS, color: '111111' })
  slide.addText(
    spec.bullets.map((b) => ({ text: b, options: { bullet: true, ...BODY_OPTS, color: '333333' } })),
    { x: 0.8, y: 1.8, w: 11.5, h: 5 },
  )
}

export function buildProductGridSlide(
  pres: Pres,
  spec: Extract<SlideSpec, { type: 'product_grid' }>,
  ctx: SlideContext,
) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  slide.addText(spec.title, { x: 0.6, y: 0.7, w: 12, h: 0.7, ...TITLE_OPTS, color: '111111' })

  const layouts: Record<typeof spec.layout, { cols: number; rows: number }> = {
    '2x2': { cols: 2, rows: 2 },
    '3x2': { cols: 3, rows: 2 },
    '1x3': { cols: 3, rows: 1 },
  }
  const { cols, rows } = layouts[spec.layout]
  const cellW = 12 / cols
  const cellH = (rows === 1 ? 4.5 : 5) / rows

  spec.productSkus.slice(0, cols * rows).forEach((sku, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = 0.6 + col * cellW + 0.1
    const y = 1.7 + row * cellH + 0.1
    const w = cellW - 0.2
    const h = cellH - 0.7

    const img = ctx.images.get(`product_${sku}`)
    if (img) {
      slide.addImage({ data: img, x, y, w, h, sizing: { type: 'cover', w, h } })
    } else {
      slide.addShape('rect', { x, y, w, h, fill: { color: 'EEEEEE' }, line: { color: 'DDDDDD' } })
    }
    const item = ctx.cart.find((c) => c.sku === sku)
    slide.addText(item?.name ?? sku, {
      x,
      y: y + h + 0.05,
      w,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      color: '111111',
      align: 'center',
    })
  })
}

export function buildProductFocusSlide(
  pres: Pres,
  spec: Extract<SlideSpec, { type: 'product_focus' }>,
  ctx: SlideContext,
) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  const img = ctx.images.get(`product_${spec.productSku}`)
  if (img) {
    slide.addImage({ data: img, x: 0.6, y: 1.0, w: 6, h: 6, sizing: { type: 'cover', w: 6, h: 6 } })
  } else {
    slide.addShape('rect', { x: 0.6, y: 1.0, w: 6, h: 6, fill: { color: 'EEEEEE' }, line: { color: 'DDDDDD' } })
  }
  slide.addText(spec.title, { x: 7, y: 1.0, w: 6, h: 0.8, ...TITLE_OPTS, fontSize: 28, color: '111111' })
  slide.addText(
    spec.keyPoints.map((p) => ({ text: p, options: { bullet: true, ...BODY_OPTS, color: '333333' } })),
    { x: 7, y: 2.0, w: 6, h: 5 },
  )
}

export function buildBudgetSlide(
  pres: Pres,
  spec: Extract<SlideSpec, { type: 'budget' }>,
  ctx: SlideContext,
) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  slide.addText(spec.title, { x: 0.6, y: 0.7, w: 12, h: 0.8, ...TITLE_OPTS, color: '111111' })

  if (spec.showItemized && ctx.cart.length > 0) {
    const rows: pptxgen.TableRow[] = [
      [
        { text: 'SKU', options: { bold: true, fill: { color: ctx.branding.primaryColor }, color: 'FFFFFF' } },
        { text: 'Produit', options: { bold: true, fill: { color: ctx.branding.primaryColor }, color: 'FFFFFF' } },
        { text: 'Qté', options: { bold: true, fill: { color: ctx.branding.primaryColor }, color: 'FFFFFF' } },
        { text: 'PU', options: { bold: true, fill: { color: ctx.branding.primaryColor }, color: 'FFFFFF' } },
        { text: 'Total', options: { bold: true, fill: { color: ctx.branding.primaryColor }, color: 'FFFFFF' } },
      ],
      ...ctx.cart.map((it) => {
        const price = it.unitPriceOverride ?? it.unitPrice ?? 0
        return [
          { text: it.sku },
          { text: it.name },
          { text: String(it.quantity) },
          { text: `${price.toFixed(2)} €` },
          { text: `${(price * it.quantity).toFixed(2)} €` },
        ]
      }),
    ]
    slide.addTable(rows, {
      x: 0.6,
      y: 1.7,
      w: 12,
      fontFace: FONT,
      fontSize: 11,
      colW: [1.6, 5, 1, 2, 2.4],
      border: { type: 'solid', pt: 0.5, color: 'DDDDDD' },
    })
  }

  if (spec.showTotal) {
    const subtotal = computeSubtotal(ctx.cart)
    const total = computeTotal(ctx.cart, ctx.discount)
    slide.addText(
      [
        { text: `Sous-total : ${subtotal.toFixed(2)} €\n`, options: { fontFace: FONT, fontSize: 14, color: '333333' } },
        ctx.discount
          ? {
              text: `Remise : ${ctx.discount.value}${ctx.discount.type === 'percent' ? '%' : ' €'}\n`,
              options: { fontFace: FONT, fontSize: 14, color: '333333' },
            }
          : { text: '', options: {} },
        {
          text: `Total estimé : ${total.toFixed(2)} €`,
          options: { fontFace: FONT, fontSize: 22, bold: true, color: ctx.branding.primaryColor },
        },
      ],
      { x: 0.6, y: 6.0, w: 12, h: 1.3 },
    )
  }
}

export function buildCtaSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'cta' }>, ctx: SlideContext) {
  const slide = pres.addSlide()
  slide.background = { color: ctx.branding.primaryColor }
  slide.addText(spec.title, { x: 0.6, y: 2.5, w: 12, h: 1.2, ...TITLE_OPTS, fontSize: 40, color: 'FFFFFF', align: 'center' })
  slide.addText(spec.message, { x: 1, y: 4.0, w: 11, h: 1, ...SUB_OPTS, color: 'FFFFFFE6', align: 'center' })
  if (spec.contactEmail) {
    slide.addText(spec.contactEmail, { x: 1, y: 5.5, w: 11, h: 0.5, fontFace: FONT, fontSize: 16, color: 'FFFFFF', align: 'center' })
  }
}

/**
 * Dispatch d'une slide spec vers son builder.
 */
export function buildSlide(pres: Pres, spec: SlideSpec, ctx: SlideContext): void {
  switch (spec.type) {
    case 'cover':
      return buildCoverSlide(pres, spec, ctx)
    case 'context':
      return buildContextSlide(pres, spec, ctx)
    case 'product_grid':
      return buildProductGridSlide(pres, spec, ctx)
    case 'product_focus':
      return buildProductFocusSlide(pres, spec, ctx)
    case 'budget':
      return buildBudgetSlide(pres, spec, ctx)
    case 'cta':
      return buildCtaSlide(pres, spec, ctx)
  }
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: baseline 24, pas d'erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/pptx/slideBuilders.ts
git commit -m "feat(briefs): add PPTX slide builders for 6 slide types"
```

---

## Task 4 : `buildBriefPptx.ts` (orchestrateur)

**Files:**
- Create: `src/features/briefs/pptx/buildBriefPptx.ts`

- [ ] **Step 1: Créer**

Create `src/features/briefs/pptx/buildBriefPptx.ts`:
```ts
import pptxgen from 'pptxgenjs'
import type { Brief, BriefImage } from '@/features/briefs/types'
import { extractBranding } from './branding'
import { fetchImageAsBase64 } from './imageFetcher'
import { buildSlide, type SlideContext } from './slideBuilders'

interface BuildOpts {
  brief: Brief
  images: BriefImage[]
}

/**
 * Construit le PPTX commercial à partir du deck généré et des images du brief.
 * Retourne un Blob prêt à être téléchargé.
 */
export async function buildBriefPptx({ brief, images }: BuildOpts): Promise<Blob> {
  const slides = brief.deck?.slides ?? []
  if (slides.length === 0) {
    throw new Error('Le deck est vide. Génère la structure du deck à l\'étape 4.')
  }

  const branding = extractBranding(brief)

  // Pré-télécharge toutes les images du brief en parallèle (hero + produits + logo)
  const fetchTargets: { key: string; url: string }[] = images.map((img) => ({ key: img.id, url: img.url }))
  if (branding.logoUrl) fetchTargets.push({ key: 'logo', url: branding.logoUrl })

  const imageMap = new Map<string, string>()
  await Promise.all(
    fetchTargets.map(async ({ key, url }) => {
      try {
        const dataUrl = await fetchImageAsBase64(url)
        imageMap.set(key, dataUrl)
      } catch (err) {
        // On continue sans cette image (placeholder dans le slide builder)
        console.warn(`Image ${key} non téléchargée :`, err)
      }
    }),
  )

  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.33 x 7.5
  pres.author = branding.companyName
  pres.company = branding.companyName
  pres.title = `Proposition commerciale — ${branding.companyName}`

  const ctx: SlideContext = {
    branding,
    cart: brief.cart?.items ?? [],
    discount: brief.cart?.discount,
    images: imageMap,
  }

  for (const spec of slides) {
    buildSlide(pres, spec, ctx)
  }

  const blob = (await pres.write({ outputType: 'blob' })) as Blob
  return blob
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/pptx/buildBriefPptx.ts
git commit -m "feat(briefs): add PPTX builder orchestrator"
```

---

## Task 5 : Hook `useExportBriefPptx`

**Files:**
- Create: `src/features/briefs/pptx/useExportBriefPptx.ts`

- [ ] **Step 1: Créer**

Create `src/features/briefs/pptx/useExportBriefPptx.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { buildBriefPptx } from './buildBriefPptx'
import type { Brief, BriefImage } from '@/features/briefs/types'

interface Args {
  brief: Brief
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60)
}

/**
 * Construit le PPTX du brief, déclenche le téléchargement navigateur,
 * et marque le brief comme `completed`.
 */
export function useExportBriefPptx() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      // Récupère les images du brief depuis la sous-collection
      const snap = await getDocs(collection(db, 'briefs', brief.id, 'images'))
      const images: BriefImage[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BriefImage))

      const blob = await buildBriefPptx({ brief, images })
      const filename = `${safeFilename(brief.clientName || 'brief')}-${brief.id.slice(0, 6)}.pptx`
      triggerDownload(blob, filename)

      await updateDoc(doc(db, 'briefs', brief.id), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      })

      return { filename, slideCount: brief.deck?.slides.length ?? 0 }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/pptx/useExportBriefPptx.ts
git commit -m "feat(briefs): add useExportBriefPptx mutation"
```

---

## Task 6 : `Step5Export`

**Files:**
- Create: `src/components/briefs/editor/Step5Export.tsx`

- [ ] **Step 1: Créer**

Create `src/components/briefs/editor/Step5Export.tsx`:
```tsx
import { Download, CheckCircle2, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { useExportBriefPptx } from '@/features/briefs/pptx/useExportBriefPptx'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
}

export function Step5Export({ brief }: Props) {
  const exportPptx = useExportBriefPptx()
  const { data: images = [] } = useBriefImages(brief.id)
  const slideCount = brief.deck?.slides.length ?? 0
  const completed = brief.status === 'completed'

  const handleExport = async () => {
    try {
      const r = await exportPptx.mutateAsync({ brief })
      toast.success(`PPTX généré : ${r.filename}`)
    } catch (err) {
      toast.error((err as Error).message || 'Échec de l\'export')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-[14px] font-semibold text-white/80 mb-1">Export PowerPoint</h2>
          <p className="text-[12px] text-white/40 mb-6">
            Le fichier sera téléchargé directement dans votre navigateur.
          </p>

          <div className="bg-[#141414] border border-white/[0.06] rounded-md p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Presentation className="w-5 h-5 text-indigo-400" />
              <div className="flex-1">
                <p className="text-[13px] text-white/90 font-medium">{brief.clientName || 'Brief'}</p>
                <p className="text-[11px] text-white/40">
                  {slideCount} slide{slideCount > 1 ? 's' : ''} • {images.length} image{images.length > 1 ? 's' : ''}
                </p>
              </div>
              {completed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>

            <button
              onClick={handleExport}
              disabled={exportPptx.isPending || slideCount === 0}
              className="flex items-center justify-center gap-2 text-[13px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2.5 rounded-md disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exportPptx.isPending ? 'Génération…' : 'Télécharger le PPTX'}
            </button>

            {slideCount === 0 && (
              <p className="text-[11px] text-amber-400/80 text-center">
                Aucune slide générée. Retournez à l'étape 4 pour générer le deck.
              </p>
            )}

            {completed && (
              <p className="text-[11px] text-emerald-400/80 text-center">
                Brief marqué comme terminé. Vous pouvez régénérer le PPTX à tout moment.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/Step5Export.tsx
git commit -m "feat(briefs): add Step5Export with PPTX download"
```

---

## Task 7 : Brancher `Step5Export` dans `BriefEditorModal`

**Files:**
- Modify: `src/components/briefs/editor/BriefEditorModal.tsx`

- [ ] **Step 1: Modifier**

Edit `src/components/briefs/editor/BriefEditorModal.tsx` :

1. Ajouter l'import :
```ts
import { Step5Export } from './Step5Export'
```

2. Remplacer le bloc qui rend `currentStep >= 5` par :
```tsx
{brief && brief.currentStep === 5 && (
  <Step5Export brief={brief} />
)}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: baseline 24, pas d'erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/BriefEditorModal.tsx
git commit -m "feat(briefs): wire Step5Export into BriefEditorModal"
```

---

## Task 8 : Vérification globale

**Files:** aucune modification.

- [ ] **Step 1: Suite de tests**

Run: `npm run test:run`
Expected: ~72 tests passants (65 hérités + 7 branding). 0 failed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: 24 erreurs baseline, 0 nouvelle.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: même état que les lots précédents (échec sur les 24 erreurs pré-existantes, pas de régression introduite par le Lot 5).

---

## Récapitulatif

À l'issue du Lot 5 :
- Extracteur de branding (TDD, 7 tests) : couleurs sanitisées, fallbacks
- Téléchargeur d'image URL → data URL base64 (compatible PptxGenJS)
- 6 builders de slides PptxGenJS (cover, context, product_grid, product_focus, budget, cta) avec branding appliqué
- Orchestrateur `buildBriefPptx` qui pré-télécharge toutes les images en parallèle puis dispatche
- Hook `useExportBriefPptx` qui construit + déclenche le download + marque le brief comme `completed`
- Composant `Step5Export` (récap, bouton télécharger, état complété)
- Branché dans `BriefEditorModal` (étape 5)
- ~72 tests unitaires passants (65 hérités + 7 ajoutés)

**Module Briefs IA livré bout-en-bout** :
1. Configurer le formulaire client par taxonomie (Lot 2)
2. Créer un brief, remplir le formulaire client (Lot 3)
3. Générer les questions dynamiques IA et y répondre (Lot 3)
4. Générer le panier produit IA, l'éditer, exporter en CSV (Lot 3)
5. Générer la structure du deck commercial IA (Lot 4)
6. Générer les visuels Nano Banana et les régénérer individuellement (Lot 4)
7. Télécharger le PPTX final formaté avec le branding du client (Lot 5)

**Hors scope (post-MVP) :**
- Intégration Magento (le `MockCatalogProvider` reste en place — basculer via `getProductCatalog()`)
- Upload réel du logo client vers Firebase Storage (input URL pour l'instant)
- Édition manuelle des slides (régénération uniquement)
- Conservation côté serveur du PPTX (download direct)
- Variantes d'images (1 slot par rôle, écrasement)
- Widget Dashboard "briefs récents" (lecture seule)
- Tests UI (faible ROI, pas de RTL installé)

**Suites possibles :**
- **Magento** : remplacer `MockCatalogProvider` par une implémentation appelant l'API REST Magento, filtrée par `selectedNodeIds` → `magentoCategoryIds` (déjà prévu côté types).
- **Édition slides** : ajouter une interface de réordonnancement / édition de chaque `SlideSpec` (similaire au `FormBuilderModal` du Lot 2).
- **Historique** : conserver les versions PPTX dans `briefs/{id}/exports` avec timestamp.
- **Multi-utilisateurs** : passer `ownerId` à un système de rôles/équipes.
- **Configuration des règles Storage** : ajouter un fichier `storage.rules` versionné qui restreint l'accès aux briefs du owner uniquement.
