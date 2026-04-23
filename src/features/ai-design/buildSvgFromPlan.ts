/**
 * Assembleur SVG déterministe.
 *
 * Entrée : un DesignPlan validé (zones + slots + typo + palette).
 * Sortie : un SVG 100 % vectoriel, éditable, géométriquement correct.
 *
 * Aucun LLM n'intervient ici. Toute la géométrie est calculée :
 *  - une ligne de texte = un <text> (pas de multi-tspan, Fabric v6 gère mal ça)
 *  - wrapping au mot selon la bboxMm.w
 *  - zéro chevauchement : on respecte les bboxMm du plan
 */

import type { DesignPlan } from './artDirectorSchema'

const PT_TO_MM = 0.3528
const DEFAULT_FONT_SIZE_PT = 10
const LINE_HEIGHT_RATIO = 1.2
// Fallback utilisé uniquement si measureText() n'est pas disponible (SSR/tests).
// Valeur empirique pour sans-serif regular — reste grossier pour bold/display
// mais sert juste de filet de sécurité.
const AVG_CHAR_WIDTH_RATIO_FALLBACK = 0.52

// Taille minimum de police par rôle : plancher bas pour permettre un shrink
// réel. On préfère un texte petit mais complet à un texte débordant la zone.
// 'accent' descend à 4pt parce que les badges (LITHIUM-ION, LXT, 18v…)
// occupent typiquement 2-3 mm de haut et doivent rester lisibles.
const MIN_FONT_SIZE_BY_ROLE: Record<string, number> = {
  title: 10,
  subtitle: 8,
  body: 6,
  cta: 8,
  price: 9,
  accent: 4,
}
const MIN_FONT_SIZE_FALLBACK = 5

// Canvas de mesure (lazy, singleton). En navigateur on obtient des mesures
// exactes via measureText(). En SSR/tests, on retombe sur le ratio.
let measureCtx: CanvasRenderingContext2D | null | undefined
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx
  try {
    if (typeof document === 'undefined') {
      measureCtx = null
      return null
    }
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
  } catch {
    measureCtx = null
  }
  return measureCtx ?? null
}

/** Mesure la largeur d'un texte en mm avec la font réelle (ou fallback ratio). */
function measureTextWidthMm(
  text: string,
  sizeMm: number,
  fontFamily: string,
  weight: number,
): number {
  const ctx = getMeasureCtx()
  if (ctx) {
    // On mesure en "pixels" CSS à une taille proportionnelle (sizeMm) — peu
    // importe l'unité exacte, on compare juste des largeurs entre elles pour
    // la décision de wrap. Tant que on utilise le même px=mm, ça marche.
    ctx.font = `${weight} ${sizeMm}px ${fontFamily}, sans-serif`
    return ctx.measureText(text).width
  }
  return text.length * sizeMm * AVG_CHAR_WIDTH_RATIO_FALLBACK
}

interface BuildSvgFromPlanArgs {
  plan: DesignPlan
  widthMm: number
  heightMm: number
  includeBleed: boolean
  bleedMm: number
}

export function buildSvgFromPlan(args: BuildSvgFromPlanArgs): string {
  const { plan, widthMm, heightMm, includeBleed, bleedMm } = args
  const overflow = includeBleed ? bleedMm : 0

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-overflow} ${-overflow} ${widthMm + 2 * overflow} ${heightMm + 2 * overflow}">`,
  )

  // Fond global de sécurité (palette[0]). Marqué background-decor pour que
  // svgToFabric le rende non-sélectionnable (sinon un clic n'importe où
  // sélectionne ce rect qui couvre tout le canvas).
  const fallbackBg = plan.palette[0] || '#FFFFFF'
  parts.push(
    `<rect x="${-overflow}" y="${-overflow}" width="${widthMm + 2 * overflow}" height="${heightMm + 2 * overflow}" fill="${escapeAttr(fallbackBg)}" stroke="none" data-role="background-decor"/>`,
  )

  // Émission par capacité, pas par rôle. Une zone peut fournir :
  //   - un rect de fond si `fill` est défini (ou inférable pour un rôle structurel)
  //   - un texte si `content` est non vide
  //   - les DEUX (ex: badge LITHIUM-ION = rect turquoise + texte blanc centré,
  //     CTA = rect vert + "ACHETER MAINTENANT")
  // Avant, un role="accent" avec content se voyait silencieusement dépouillé
  // de son texte parce qu'il n'apparaissait pas dans textRoles.
  const structuralRoles = new Set(['background', 'accent', 'cta', 'price', 'logo-slot'])

  for (const zone of plan.zones) {
    const fill =
      zone.fill ||
      (structuralRoles.has(zone.role) ? pickZoneFill(zone.role, plan.palette) : null)
    if (!fill) continue
    // data-role="background-decor" signale à svgToFabric de ne PAS rendre ce
    // rect sélectionnable — sinon un clic sur une zone "vide" sélectionne le
    // fond qui couvre tout le canvas, créant l'effet "bloc transparent géant".
    parts.push(
      `<rect id="${escapeAttr(zone.id)}-bg" x="${zone.bboxMm.x}" y="${zone.bboxMm.y}" width="${zone.bboxMm.w}" height="${zone.bboxMm.h}" fill="${escapeAttr(fill)}" stroke="none" data-role="background-decor"/>`,
    )
  }

  // Slots images (produit, logo, picto) — placeholders à remplir avec les assets scrapés.
  for (const slot of plan.slots) {
    parts.push(
      `<image id="${escapeAttr(slot.id)}" x="${slot.bboxMm.x}" y="${slot.bboxMm.y}" width="${slot.bboxMm.w}" height="${slot.bboxMm.h}" href="placeholder:${escapeAttr(slot.id)}" preserveAspectRatio="xMidYMid slice"/>`,
    )
  }

  // N'importe quel rôle peut porter du texte s'il a du content. Les image-slot
  // restent muets (ce sont des placeholders visuels).
  for (const zone of plan.zones) {
    if (!zone.content || zone.content.trim() === '') continue
    if (zone.role === 'image-slot') continue
    const textSvg = renderTextZone(zone, plan)
    if (textSvg) parts.push(textSvg)
  }

  parts.push('</svg>')
  return parts.join('')
}

