# Disposition libre de la fiche (Catalogue studio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au concepteur de placer/redimensionner en drag & drop live tous les objets de la fiche du catalogue, la disposition étant stockée en % et appliquée dynamiquement à toutes les fiches.

**Architecture :** Extension du style cosmétique existant (`CatalogCardStyle`) avec un toggle `freeLayout` et une carte de positions `layout` en % ; `ProductCell` gagne une branche de rendu « libre » (objets en `position:absolute` %) à côté du flux actuel (inchangé) ; un overlay de drag/resist dans l'aperçu de « Style des fiches » édite ces %. Persisté par le `cardStyle` (doc + modèles + IA).

**Tech Stack :** React 18, TypeScript strict, Vitest. Vérif types via `npx tsc -b` (project references).

## Global Constraints

- TypeScript strict, pas d'`any` ; vérif **`npx tsc -b`** (jamais `tsc --noEmit`).
- Tests `npm run test:run` ; code mort `npx knip` (baseline exit 0).
- Théming par tokens ; blanc véritable sur fond coloré = `text-[#fff]`. Accent `#6366f1`/indigo-600.
- Positions/tailles **toujours en % (0–100)**, jamais en pixels — c'est l'exigence fondamentale (dynamique/fluide).
- Le flux actuel (`freeLayout:false`) doit rester **strictement inchangé** (zéro régression).
- Ne pas modifier `src/components/ui/**`.
- Les font-size de cellule gardent `* var(--cat-fit,1)`.
- Après chaque phase : `tsc -b` + `test:run` + `lint` + `knip` verts, puis commit + `npm run build` + `firebase deploy --only hosting` + smoke (`?fresh=N`).

---

## Phase 1 — Modèle + rendu libre

### Task 1 : Types `CardObjectId`/`CardBox` + `freeLayout`/`layout`

**Files:**
- Modify: `src/features/catalog/catalogTypes.ts`

**Interfaces:**
- Produces : `CardObjectId` (union), `CardBox = { x: number; y: number; w?: number; h?: number }`, `CatalogCardStyle.freeLayout: boolean`, `CatalogCardStyle.layout: Partial<Record<CardObjectId, CardBox>>`.

- [ ] **Step 1 : Ajouter les types + champs**

Dans `catalogTypes.ts`, avant `export interface CatalogCardStyle` ajouter :

```ts
/** Objets de la fiche déplaçables/redimensionnables en mode « disposition libre ». */
export type CardObjectId =
  | 'promo' | 'image' | 'sticker' | 'kicker' | 'vedette'
  | 'brand' | 'name' | 'description' | 'ref' | 'unit' | 'price' | 'details'
export const CARD_OBJECT_IDS: CardObjectId[] = [
  'promo', 'image', 'sticker', 'kicker', 'vedette',
  'brand', 'name', 'description', 'ref', 'unit', 'price', 'details',
]
/** Boîte d'un objet en % de la carte (x/y = coin haut-gauche ; w/h optionnels). */
export interface CardBox { x: number; y: number; w?: number; h?: number }
```

Dans `CatalogCardStyle`, ajouter après `showVedette: boolean` (dernier champ, ligne 126) :

```ts
  /** Disposition LIBRE (drag & drop) : objets positionnés en % au lieu du flux. */
  freeLayout: boolean
  /** Boîtes en % par objet (mode libre uniquement) ; absent = position de repli. */
  layout: Partial<Record<CardObjectId, CardBox>>
```

Dans `DEFAULT_CARD_STYLE`, ajouter (après `showVedette: true`) :

```ts
  freeLayout: false, layout: {},
```

- [ ] **Step 2 : Types**

Run : `npx tsc -b`
Expected : PASS (nouveaux champs requis ; seul `DEFAULT_CARD_STYLE` construit un `CatalogCardStyle` complet — `cardStyleVars`/`CardStyleCard` fusionnent `DEFAULT_CARD_STYLE`, cf. Task 2/3).

- [ ] **Step 3 : Commit**

```bash
git add src/features/catalog/catalogTypes.ts
git commit -m "feat(catalog): types disposition libre (freeLayout + layout %)"
```

### Task 2 : Rendu libre dans `ProductCell` + CSS `.cat-free`

