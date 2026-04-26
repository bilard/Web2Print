import { Canvas, Rect, Circle, Ellipse, Path, Textbox, Image as FabricImage, Gradient } from 'fabric'
import type { FabricObject } from 'fabric'
import type {
  DesignAnalysis,
  BackgroundDef,
  DecorativeShape,
} from './analyzeDesignForEdit'
import { resolveBrandLogoCandidates } from './brandLogos'
import { isLikelyProductImage } from './scrapeProductForDesign'

/**
 * Route les URLs http(s) externes via le proxy image local pour gagner les
 * en-têtes CORS et éviter de tainter le canvas (les CDN e-commerce ne servent
 * souvent pas Access-Control-Allow-Origin). Les data: et blob: passent direct.
 */
function proxiedImageUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

type Bbox = { x: number; y: number; w: number; h: number }

function bboxToPx(bbox: Bbox, canvasWidth: number, canvasHeight: number) {
  return {
    xPx: (bbox.x / 100) * canvasWidth,
    yPx: (bbox.y / 100) * canvasHeight,
    wPx: (bbox.w / 100) * canvasWidth,
    hPx: (bbox.h / 100) * canvasHeight,
  }
}

/**
 * Rend le fond du design (couleur solide ou gradient) comme un Rect Fabric plein canvas.
 * Placé juste au-dessus du pageBg pour ne pas couvrir les marques d'impression.
 */
export function renderBackground(
  canvas: Canvas,
  bg: BackgroundDef,
  canvasWidth: number,
  canvasHeight: number
): Rect {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  rect.data = { isDesignBackground: true }

  if ((bg.type === 'linearGradient' || bg.type === 'radialGradient') && bg.stops?.length) {
    const coords =
      bg.type === 'linearGradient'
        ? computeLinearGradientCoords(bg.angle ?? 90, canvasWidth, canvasHeight)
        : {
            x1: canvasWidth / 2,
            y1: canvasHeight / 2,
            r1: 0,
            x2: canvasWidth / 2,
            y2: canvasHeight / 2,
            r2: Math.max(canvasWidth, canvasHeight) / 2,
          }
    rect.set(
      'fill',
      new Gradient({
        type: bg.type === 'linearGradient' ? 'linear' : 'radial',
        coords,
        colorStops: bg.stops.map((s) => ({ offset: clamp01(s.offset), color: s.color })),
      })
    )
  } else {
    rect.set('fill', bg.color || '#ffffff')
  }

  canvas.add(rect)
  const pageBg = canvas.getObjects().find((o) => o.data?.isPageBg)
  if (pageBg) {
    const idx = canvas.getObjects().indexOf(pageBg)
    canvas.moveObjectTo(rect, idx + 1)
  } else {
    canvas.sendObjectToBack(rect)
  }

  return rect
}

/**
 * Rend les formes décoratives (rects arrondis, cercles, ellipses, paths SVG).
 * L'ordre du tableau est respecté : premier élément = le plus derrière.
 */