function renderTextZone(
  zone: DesignPlan['zones'][number],
  plan: DesignPlan,
): string {
  const hier = plan.typography.hierarchy.find((h) => h.role === zone.role)
  const requestedSizePt = zone.fontSize ?? hier?.size ?? DEFAULT_FONT_SIZE_PT
  const weight = hier?.weight ?? (zone.role === 'title' ? 700 : zone.role === 'subtitle' ? 600 : 400)
  const color = pickTextColor(zone, hier, plan)
  const fontFamily = zone.role === 'body' ? plan.typography.bodyFont : plan.typography.heroFont

  // Auto-fit : on part de la taille demandée par le plan, on wrap avec une
  // mesure réelle des glyphes (measureText), et si le résultat déborde on
  // shrink. `MIN_FONT_SIZE_PT` est le PLANCHER d'auto-fit (on ne rétrécit pas
  // en dessous), PAS un gate : si le plan demande explicitement une taille
  // plus petite (ex: Critic qui shrinke trop), on la RESPECTE et on rend le
  // texte — mieux vaut un texte trop petit mais présent qu'une zone
  // silencieusement manquante.
  const roleMin = MIN_FONT_SIZE_BY_ROLE[zone.role] ?? MIN_FONT_SIZE_FALLBACK
  const autoFitFloor = Math.min(roleMin, requestedSizePt)
  const STEP = 0.5

  let sizePt = requestedSizePt
  let sizeMm = sizePt * PT_TO_MM
  let lineHeightMm = sizeMm * LINE_HEIGHT_RATIO
  let lines = wrapTextByMeasure(zone.content!, zone.bboxMm.w, sizeMm, fontFamily, weight)

  // On itère seulement si ça déborde ET qu'on peut encore rétrécir sans passer
  // sous le plancher. La première mesure est déjà calculée ci-dessus — donc
  // `lines` n'est jamais vide à la sortie tant que `content` est non vide.
  while (sizePt > autoFitFloor) {
    const totalH = lines.length * lineHeightMm
    const overflowsHeight = totalH > zone.bboxMm.h
    const anyLineOverflows = lines.some(
      (l) => measureTextWidthMm(l, sizeMm, fontFamily, weight) > zone.bboxMm.w,
    )
    if (!overflowsHeight && !anyLineOverflows) break
    sizePt = Math.max(autoFitFloor, sizePt - STEP)
    sizeMm = sizePt * PT_TO_MM
    lineHeightMm = sizeMm * LINE_HEIGHT_RATIO
    lines = wrapTextByMeasure(zone.content!, zone.bboxMm.w, sizeMm, fontFamily, weight)
  }
  if (lines.length === 0) return ''
  const totalTextHeight = lines.length * lineHeightMm
  const verticalPadding = Math.max(0, (zone.bboxMm.h - totalTextHeight) / 2)
  const baselineOffset = sizeMm * 0.82
  const firstBaselineY = zone.bboxMm.y + verticalPadding + baselineOffset

  // Alignement : plan.align prioritaire, sinon 'center' pour les rôles qui sont
  // portés par un rect (CTA, badges accent avec fill, price badge), 'left' sinon.
  const centerByDefault =
    !!zone.fill && (zone.role === 'cta' || zone.role === 'accent' || zone.role === 'price')
  const align = zone.align || (centerByDefault ? 'center' : 'left')
  const textAnchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const anchorX =
    align === 'center'
      ? zone.bboxMm.x + zone.bboxMm.w / 2
      : align === 'right'
        ? zone.bboxMm.x + zone.bboxMm.w
        : zone.bboxMm.x

  // UN SEUL <text> par zone = UN SEUL Textbox Fabric après parse → le
  // déplacement de l'objet déplace TOUT le paragraphe d'un bloc.
  //   - width=bboxMm.w : largeur de reflow pour Fabric Textbox
  //   - data-content : contenu ORIGINAL tel que fourni par le plan (avec \n
  //     explicites mais sans l'auto-wrap). svgToFabric l'utilise pour créer un
  //     Textbox qui re-wrappe NATURELLEMENT à sa largeur — sinon les tspans
  //     pré-wrappés seraient joints en lignes forcées et produiraient 6 lignes
  //     là où un paragraphe devrait en faire 2.
  //   - Les tspans visibles restent auto-wrappés pour que la rasterisation
  //     (Vision Critic) soit géométriquement correcte.
  const zoneWidthAttr = `width="${zone.bboxMm.w}"`
  const decoAttr = zone.decoration && zone.decoration !== 'none' ? ` text-decoration="${zone.decoration}"` : ''
  // Les \n explicites doivent survivre à la sérialisation XML → on les encode
  // via l'entité numérique (les parseurs d'attributs normalisent sinon \n → espace).
  const dataContentAttr = ` data-content="${escapeAttr(zone.content!).replace(/\n/g, '&#10;')}"`
  const attrs = `font-family="${escapeAttr(fontFamily)}" font-size="${sizeMm}" font-weight="${weight}" fill="${escapeAttr(color)}" text-anchor="${textAnchor}" ${zoneWidthAttr}${decoAttr}${dataContentAttr}`

  if (lines.length === 1) {
    return `<text id="${escapeAttr(zone.id)}" x="${anchorX}" y="${firstBaselineY}" ${attrs}>${escapeText(lines[0])}</text>`
  }

  const tspans = lines
    .map((line, i) => {
      const dyAttr = i === 0 ? '' : ` dy="${lineHeightMm}"`
      return `<tspan x="${anchorX}"${dyAttr}>${escapeText(line)}</tspan>`
    })
    .join('')
  return `<text id="${escapeAttr(zone.id)}" x="${anchorX}" y="${firstBaselineY}" ${attrs}>${tspans}</text>`
}