**Files:**
- Create: `src/features/catalog/components/pages/freeLayout.ts`
- Modify: `src/features/catalog/components/pages/ProductCell.tsx`
- Modify: `src/features/catalog/components/pages/catalogCss.ts`
- Test: `src/features/catalog/components/pages/freeLayout.test.ts`

**Interfaces:**
- Consumes : `CardObjectId`, `CardBox`, `CatalogCardStyle` (Task 1).
- Produces : `freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): Required<CardBox>` (merge repli + override, w/h par défaut 0 = « auto » → non émis). `FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox>`.

- [ ] **Step 1 : Écrire le module de repli + helper (avec test)**

Créer `src/features/catalog/components/pages/freeLayout.ts` :

```ts
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'

/** Positions de repli (%) approximant le flux — une fiche passée en libre n'est jamais cassée. */
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 2, y: 1, w: 96 },
  image: { x: 8, y: 8, w: 84, h: 44 },
  sticker: { x: 78, y: 40 },
  kicker: { x: 2, y: 9 },
  vedette: { x: 62, y: 1 },
  brand: { x: 6, y: 55, w: 88 },
  name: { x: 6, y: 60, w: 88 },
  description: { x: 6, y: 69, w: 88 },
  ref: { x: 6, y: 84, w: 50 },
  unit: { x: 6, y: 89, w: 50 },
  price: { x: 58, y: 82, w: 38 },
  details: { x: 6, y: 94, w: 88 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}
```

Créer `src/features/catalog/components/pages/freeLayout.test.ts` :

```ts
import { test, expect } from 'vitest'
import { DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { freeLayoutBox, FREE_DEFAULT_LAYOUT } from './freeLayout'

test('freeLayoutBox : repli quand aucun override', () => {
  expect(freeLayoutBox('name', DEFAULT_CARD_STYLE)).toEqual(FREE_DEFAULT_LAYOUT.name)
})

test('freeLayoutBox : override fusionné sur le repli', () => {
  const style = { ...DEFAULT_CARD_STYLE, layout: { name: { x: 10, y: 20 } } }
  expect(freeLayoutBox('name', style)).toEqual({ x: 10, y: 20, w: 88 })
})
```

- [ ] **Step 2 : Lancer le test → échec puis succès**

