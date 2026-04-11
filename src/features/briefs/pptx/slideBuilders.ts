import type pptxgen from 'pptxgenjs'
import type { SlideSpec, CartItem } from '@/features/briefs/types'
import type { Branding } from './branding'
import { computeSubtotal, computeTotal } from '@/features/briefs/cart/cartMath'
import { fitContain, type FetchedImage } from './imageFetcher'

type Pres = InstanceType<typeof pptxgen>

export interface SlideContext {
  branding: Branding
  cart: CartItem[]
  discount: { type: 'percent' | 'amount'; value: number } | undefined
  /** id (`hero` ou `product_${sku}`) → image téléchargée avec dimensions naturelles */
  images: Map<string, FetchedImage>
}

/**
 * Ajoute une image dans une boîte en préservant son ratio (letterbox centré).
 * À utiliser à la place de `slide.addImage({ sizing })` qui a un comportement
 * non fiable selon les versions de PptxGenJS et les clients Office.
 */
function addContainedImage(
  slide: pptxgen.Slide,
  img: FetchedImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  const { x, y, w, h } = fitContain(img.naturalWidth, img.naturalHeight, boxX, boxY, boxW, boxH)
  slide.addImage({ data: img.data, x, y, w, h })
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
    addContainedImage(slide, ctx.images.get('logo')!, 0.3, 0.05, 0.5, 0.25)
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

function buildCoverSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'cover' }>, ctx: SlideContext) {
  const slide = pres.addSlide()
  slide.background = { color: '0F0F0F' }
  const hero = ctx.images.get('hero')
  if (hero) {
    addContainedImage(slide, hero, 0, 0, 13.33, 7.5)
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

function buildContextSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'context' }>, ctx: SlideContext) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  slide.addText(spec.title, { x: 0.6, y: 0.7, w: 12, h: 0.8, ...TITLE_OPTS, color: '111111' })
  slide.addText(
    spec.bullets.map((b) => ({ text: b, options: { bullet: true, ...BODY_OPTS, color: '333333' } })),
    { x: 0.8, y: 1.8, w: 11.5, h: 5 },
  )
}

function buildProductGridSlide(
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
  // Cellules carrées centrées dans la zone disponible (12 large × 5.5 haut)
  const availW = 12
  const availH = 5.5
  const gap = 0.25
  const labelH = 0.4
  // Taille d'une cellule image carrée maximisant la zone
  const cellSize = Math.min(
    (availW - gap * (cols - 1)) / cols,
    (availH - gap * (rows - 1) - labelH) / rows,
  )
  const totalW = cellSize * cols + gap * (cols - 1)
  const totalH = (cellSize + labelH) * rows + gap * (rows - 1)
  const offsetX = 0.6 + (availW - totalW) / 2
  const offsetY = 1.7 + (availH - totalH) / 2

  spec.productSkus.slice(0, cols * rows).forEach((sku, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = offsetX + col * (cellSize + gap)
    const y = offsetY + row * (cellSize + labelH + gap)
    const w = cellSize
    const h = cellSize

    const img = ctx.images.get(`product_${sku}`)
    if (img) {
      addContainedImage(slide, img, x, y, w, h)
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

function buildProductFocusSlide(
  pres: Pres,
  spec: Extract<SlideSpec, { type: 'product_focus' }>,
  ctx: SlideContext,
) {
  const slide = pres.addSlide()
  addBrandHeader(slide, ctx)
  const img = ctx.images.get(`product_${spec.productSku}`)
  if (img) {
    addContainedImage(slide, img, 0.6, 1.0, 6, 6)
  } else {
    slide.addShape('rect', { x: 0.6, y: 1.0, w: 6, h: 6, fill: { color: 'EEEEEE' }, line: { color: 'DDDDDD' } })
  }
  slide.addText(spec.title, { x: 7, y: 1.0, w: 6, h: 0.8, ...TITLE_OPTS, fontSize: 28, color: '111111' })
  slide.addText(
    spec.keyPoints.map((p) => ({ text: p, options: { bullet: true, ...BODY_OPTS, color: '333333' } })),
    { x: 7, y: 2.0, w: 6, h: 5 },
  )
}

function buildBudgetSlide(
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

function buildCtaSlide(pres: Pres, spec: Extract<SlideSpec, { type: 'cta' }>, ctx: SlideContext) {
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