/**
 * Wrap par mesure réelle : une ligne explicite (séparée par \n) devient autant
 * de lignes wrappées que nécessaire pour tenir dans `maxWidthMm`. Les bullets
 * (`•`, `-`, `*`) sont détectés en début de ligne et re-préfixés à chaque
 * ligne de continuation pour préserver l'alignement visuel des paragraphes.
 */
function wrapTextByMeasure(
  raw: string,
  maxWidthMm: number,
  sizeMm: number,
  fontFamily: string,
  weight: number,
): string[] {
  const explicitLines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  const out: string[] = []
  for (const line of explicitLines) {
    if (measureTextWidthMm(line, sizeMm, fontFamily, weight) <= maxWidthMm) {
      out.push(line)
      continue
    }
    const words = line.split(/\s+/)
    let current = ''
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word
      if (measureTextWidthMm(candidate, sizeMm, fontFamily, weight) <= maxWidthMm) {
        current = candidate
      } else {
        if (current) out.push(current)
        current = word
      }
    }
    if (current) out.push(current)
  }
  return out
}

function pickZoneFill(role: string, palette: string[]): string | null {
  switch (role) {
    case 'accent':
      return palette[2] || palette[1] || null
    case 'cta':
      return palette[2] || palette[1] || null
    case 'price':
      return null
    case 'logo-slot':
      return null
    default:
      return null
  }
}

function pickTextColor(
  zone: DesignPlan['zones'][number],
  hier: DesignPlan['typography']['hierarchy'][number] | undefined,
  plan: DesignPlan,
): string {
  // textColor explicite (fourni par l'Art Director) = priorité absolue.
  if (zone.textColor) return zone.textColor

  // Les rôles qui émettent un rect de fond : zone.fill = couleur du rect (fond),
  // donc le texte doit contraster.
  const emitsBgRect = ['background', 'accent', 'cta', 'price', 'logo-slot'].includes(zone.role)
  if (emitsBgRect) {
    if (hier?.color && hier.color !== zone.fill) return hier.color
    return contrastingColor(zone.fill || plan.palette[0] || '#FFFFFF')
  }

  // Zones texte pures (title, subtitle, body) : zone.fill est la couleur du texte.
  if (zone.fill) return zone.fill
  if (hier?.color) return hier.color
  return plan.palette[plan.palette.length - 1] || '#000000'
}

function contrastingColor(bgHex: string): string {
  const hex = bgHex.replace('#', '').trim()
  if (hex.length !== 6) return '#FFFFFF'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return '#FFFFFF'
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#111111' : '#FFFFFF'
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