Run : `npm run test:run -- src/features/catalog/components/pages/freeLayout.test.ts`
Expected : PASS (le module existe déjà à ce stade — si tu écris d'abord le test seul il FAIL sur import manquant).

- [ ] **Step 3 : Branche de rendu libre dans `ProductCell`**

Dans `ProductCell.tsx`, importer en tête :

```ts
import type { CardObjectId } from '../../catalogTypes'
import { freeLayoutBox } from './freeLayout'
```

Puis, dans `ProductCell`, JUSTE avant le `return (` du rendu flux actuel, insérer la branche libre :

```tsx
  if (cardStyle?.freeLayout) {
    const obj = (id: CardObjectId, node: React.ReactNode) => {
      const b = freeLayoutBox(id, cardStyle)
      return (
        <div className="cat-obj" data-object-id={id}
          style={{ left: `${b.x}%`, top: `${b.y}%`, ...(b.w != null ? { width: `${b.w}%` } : {}), ...(b.h != null ? { height: `${b.h}%` } : {}) }}>
          {node}
        </div>
      )
    }
    return (
      <div className={`cat-cell cat-free cat-${size}${featured ? ' cat-featured' : ''}`} style={style}>
        {promo && obj('promo', <span className="cat-cell-promo">{promo}</span>)}
        {obj('image', <div className="cat-cell-img-in" data-resolving={resolving ? 'true' : undefined}>{src ? <img src={src} alt="" /> : <span className="cat-cell-img-ph">Sans visuel</span>}</div>)}
        {sticker && obj('sticker', <span className="cat-price-sticker">{sticker}</span>)}
        {kicker && show('showKicker') && obj('kicker', <span className="cat-cell-kicker">{kicker}</span>)}
        {featured && show('showVedette') && obj('vedette', <span className="cat-cell-vedette">★ {cardStyle?.vedetteLabel || 'Vedette'}</span>)}
        {f.brand && obj('brand', <span className="cat-cell-brand">{f.brand}</span>)}
        {obj('name', <span className="cat-cell-name">{f.name || 'Produit'}</span>)}
        {f.description && show('showDesc') && obj('description', <span className="cat-cell-desc">{f.description}</span>)}
        {f.ref && show('showRef') && obj('ref', <span className="cat-cell-refcode">Réf. {f.ref}</span>)}
        {f.unit && show('showUnit') && obj('unit', <span className="cat-cell-unit">Unité : {f.unit}</span>)}
        {obj('price', <span className="cat-cell-pricebox"><span className="cat-cell-tag">{hasWas && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}<span className="cat-cell-price">{formatPrice(f.newPrice)}</span></span></span>)}
        {details && details.length > 0 && show('showDetails') && obj('details', <div className="cat-cell-details">{details.map((d, i) => <span key={i}>{d}</span>)}</div>)}
      </div>
    )
  }
```

(Le rendu flux actuel reste tel quel en dessous — chemin par défaut inchangé.)

- [ ] **Step 4 : CSS mode libre**

Dans `catalogCss.ts`, `CATALOG_CSS`, après le bloc `.cat-cell { … }` (avant `.cat-cell-img`), ajouter :

```css
/* ── Disposition LIBRE : objets positionnés en % (le concepteur les place) ── */
.cat-free { position:relative; overflow:hidden; }
.cat-free .cat-obj { position:absolute; }
/* Neutralise le positionnement intrinsèque des objets qui étaient absolus dans le flux */
.cat-free .cat-cell-promo, .cat-free .cat-cell-kicker, .cat-free .cat-price-sticker, .cat-free .cat-cell-vedette {
  position:static; top:auto; left:auto; right:auto; bottom:auto; display:inline-flex; }
.cat-free .cat-cell-img-in { position:static; top:auto; left:auto; right:auto; bottom:auto; width:100%; height:100%; }
.cat-free .cat-obj[data-object-id="image"] { background:linear-gradient(180deg,#fafbfc 0%,#eef1f4 100%); }
.cat-free .cat-cell-body { display:contents; }
```

- [ ] **Step 5 : Vérif complète + commit**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS.

```bash
git add src/features/catalog/components/pages/freeLayout.ts src/features/catalog/components/pages/freeLayout.test.ts src/features/catalog/components/pages/ProductCell.tsx src/features/catalog/components/pages/catalogCss.ts
git commit -m "feat(catalog): rendu disposition libre (objets absolus en %, repli) + CSS .cat-free"
```

- [ ] **Step 6 : Phase 1 build (pas de deploy — UI en Phase 2)**

Run : `npm run build`
Expected : succès (le mode libre n'est pas encore activable dans l'UI ; `freeLayout` par défaut false → rien ne change à l'écran).

---

## Phase 2 — Éditeur : drag & drop + toggle

### Task 3 : `CardLayoutOverlay` + toggle + câblage aperçu

**Files:**
- Create: `src/features/catalog/components/steps/CardLayoutOverlay.tsx`
- Modify: `src/features/catalog/components/steps/CardStylePreview.tsx`
- Modify: `src/features/catalog/components/steps/CardStyleCard.tsx`

**Interfaces:**
- Consumes : `CardObjectId`, `CardBox`, `freeLayoutBox`, `CatalogCardStyle`.
- Produces : `<CardLayoutOverlay cardRef style onChange />` où `onChange(id: CardObjectId, box: CardBox)` ; `CardStylePreview` gagne `editable?: boolean` + `onLayoutChange?`.

- [ ] **Step 1 : Créer l'overlay drag + resize (en %)**

Créer `src/features/catalog/components/steps/CardLayoutOverlay.tsx` :

```tsx
// Overlay d'édition de la disposition libre : glisse chaque objet (data-object-id)
// et redimensionne via 8 poignées — tout stocké en % de la carte (dynamique).
import { useLayoutEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS, DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { freeLayoutBox } from '../pages/freeLayout'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const dirX = (h: Handle) => (h.includes('e') ? 1 : h.includes('w') ? -1 : 0)
const dirY = (h: Handle) => (h.includes('s') ? 1 : h.includes('n') ? -1 : 0)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10

interface Props {
  cardRef: RefObject<HTMLDivElement | null>
  style: CatalogCardStyle
  onChange: (id: CardObjectId, box: CardBox) => void
}

export function CardLayoutOverlay({ cardRef, style, onChange }: Props) {
  const [sel, setSel] = useState<CardObjectId | null>(null)
  const [tick, setTick] = useState(0) // force le recalcul des rects après changement
  const rectOf = (id: CardObjectId) => {
    const card = cardRef.current
    const el = card?.querySelector<HTMLElement>(`[data-object-id="${id}"]`)
    if (!card || !el) return null
    const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect()
    if (!cr.width || !cr.height) return null
    return { left: ((er.left - cr.left) / cr.width) * 100, top: ((er.top - cr.top) / cr.height) * 100, width: (er.width / cr.width) * 100, height: (er.height / cr.height) * 100 }
  }
  const cardPx = () => { const c = cardRef.current?.getBoundingClientRect(); return { w: c?.width || 1, h: c?.height || 1 } }
  useLayoutEffect(() => { setTick((t) => t + 1) }, [style])

  const startDrag = (e: ReactPointerEvent, id: CardObjectId) => {
    e.preventDefault(); e.stopPropagation(); setSel(id)
    const b = freeLayoutBox(id, style)
    const { w, h } = cardPx()
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      onChange(id, { ...b, x: clamp(r1(b.x + ((ev.clientX - sx) / w) * 100), 0, 100), y: clamp(r1(b.y + ((ev.clientY - sy) / h) * 100), 0, 100) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const startResize = (e: ReactPointerEvent, id: Handle) => { /* remplacé ci-dessous */ }
  const resize = (e: ReactPointerEvent, hnd: Handle) => {
    e.preventDefault(); e.stopPropagation()
    if (!sel) return
    const rect = rectOf(sel); if (!rect) return
    const b = freeLayoutBox(sel, style)
    const startW = b.w ?? rect.width, startH = b.h ?? rect.height
    const { w, h } = cardPx()
    const dx = dirX(hnd), dy = dirY(hnd)
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      const ddx = ((ev.clientX - sx) / w) * 100, ddy = ((ev.clientY - sy) / h) * 100
      const next: CardBox = { ...b }
      if (dx > 0) next.w = clamp(r1(startW + ddx), 4, 100)
      else if (dx < 0) { next.w = clamp(r1(startW - ddx), 4, 100); next.x = clamp(r1(b.x + ddx), 0, 100) }
      if (dy > 0) next.h = clamp(r1(startH + ddy), 4, 100)
      else if (dy < 0) { next.h = clamp(r1(startH - ddy), 4, 100); next.y = clamp(r1(b.y + ddy), 0, 100) }
      onChange(sel, next)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  void tick; void startResize
  const selRect = sel ? rectOf(sel) : null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {CARD_OBJECT_IDS.map((id) => {
        const r = rectOf(id)
        if (!r) return null
        return (
          <div key={id} onPointerDown={(e) => startDrag(e, id)} title={id}
            style={{ position: 'absolute', left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%`, cursor: 'move', outline: sel === id ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,.4)' }} />
        )
      })}
      {sel && selRect && HANDLES.map((hnd) => {
        const cx = selRect.left + (dirX(hnd) < 0 ? 0 : dirX(hnd) > 0 ? selRect.width : selRect.width / 2)
        const cy = selRect.top + (dirY(hnd) < 0 ? 0 : dirY(hnd) > 0 ? selRect.height : selRect.height / 2)
        return (
          <div key={hnd} onPointerDown={(e) => resize(e, hnd)}
            style={{ position: 'absolute', left: `calc(${cx}% - 6px)`, top: `calc(${cy}% - 6px)`, width: 12, height: 12, background: '#fff', border: '2px solid #6366f1', borderRadius: '50%', cursor: 'pointer', zIndex: 21 }} />
        )
      })}
    </div>
  )
}