export function renderDecorativeShapes(
  canvas: Canvas,
  shapes: DecorativeShape[],
  canvasWidth: number,
  canvasHeight: number
): FabricObject[] {
  const created: FabricObject[] = []

  for (const s of shapes) {
    const { xPx, yPx, wPx, hPx } = bboxToPx(s.bbox, canvasWidth, canvasHeight)
    const opacity = s.opacity ?? 1

    let obj: FabricObject | null = null

    try {
      if (s.type === 'rect') {
        const radius = s.rx ? (s.rx / 100) * Math.min(wPx, hPx) : 0
        obj = new Rect({
          left: xPx,
          top: yPx,
          width: wPx,
          height: hPx,
          rx: radius,
          ry: radius,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'circle') {
        const radius = Math.min(wPx, hPx) / 2
        obj = new Circle({
          left: xPx,
          top: yPx,
          radius,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'ellipse') {
        obj = new Ellipse({
          left: xPx,
          top: yPx,
          rx: wPx / 2,
          ry: hPx / 2,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'path' && s.pathData) {
        const p = new Path(s.pathData, {
          fill: s.fill,
          opacity,
          selectable: true,
        })
        const naturalW = p.width || 100
        const naturalH = p.height || 100
        p.set({
          scaleX: wPx / naturalW,
          scaleY: hPx / naturalH,
          left: xPx,
          top: yPx,
          originX: 'left',
          originY: 'top',
        })
        obj = p
      }
    } catch (err) {
      console.warn(`[createDesign] Shape ${s.id} (type=${s.type}) échouée, ignorée`, err)
      continue
    }

    if (!obj) continue

    obj.data = { id: s.id, isDecorativeShape: true }
    canvas.add(obj)
    created.push(obj)
  }

  return created
}

/**
 * Crée des Fabric Textbox éditables. La taille de police vient directement de
 * Claude Vision (fontSizePct relatif à la hauteur du canvas) — pas de fallback
 * heuristique qui casserait l'intention typographique.
 */
export function addEditableTextOverlays(
  canvas: Canvas,
  texts: DesignAnalysis['texts'],
  canvasWidth: number,
  canvasHeight: number
): Textbox[] {
  const created: Textbox[] = []

  for (const t of texts) {
    const { xPx, yPx, wPx } = bboxToPx(t.bbox, canvasWidth, canvasHeight)

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
    tb.data = { id: t.id, editableText: true }

    canvas.add(tb)
    created.push(tb)
  }

  return created
}

/**
 * Pour chaque imageSlot, découpe la zone correspondante dans l'image Nano Banana
 * source et la place comme FabricImage sélectionnable / remplaçable. L'image
 * source n'est décodée qu'une seule fois, et tous les crops se font en parallèle.
 */
export async function addEditableImageSlots(
  canvas: Canvas,
  slots: DesignAnalysis['imageSlots'],
  canvasWidth: number,
  canvasHeight: number,
  sourceDataUri: string | null,
  productImageUrl?: string,
  brandDomain?: string,
): Promise<FabricObject[]> {
  // Décode la ref Nano Banana une seule fois pour tous les fallbacks crop
  const sourceDecoded = sourceDataUri
    ? await decodeImage(sourceDataUri).catch(() => null)
    : null

  // Limite à UN seul slot logo (le plus petit, typiquement le vrai logo marque
  // top-left). Évite que Claude Vision identifie plusieurs zones comme logo
  // et qu'on pollue le design avec des copies de la marque.
  const logoSlots = slots.filter((s) => s.role === 'logo')
  let dedupedLogoId: string | null = null
  if (logoSlots.length > 1) {
    logoSlots.sort((a, b) => a.bbox.w * a.bbox.h - b.bbox.w * b.bbox.h)
    dedupedLogoId = logoSlots[0].id
    console.log(`[createDesign] ${logoSlots.length} logo slots détectés, garde uniquement ${dedupedLogoId} (le plus petit)`)
  }

  // Log des slots reçus pour diagnostic
  console.log('[createDesign] imageSlots from analysis:', slots.map((s) => ({ id: s.id, role: s.role, bbox: s.bbox, description: s.description?.slice(0, 50) })))
  console.log('[createDesign] productImageUrl:', productImageUrl?.slice(0, 100), '| brandDomain:', brandDomain)

  const built = await Promise.all(
    slots.map(async (s) => {
      const { xPx, yPx, wPx, hPx } = bboxToPx(s.bbox, canvasWidth, canvasHeight)

      // Si Claude Vision a classé une zone produit comme "logo" (typique des
      // designs où la photo produit côtoie la marque), on garde le plus petit
      // slot logo comme vrai logo et on crop la ref Nano Banana pour les
      // autres (probablement des photos produit ou des illustrations).
      const isDemotedLogo = s.role === 'logo' && dedupedLogoId !== null && s.id !== dedupedLogoId
      if (isDemotedLogo && sourceDecoded) {
        try {
          const cropped = cropFromDecoded(sourceDecoded, s.bbox)
          const img = await FabricImage.fromURL(cropped, { crossOrigin: 'anonymous' })
          if (img && img.width && img.height) {
            console.log(`[createDesign] Demoted logo ${s.id} → crop Nano Banana ref`)
            return placeFabricImage(img, { ...s, role: 'productPhoto' }, xPx, yPx, wPx, hPx)
          }
        } catch (err) {
          console.warn(`[createDesign] Demoted logo crop failed for ${s.id}:`, err instanceof Error ? err.message : String(err))
        }
      }

      // ─── productPhoto : URL réelle scrapée → ref Nano Banana → placeholder ──
      if (s.role === 'productPhoto') {
        // Tentative 1 : URL produit scrapée (la meilleure)
        // Défense en profondeur : si une URL "logo/didomi/banner" a fuité jusque-là,
        // on la rejette ici pour ne pas la coller à la place de la photo produit.
        const validProductUrl = productImageUrl && isLikelyProductImage(productImageUrl)
          ? productImageUrl
          : undefined
        if (productImageUrl && !validProductUrl) {
          console.warn(`[createDesign] productImageUrl rejected at canvas builder (looks like logo/banner):`, productImageUrl.slice(0, 100))
        }
        if (validProductUrl) {
          try {
            const proxied = proxiedImageUrl(validProductUrl)
            console.log(`[createDesign] Loading product image from URL:`, validProductUrl.slice(0, 100), proxied !== validProductUrl ? '(via proxy)' : '')
            const img = await FabricImage.fromURL(proxied, { crossOrigin: 'anonymous' })
            if (img && img.width && img.height) {
              return placeFabricImage(img, s, xPx, yPx, wPx, hPx)
            }
            console.warn(`[createDesign] Product image dimensions invalid for slot ${s.id}`)
          } catch (err) {
            console.error(`[createDesign] Real product image failed for slot ${s.id}:`, err instanceof Error ? err.message : String(err))
          }
        }
        // Tentative 2 : crop depuis la ref Nano Banana (toujours mieux que le logo marque)
        if (sourceDecoded) {
          try {
            const cropped = cropFromDecoded(sourceDecoded, s.bbox)
            const img = await FabricImage.fromURL(cropped, { crossOrigin: 'anonymous' })
            if (img && img.width && img.height) {
              console.log(`[createDesign] productPhoto fallback: crop depuis ref Nano Banana pour ${s.id}`)
              return placeFabricImage(img, s, xPx, yPx, wPx, hPx)
            }
          } catch (err) {
            console.warn(`[createDesign] Nano Banana crop fallback failed for ${s.id}:`, err instanceof Error ? err.message : String(err))
          }
        }
      }

      // ─── logo : KNOWN → Clearbit → Google Favicon → crop Nano Banana ─────
      if (s.role === 'logo') {
        const candidates = brandDomain
          ? resolveBrandLogoCandidates(brandDomain)
          : resolveBrandLogoCandidates(s.description)

        for (const candidate of candidates) {
          try {
            const proxied = proxiedImageUrl(candidate)
            console.log(`[createDesign] Trying logo candidate for ${s.id}:`, candidate.slice(0, 80))
            const logo = await FabricImage.fromURL(proxied, { crossOrigin: 'anonymous' })
            if (logo && logo.width && logo.height && logo.width >= 16 && logo.height >= 16) {
              console.log(`[createDesign] Brand logo loaded successfully for slot ${s.id}`)
              return placeFabricImage(logo, s, xPx, yPx, wPx, hPx)
            }
          } catch (err) {
            console.warn(`[createDesign] Logo candidate failed (${candidate.slice(0, 60)}):`, err instanceof Error ? err.message : String(err))
          }
        }
        // Fallback : crop la zone du logo dans la ref Nano Banana
        if (sourceDecoded) {
          try {
            const cropped = cropFromDecoded(sourceDecoded, s.bbox)
            const logo = await FabricImage.fromURL(cropped, { crossOrigin: 'anonymous' })
            if (logo && logo.width && logo.height) {
              console.log(`[createDesign] logo fallback: crop depuis ref Nano Banana pour ${s.id}`)
              return placeFabricImage(logo, s, xPx, yPx, wPx, hPx)
            }
          } catch (err) {
            console.warn(`[createDesign] Nano Banana crop fallback (logo) failed for ${s.id}:`, err instanceof Error ? err.message : String(err))
          }
        }
        console.warn(`[createDesign] All logo strategies failed for slot ${s.id}`)
      }

      // Placeholder vectoriel pour tous les autres slots (logo, badges, etc.)
      // L'utilisateur peut le remplacer avec un vrai asset par drag & drop
      const rect = new Rect({
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
      rect.data = { id: s.id, editableImageSlot: true, role: s.role, description: s.description }
      return rect as FabricObject
    })
  )

  for (const obj of built) canvas.add(obj)
  return built
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeLinearGradientCoords(angleDeg: number, w: number, h: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Longueur projetée du gradient sur l'axe de l'angle : garantit que les
  // stops 0 et 1 atteignent bien les bords de la bbox quel que soit le ratio.
  const len = Math.abs(cos * w) + Math.abs(sin * h)
  const cx = w / 2
  const cy = h / 2
  return {
    x1: cx - (cos * len) / 2,
    y1: cy - (sin * len) / 2,
    x2: cx + (cos * len) / 2,
    y2: cy + (sin * len) / 2,
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

/**
 * Positionne et scale une FabricImage pour qu'elle remplisse la bbox cible
 * en mode "fit contain" (préserve le ratio natif).
 */
function placeFabricImage(
  img: FabricImage,
  slot: { id: string; role: string; description?: string },
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): FabricObject {
  const imgW = img.width!
  const imgH = img.height!
  const scale = Math.min(wPx / imgW, hPx / imgH)
  const displayW = imgW * scale
  const displayH = imgH * scale
  img.set({
    left: xPx + (wPx - displayW) / 2,
    top: yPx + (hPx - displayH) / 2,
    scaleX: scale,
    scaleY: scale,
    originX: 'left',
    originY: 'top',
    selectable: true,
  })
  img.data = { id: slot.id, editableImageSlot: true, role: slot.role, description: slot.description }
  return img as FabricObject
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Source image load failed'))
    img.src = src
  })
}

function cropFromDecoded(img: HTMLImageElement, bbox: Bbox): string {
  const sx = Math.max(0, (bbox.x / 100) * img.width)
  const sy = Math.max(0, (bbox.y / 100) * img.height)
  const sw = Math.min(img.width - sx, (bbox.w / 100) * img.width)
  const sh = Math.min(img.height - sy, (bbox.h / 100) * img.height)
  if (sw <= 0 || sh <= 0) throw new Error('Crop dimensions invalid')
  const c = document.createElement('canvas')
  c.width = Math.round(sw)
  c.height = Math.round(sh)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return c.toDataURL('image/png')
}