void DEFAULT_CARD_STYLE
```

(Note d'implémentation : `startResize` et le `void`/`DEFAULT_CARD_STYLE` inutiles ci-dessus sont des reliquats — les SUPPRIMER à l'écriture pour passer `knip`/lint ; garder `resize`, `startDrag`, le rendu.)

- [ ] **Step 2 : `CardStylePreview` monte l'overlay quand `editable` + `freeLayout`**

Dans `CardStylePreview.tsx` : ajouter `import { useRef } from 'react'`, `import { CardLayoutOverlay } from './CardLayoutOverlay'`, et props :

```tsx
interface Props {
  theme: CatalogTheme
  cardStyle: CatalogCardStyle
  fields?: PromoFields | null
  editable?: boolean
  onLayoutChange?: (id: import('../../catalogTypes').CardObjectId, box: import('../../catalogTypes').CardBox) => void
}

export function CardStylePreview({ theme, cardStyle, fields, editable, onLayoutChange }: Props) {
  const f = fields ?? SAMPLE_FIELDS
  const cardRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className="cat-page rounded-md overflow-hidden shrink-0 border border-border relative"
      style={{ width: 330, ...themeVars(theme), ...cardStyleVars(cardStyle, theme) }}>
      <style>{CATALOG_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--cat-bg)' }}>
        <div ref={cardRef} style={{ height: 360, display: 'grid', position: 'relative' }}>
          <ProductCell fields={f} featured kicker="Sous-famille" size="md" cardStyle={cardStyle} />
          {editable && cardStyle.freeLayout && onLayoutChange && <CardLayoutOverlay cardRef={cardRef} style={cardStyle} onChange={onLayoutChange} />}
        </div>
        <div style={{ height: 190, display: 'grid' }}>
          <ProductCell fields={f} featured={false} kicker="Sous-famille" size="md" horizontal cardStyle={cardStyle} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3 : Toggle + reset dans `CardStyleCard`**

Dans `CardStyleCard.tsx` : passer `editable` + `onLayoutChange` à `CardStylePreview`, et ajouter le toggle + reset. Remplacer le rendu de l'aperçu (ligne `<CardStylePreview theme={plan.theme} cardStyle={style} fields={sampleFields} />`) par :

```tsx
        <CardStylePreview theme={plan.theme} cardStyle={style} fields={sampleFields}
          editable onLayoutChange={(id, box) => patch({ layout: { ...style.layout, [id]: box } })} />
```

Et dans la section « Éléments affichés » (après la `</div>` fermant la ligne des toggles), ajouter un contrôle « Disposition libre » :

```tsx
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={style.freeLayout} onChange={(e) => patch({ freeLayout: e.target.checked })} className="accent-indigo-600" />
            Disposition libre (glisser les objets)
          </label>
          {style.freeLayout && (
            <button type="button" onClick={() => patch({ layout: {} })}
              className="text-xs text-muted-foreground hover:text-white underline">Réinitialiser les positions</button>
          )}
```

- [ ] **Step 4 : Vérif + commit + deploy + smoke**

Run : `npx tsc -b && npm run test:run && npm run lint && npx knip`
Expected : PASS (bien supprimer les reliquats `startResize`/`void` de l'overlay pour knip/lint).

```bash
git add src/features/catalog/components/steps/CardLayoutOverlay.tsx src/features/catalog/components/steps/CardStylePreview.tsx src/features/catalog/components/steps/CardStyleCard.tsx
git commit -m "feat(catalog): éditeur de disposition libre (drag+resize en %) dans Style des fiches"
npm run build && firebase deploy --only hosting
```
Smoke (`?fresh=1`) : ouvrir un catalogue → étape Prompt → « Style des fiches » → cocher « Disposition libre » → glisser l'unité sous le prix, la réf sous la description, élargir le prix barré → vérifier dans l'Aperçu que TOUTES les fiches suivent, y compris à des densités/formats différents.

---

## Phase 3 — IA / persistance

### Task 4 : `sanitizeAICardStyle` accepte `freeLayout` + `layout`

**Files:**
- Modify: `src/features/catalog/catalogPlan.ts:163-173`
- Test: `src/features/catalog/catalogPlan.test.ts`

**Interfaces:**
- Consumes : `CARD_OBJECT_IDS`, `CardBox`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/features/catalog/catalogPlan.test.ts` :

```ts
test('sanitizeCatalogPlan : freeLayout + layout bornés (0–100, ids connus)', () => {
  const tree = [{ id: 'u', label: 'U', level: 1 as const, children: [], productIds: ['r1'] }]
  const plan = sanitizeCatalogPlan({ cardStyle: { freeLayout: true, layout: { name: { x: 10, y: 20, w: 150 }, bogus: { x: 1, y: 1 } } } } as never, tree, 'C')
  expect(plan.cardStyle?.freeLayout).toBe(true)
  expect(plan.cardStyle?.layout?.name).toEqual({ x: 10, y: 20, w: 100 }) // w clampé
  expect((plan.cardStyle?.layout as Record<string, unknown>)?.bogus).toBeUndefined() // id inconnu ignoré
})
```

(Adapter l'import de `sanitizeCatalogPlan` au style du fichier de test existant.)

- [ ] **Step 2 : Lancer → échec**

Run : `npm run test:run -- src/features/catalog/catalogPlan.test.ts`
Expected : FAIL (`freeLayout`/`layout` ignorés par `sanitizeAICardStyle`).

- [ ] **Step 3 : Étendre `sanitizeAICardStyle`**

Dans `catalogPlan.ts`, importer `CARD_OBJECT_IDS` et le type `CardBox` depuis `./catalogTypes`, puis avant `return out` dans `sanitizeAICardStyle` :

```ts
  const rawLayout = (raw as { freeLayout?: unknown; layout?: unknown })
  if (typeof rawLayout.freeLayout === 'boolean') out.freeLayout = rawLayout.freeLayout
  if (rawLayout.layout && typeof rawLayout.layout === 'object') {
    const num = (v: unknown, lo: number, hi: number): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined
    const layout: Partial<Record<CardObjectId, CardBox>> = {}
    for (const id of CARD_OBJECT_IDS) {
      const b = (rawLayout.layout as Record<string, { x?: unknown; y?: unknown; w?: unknown; h?: unknown }>)[id]
      if (!b) continue
      const x = num(b.x, 0, 100), y = num(b.y, 0, 100)
      if (x == null || y == null) continue
      const box: CardBox = { x, y }
      const w = num(b.w, 4, 100); if (w != null) box.w = w
      const h = num(b.h, 4, 100); if (h != null) box.h = h
      layout[id] = box
    }
    if (Object.keys(layout).length) out.layout = layout
  }
```

Ajouter l'import type en tête : `import type { CardObjectId, CardBox } from './catalogTypes'` et `import { CARD_OBJECT_IDS } from './catalogTypes'` (fusionner avec les imports existants de `catalogTypes`).

- [ ] **Step 4 : Lancer → succès + vérif complète**

Run : `npm run test:run -- src/features/catalog/catalogPlan.test.ts && npx tsc -b && npm run lint && npx knip`
Expected : PASS.

- [ ] **Step 5 : Commit + deploy + smoke**

```bash
git add src/features/catalog/catalogPlan.ts src/features/catalog/catalogPlan.test.ts
git commit -m "feat(catalog): prompt IA peut proposer une disposition libre (bornage 0–100)"
npm run build && firebase deploy --only hosting
```
Smoke : vérifier qu'un modèle enregistré porte bien `freeLayout`/`layout` (réappliquer un modèle restaure la disposition), et que « met la réf sous la description » au prompt IA ne casse rien.

---

## Self-Review

**Spec coverage :**
- `freeLayout` + `layout` % dans `CatalogCardStyle` → Task 1. ✔
- Rendu libre (absolute %, repli, data-object-id, CSS `.cat-free`) → Task 2. ✔
- Drag & drop + resize de tous les objets dans l'aperçu + toggle + reset → Task 3. ✔
- Dynamique/rééchelonné (positions en %, `--cat-fit` conservé) → Task 2 (CSS) + le mode libre hérite des échelles. ✔
- Persistance (cardStyle → doc + modèles) → héritée (aucun code : `cardStyle` déjà persisté). ✔
- IA (sanitize freeLayout + layout borné) → Task 4. ✔
- Flux inchangé si `freeLayout:false` → Task 2 (branche séparée). ✔

**Placeholder scan :** le squelette d'overlay contient des reliquats explicitement signalés à SUPPRIMER (`startResize`, `void`) — ce n'est pas un placeholder de logique, c'est une consigne de nettoyage nommée. Aucun TODO/TBD.

**Type consistency :** `CardObjectId`/`CardBox`/`freeLayout`/`layout` (Task 1) réutilisés identiquement en Tasks 2/3/4 ; `freeLayoutBox(id, style)` (Task 2) consommé par l'overlay (Task 3) ; `CARD_OBJECT_IDS` (Task 1) utilisé Tasks 3/4. Cohérent.

**Hors périmètre (rappel) :** panneau de propriétés dédié, variantes par taille de carte, rotation, snapping — non couverts (V1). Suite F3 (IA/HyperFrames propose des graphismes) = spec ultérieure.
