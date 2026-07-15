import { forwardRef, useRef, useState, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import type { GradientConfig } from '@/stores/editor.store'
import { gradientToCss } from '@/components/shared/GradientPicker'
import type { ConditionalRule, RuleEffect } from '@/features/merge/conditionalRules'
import { PromoSelectionOverlay } from './PromoSelectionOverlay'

export interface RetailCardData {
  name: string
  brand?: string
  ref?: string
  category?: string
  description?: string
  descriptionRich?: string
  priceNow: string
  priceWas?: string
  priceLabel?: string
  unitPrice?: string
  remiseLabel?: string
  validite?: string
  imageUrl?: string
  ean?: string
  unit?: string
  mentions?: string
  enseigne?: string
  /** Champs libres, valeurs seules (sans label), ordre = customFields. */
  details: string[]
}

export type PromoColorKey =
  | 'category' | 'name' | 'brand' | 'description'
  | 'priceLabel' | 'priceWas' | 'unitPrice' | 'priceNow' | 'footer'

export type PromoBlockId =
  | 'header' | 'image' | 'badge' | 'price' | 'footer' | 'details'
  | 'category' | 'name' | 'brand' | 'description'
  | 'priceLabel' | 'priceWas' | 'unitPrice' | 'priceNow'

/** Variantes de mise en page curées (structure graphique, pas seulement les couleurs). */
export const PROMO_LAYOUT_IDS = ['classique', 'photo-cover', 'prix-fort', 'minimal'] as const
export type PromoLayoutId = typeof PROMO_LAYOUT_IDS[number]
export const PROMO_LAYOUTS: { id: PromoLayoutId; label: string; hint: string }[] = [
  { id: 'classique', label: 'Classique', hint: 'En-tête / photo / bandeau prix empilés' },
  { id: 'photo-cover', label: 'Photo plein cadre', hint: 'Photo en fond, bandeaux en surimpression' },
  { id: 'prix-fort', label: 'Prix dominant', hint: 'Grand bloc prix en bas, gros chiffre' },
  { id: 'minimal', label: 'Minimal', hint: 'Fond blanc, filets accent, étiquette rayon' },
]

/** Réglages que le CSS ne peut pas surcharger (styles inline) : couleurs de texte + échelle du prix selon la variante. */
export interface LayoutTune {
  priceFontScale: number
  headerColor?: string   // texte de l'en-tête (surcharge idealText)
  categoryColor?: string // texte du chip catégorie
  priceColor?: string    // texte du bandeau prix
}
export function layoutTune(config: PromoTemplateConfig): LayoutTune {
  switch (config.layout ?? 'classique') {
    case 'photo-cover': return { priceFontScale: 1, headerColor: '#ffffff' }
    case 'prix-fort': return { priceFontScale: 1.45 }
    case 'minimal': return { priceFontScale: 1.2, headerColor: '#111827', categoryColor: config.accent, priceColor: config.accent }
    default: return { priceFontScale: 1 }
  }
}

/** Caractéristiques typographiques + remplissage d'un sous-élément texte. */
export interface ElementStyle {
  fontFamily?: string
  fontSize?: number                 // px (priceNow : remplace la taille auto)
  fontWeight?: number               // 400…900
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  letterSpacing?: number            // em
  lineHeight?: number               // sans unité
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  width?: number                    // px (resize horizontal d'un texte → retour à la ligne)
  euroSep?: boolean                 // prix : « € » comme séparateur décimal (327€78)
  fillType?: 'solid' | 'gradient'
  fill?: string                     // couleur unie
  gradient?: GradientConfig
}

/** Remplissage de fond d'un bloc déco (PNG-safe, y compris dégradé). */
export interface BlockFill {
  fillType: 'solid' | 'gradient'
  fill?: string
  gradient?: GradientConfig
}

/** Attributs « forme » universels (texte ET bloc) : opacité, fusion, ombre, contour, rotation, ordre. */
export interface ShapeStyle {
  opacity?: number                                   // 0..1
  blendMode?: string                                 // mix-blend-mode (⚠ non rendu au PNG)
  rotation?: number                                  // degrés
  zIndex?: number                                    // ordre d'empilement
  shadow?: { x: number; y: number; blur: number; color: string } | null  // texte→text-shadow, bloc→box-shadow
  stroke?: { width: number; color: string } | null  // texte→-webkit-text-stroke, bloc→border
}

export interface PromoTemplateConfig {
  layout?: PromoLayoutId // variante de mise en page (défaut : classique)
  accent: string        // accroche + badge + bandeau prix
  headerBg: string      // bandeau d'en-tête + pied
  fontHeading: string   // nom / accroche / badge
  fontPrice: string     // prix
  colors: Partial<Record<PromoColorKey, string>> // surcharge couleur par donnée (legacy)
  styles?: Partial<Record<PromoColorKey, ElementStyle>> // caractéristiques typo/remplissage par donnée
  offsets: Partial<Record<PromoBlockId, { dx: number; dy: number }>> // déplacement par bloc
  scales?: Partial<Record<PromoBlockId, { sx: number; sy: number }>> // resize (échelle) par bloc déco
  blockFills?: Partial<Record<PromoBlockId, BlockFill>> // fond (uni/dégradé) des blocs déco
  shapes?: Partial<Record<PromoBlockId, ShapeStyle>> // opacité/fusion/ombre/contour/rotation/ordre
  hidden?: Partial<Record<PromoBlockId, boolean>> // visibilité par bloc (panneau Calques)
  rules?: Partial<Record<PromoBlockId, ConditionalRule[]>> // règles conditionnelles par élément
  showCategory: boolean
  showDescription: boolean
  showUnitPrice: boolean
  showBadge: boolean
  showFooter: boolean
}

/** Sous-éléments texte sélectionnables/stylables (typo + resize fontSize/largeur). */
export const STYLE_KEYS: PromoColorKey[] = [
  'category', 'name', 'brand', 'description',
  'priceLabel', 'priceWas', 'unitPrice', 'priceNow', 'footer',
]
/** Blocs déco sélectionnables (fond uni/dégradé + resize par échelle). */
const DECO_BLOCKS: PromoBlockId[] = ['header', 'image', 'badge', 'price', 'details']
/** Textes éditables inline (double-clic dans la carte). */
const EDITABLE_TEXT: PromoColorKey[] = ['category', 'name', 'brand', 'description', 'priceLabel']
const SELECTABLE: PromoBlockId[] = [...(STYLE_KEYS as PromoBlockId[]), ...DECO_BLOCKS]

export const FONT_OPTIONS = [
  'Montserrat', 'Oswald', 'Poppins', 'Archivo', 'Bebas Neue', 'Anton', 'Playfair Display', 'Inter',
  'Roboto', 'Lato', 'Raleway', 'Nunito', 'Rubik', 'Work Sans', 'Barlow Condensed', 'Jura',
] as const

export const DEFAULT_PROMO_CONFIG: PromoTemplateConfig = {
  layout: 'classique',
  accent: '#ef4444',
  headerBg: '#111827',
  fontHeading: 'Montserrat',
  fontPrice: 'Montserrat',
  colors: {},
  styles: {},
  offsets: {},
  scales: {},
  blockFills: {},
  shapes: {},
  hidden: {},
  rules: {},
  showCategory: true,
  showDescription: true,
  showUnitPrice: true,
  showBadge: true,
  showFooter: true,
}

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Oswald:wght@500;600;700&family=Poppins:wght@500;600;700;800&family=Archivo:wght@600;700;800;900&family=Bebas+Neue&family=Anton&family=Playfair+Display:wght@600;700;800;900&family=Inter:wght@500;600;700' +
  '&family=Roboto:wght@500;700;900&family=Lato:wght@700;900&family=Raleway:wght@600;700;800&family=Nunito:wght@600;700;800&family=Rubik:wght@600;700;800&family=Work+Sans:wght@600;700;800&family=Barlow+Condensed:wght@600;700&family=Jura:wght@600;700&display=swap'

/** Charge une fois toutes les polices proposées (nécessaire pour html2canvas). */
function ensurePromoFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('promo-fonts')) return
  const link = document.createElement('link')
  link.id = 'promo-fonts'; link.rel = 'stylesheet'; link.href = FONTS_HREF
  document.head.appendChild(link)
}
ensurePromoFonts()

/** CSS du template — couleurs/polices pilotées par variables. Partagé carte React + export HTML. */
export const PROMO_CSS = `
.rp-card * { margin:0; padding:0; box-sizing:border-box; }
.rp-card { position:relative; width:595px; height:842px; background:#fff; overflow:hidden;
  display:flex; flex-direction:column; font-family:'Montserrat','Inter',system-ui,sans-serif; color:#111827; }
.rp-head { background:var(--rp-head,#111827); color:#fff; padding:30px 40px 26px; display:flex; flex-direction:column; gap:8px; }
.rp-kicker { align-self:flex-start; background:var(--rp-accent,#ef4444); color:#fff; font-family:var(--rp-font-h); font-weight:800; font-size:14px;
  letter-spacing:.18em; text-transform:uppercase; padding:6px 14px; border-radius:4px; }
.rp-name { font-family:var(--rp-font-h); font-weight:800; font-size:44px; line-height:1.03; letter-spacing:-.01em; }
.rp-brand { color:#9ca3af; font-weight:600; font-size:17px; }
.rp-desc { color:#cbd5e1; font-weight:500; font-size:15px; line-height:1.3; margin-top:4px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.rp-details { background:#f8fafc; color:#334155; padding:12px 40px; display:flex; flex-direction:column; gap:3px;
  font-size:14px; line-height:1.3; border-top:1px solid #e2e8f0; }
.rp-detail { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rp-unit { font-weight:600; font-size:15px; opacity:.85; margin-top:2px; }
.rp-product { position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:36px;
  background:radial-gradient(120% 90% at 50% 30%, #f1f5f9 0%, #ffffff 70%); }
.rp-product img { max-width:84%; max-height:100%; object-fit:contain; filter:drop-shadow(0 24px 30px rgba(15,23,42,.18)); }
.rp-ph { width:78%; height:74%; border-radius:16px; background:repeating-linear-gradient(45deg,#e9eef5 0 18px,#eef2f8 18px 36px);
  display:flex; align-items:center; justify-content:center; color:#94a3b8; font-weight:700; letter-spacing:.12em; font-size:13px; }
.rp-badge { position:absolute; top:28px; right:34px; width:150px; height:150px; border-radius:50%; background:var(--rp-accent,#ef4444); color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 10px 24px rgba(15,23,42,.25); }
.rp-pct { font-family:var(--rp-font-h); font-weight:900; font-size:50px; line-height:.9; }
.rp-pctlbl { font-weight:700; font-size:12px; letter-spacing:.14em; text-transform:uppercase; margin-top:2px; }
.rp-price { background:var(--rp-accent,#ef4444); color:#fff; padding:26px 40px 30px; display:flex; align-items:flex-end; justify-content:space-between; }
.rp-plabel { font-weight:700; font-size:14px; letter-spacing:.2em; text-transform:uppercase; opacity:.9; }
.rp-was { font-size:25px; font-weight:600; text-decoration:line-through; opacity:.7; }
.rp-left { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
.rp-now { font-family:var(--rp-font-p); font-weight:900; line-height:.85; letter-spacing:-.02em; white-space:nowrap;
  display:flex; align-items:baseline; gap:6px; justify-content:flex-end; }
.rp-cur { font-size:.5em; font-weight:800; }
.rp-foot { background:var(--rp-head,#111827); color:#9ca3af; font-size:12px; padding:10px 40px; text-align:center; letter-spacing:.03em; min-height:38px; }

/* ── Variante « photo-cover » : photo plein cadre, bandeaux en surimpression ── */
.rp-card[data-layout="photo-cover"] { display:block; }
.rp-card[data-layout="photo-cover"] .rp-product { position:absolute; inset:0; z-index:0; padding:0; background:#0b1020; }
.rp-card[data-layout="photo-cover"] .rp-product img { max-width:100%; max-height:100%; width:100%; height:100%; object-fit:cover; filter:none; }
.rp-card[data-layout="photo-cover"] .rp-ph { width:100%; height:100%; border-radius:0; }
.rp-card[data-layout="photo-cover"] .rp-head { position:absolute; top:0; left:0; right:0; z-index:2; background:linear-gradient(180deg, rgba(2,6,23,.78) 0%, rgba(2,6,23,0) 100%); padding:34px 40px 78px; }
.rp-card[data-layout="photo-cover"] .rp-price { position:absolute; bottom:0; left:0; right:0; z-index:2; }
.rp-card[data-layout="photo-cover"] .rp-badge { z-index:3; }
.rp-card[data-layout="photo-cover"] .rp-foot { display:none; }
.rp-card[data-layout="photo-cover"] .rp-details { display:none; }

/* ── Variante « prix-fort » : grand bloc prix dominant en bas ── */
.rp-card[data-layout="prix-fort"] .rp-head { padding:22px 40px 16px; gap:4px; }
.rp-card[data-layout="prix-fort"] .rp-name { font-size:36px; }
.rp-card[data-layout="prix-fort"] .rp-product { flex:0 0 40%; padding:22px; }
.rp-card[data-layout="prix-fort"] .rp-price { flex:1; align-items:center; padding:30px 44px; }
.rp-card[data-layout="prix-fort"] .rp-plabel { font-size:18px; }

/* ── Variante « minimal » : fond blanc, filets accent, étiquette rayon ── */
.rp-card[data-layout="minimal"] { background:#fff; }
.rp-card[data-layout="minimal"] .rp-head { background:#fff; border-bottom:3px solid var(--rp-accent,#ef4444); padding:34px 40px 20px; }
.rp-card[data-layout="minimal"] .rp-kicker { background:transparent; padding:0; letter-spacing:.24em; }
.rp-card[data-layout="minimal"] .rp-brand { color:#6b7280; }
.rp-card[data-layout="minimal"] .rp-desc { color:#475569; }
.rp-card[data-layout="minimal"] .rp-product { background:#fff; }
.rp-card[data-layout="minimal"] .rp-price { background:#fff; border-top:3px solid var(--rp-accent,#ef4444); align-items:center; }
.rp-card[data-layout="minimal"] .rp-was { color:#9ca3af; }
.rp-card[data-layout="minimal"] .rp-foot { background:#fff; color:#94a3b8; }
`

/** Découpe « 1 144,29 € » (ou « 327€78 ») en montant + symbole/centimes, et choisit une taille qui tient sur une ligne. */
export function splitPrice(priceNow: string): { amount: string; cur: string; fontSize: number } {
  const t = (priceNow || '').trim()
  const sizeFor = (a: string) => (a.length <= 6 ? 88 : a.length <= 8 ? 68 : 54)
  // Format « € séparateur » : 327€78 → montant « 327 », exposant « €78 ».
  const euroMid = t.match(/^(.+?)€(\d{2})$/)
  if (euroMid) { const amount = euroMid[1].trim(); return { amount, cur: `€${euroMid[2]}`, fontSize: sizeFor(amount) } }
  const m = t.match(/^(.*?)\s*([€$£])\s*$/)
  const amount = m ? m[1].trim() : t
  const cur = m ? m[2] : ''
  return { amount, cur, fontSize: sizeFor(amount) }
}

/**
 * Style effectif d'un sous-élément (source unique : aperçu, PNG et export HTML).
 * Précédence remplissage : styles.gradient/fill > colors[key] (legacy) > défaut hérité.
 * `capturing` aplatit le dégradé-texte en couleur unie (html2canvas ne sait pas clipper le texte).
 */
function resolveElementStyle(
  config: PromoTemplateConfig,
  key: PromoColorKey,
  opts?: { capturing?: boolean },
): React.CSSProperties {
  const st = config.styles?.[key]
  const css: React.CSSProperties = {}
  if (st?.fontFamily) css.fontFamily = `'${st.fontFamily}', sans-serif`
  if (st?.fontSize) css.fontSize = st.fontSize
  if (st?.width) { css.width = st.width; css.whiteSpace = 'normal' }
  if (st?.fontWeight) css.fontWeight = st.fontWeight
  if (st?.fontStyle) css.fontStyle = st.fontStyle
  if (st?.textAlign) css.textAlign = st.textAlign
  if (st?.letterSpacing != null) css.letterSpacing = `${st.letterSpacing}em`
  if (st?.lineHeight != null) css.lineHeight = st.lineHeight
  if (st?.textTransform) css.textTransform = st.textTransform
  const fillType = st?.fillType ?? (st?.gradient ? 'gradient' : st?.fill ? 'solid' : undefined)
  if (fillType === 'gradient' && st?.gradient) {
    if (opts?.capturing) {
      css.color = st.gradient.stops[0]?.color ?? '#000000'
    } else {
      css.backgroundImage = gradientToCss(st.gradient)
      css.WebkitBackgroundClip = 'text'
      css.backgroundClip = 'text'
      css.color = 'transparent'
      css.WebkitTextFillColor = 'transparent'
    }
  } else if (fillType === 'solid' && st?.fill) {
    css.color = st.fill
  } else if (config.colors[key]) {
    css.color = config.colors[key]
  }
  return css
}

const UNITLESS = new Set(['fontWeight', 'lineHeight', 'opacity', 'zIndex'])
/** Sérialise des CSSProperties en chaîne inline (export HTML). Gère les préfixes Webkit. */
function cssToInline(css: React.CSSProperties): string {
  return Object.entries(css)
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      const val = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v)
      return `${prop}:${val}`
    })
    .join(';')
}

/** Style effectif d'un sous-élément en chaîne inline (export HTML : dégradé réel). */
export function elementCss(config: PromoTemplateConfig, key: PromoColorKey): string {
  return cssToInline(resolveElementStyle(config, key))
}

/** Fond effectif d'un bloc déco (uni ou dégradé) — PNG-safe. Renvoie {} si non personnalisé. */
function resolveBlockBg(config: PromoTemplateConfig, id: PromoBlockId): React.CSSProperties {
  const bf = config.blockFills?.[id]
  if (!bf) return {}
  if (bf.fillType === 'gradient' && bf.gradient) return { background: gradientToCss(bf.gradient) }
  if (bf.fill) return { background: bf.fill }
  return {}
}
/** Fond d'un bloc déco en chaîne inline (export HTML). */
export function blockBgCss(config: PromoTemplateConfig, id: PromoBlockId): string {
  return cssToInline(resolveBlockBg(config, id))
}

/** Transform (décalage + échelle + rotation) + attributs forme (opacité/fusion/ombre/contour/ordre) — source unique rendu/export. */
function blockBoxCss(config: PromoTemplateConfig, id: PromoBlockId): React.CSSProperties {
  const o = config.offsets[id], sc = config.scales?.[id], sh = config.shapes?.[id]
  const isText = (STYLE_KEYS as PromoBlockId[]).includes(id)
  const t: string[] = []
  if (o) t.push(`translate(${o.dx}px, ${o.dy}px)`)
  if (sc) t.push(`scale(${sc.sx}, ${sc.sy})`)
  if (sh?.rotation) t.push(`rotate(${sh.rotation}deg)`)
  const css: React.CSSProperties = {}
  if (t.length) { css.transform = t.join(' '); if (sc || sh?.rotation) css.transformOrigin = 'top left' }
  if (sh?.opacity != null) css.opacity = sh.opacity
  if (sh?.blendMode && sh.blendMode !== 'normal') css.mixBlendMode = sh.blendMode as React.CSSProperties['mixBlendMode']
  if (sh?.zIndex != null) css.zIndex = sh.zIndex
  if (sh?.shadow) css[isText ? 'textShadow' : 'boxShadow'] = `${sh.shadow.x}px ${sh.shadow.y}px ${sh.shadow.blur}px ${sh.shadow.color}`
  if (sh?.stroke) { if (isText) css.WebkitTextStroke = `${sh.stroke.width}px ${sh.stroke.color}`; else css.border = `${sh.stroke.width}px solid ${sh.stroke.color}` }
  return css
}
/** blockBoxCss en chaîne inline (export HTML). */
export function blockBoxCssString(config: PromoTemplateConfig, id: PromoBlockId): string {
  return cssToInline(blockBoxCss(config, id))
}

/** Couleur de texte lisible (noir/blanc) selon la luminance du fond — évite blanc sur fond clair. */
export function idealText(hex: string): string {
  const h = (hex || '').replace('#', '')
  if (h.length < 6) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111827' : '#ffffff'
}

interface CardProps {
  data: RetailCardData
  config?: PromoTemplateConfig
  /** Active le glisser-déposer + la sélection + les poignées de resize (aperçu éditable). */
  editable?: boolean
  onMoveBlock?: (id: PromoBlockId, dx: number, dy: number) => void
  /** Bloc sélectionné (contour + poignées + cible du panneau de propriétés). */
  selectedKey?: PromoBlockId | null
  onSelect?: (id: PromoBlockId) => void
  /** Resize d'un texte (fontSize / largeur). */
  onResizeText?: (key: PromoColorKey, patch: { fontSize?: number; width?: number }) => void
  /** Resize d'un bloc déco (échelle + ancrage du décalage). */
  onScaleBlock?: (id: PromoBlockId, sx: number, sy: number, dx: number, dy: number) => void
  /** Édition inline du texte d'un élément (double-clic) → surcharge pour ce produit. */
  onEditText?: (key: PromoColorKey, value: string) => void
  /** Effets des règles conditionnelles pour le produit courant (par bloc). */
  effects?: Partial<Record<PromoBlockId, RuleEffect>>
  /** Aplatit le dégradé-texte et masque contour/poignées (capture PNG fidèle). */
  capturing?: boolean
}

/** Carte Création studio (HTML/CSS) — design data-driven, couleurs/polices/champs/positions configurables. */
export const RetailPromoCard = forwardRef<HTMLDivElement, CardProps>(
  ({ data, config = DEFAULT_PROMO_CONFIG, editable = false, onMoveBlock, selectedKey = null, onSelect, onResizeText, onScaleBlock, onEditText, effects, capturing = false }, ref) => {
    const { amount, cur, fontSize } = splitPrice(data.priceNow)
    const tune = layoutTune(config)
    const hText = tune.headerColor ?? idealText(config.headerBg)
    const aText = idealText(config.accent)
    const catText = tune.categoryColor ?? aText
    const priceText = tune.priceColor ?? aText
    const priceFontSize = Math.round(fontSize * tune.priceFontScale)
    const cardElRef = useRef<HTMLDivElement | null>(null)
    const blockEls = useRef(new Map<PromoBlockId, HTMLElement | null>())
    const setters = useRef(new Map<PromoBlockId, (el: HTMLElement | null) => void>())
    // Callback ref stable par bloc (évite le thrash des refs à chaque render).
    const setEl = (id: PromoBlockId) => {
      let fn = setters.current.get(id)
      if (!fn) { fn = (el) => { blockEls.current.set(id, el) }; setters.current.set(id, fn) }
      return fn
    }
    // Stable : un callback ref recréé à chaque render serait rappelé avec null (thrash → rect effacé).
    const setRefs = useCallback((el: HTMLDivElement | null) => {
      cardElRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
    }, [ref])

    // ── Édition inline du texte (double-clic) ───────────────────────────────────
    const [editingKey, setEditingKey] = useState<PromoColorKey | null>(null)
    const clickPos = useRef<{ x: number; y: number } | null>(null)
    useEffect(() => {
      if (!editingKey) return
      const el = blockEls.current.get(editingKey)
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      const pos = clickPos.current; clickPos.current = null
      // Curseur à l'endroit cliqué (caretRangeFromPoint) ; repli : fin du texte.
      const fromPoint = pos && (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(pos.x, pos.y)
      const range = (fromPoint && el.contains(fromPoint.startContainer)) ? fromPoint : (() => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); return r })()
      sel?.removeAllRanges(); sel?.addRange(range)
    }, [editingKey])
    const canEdit = (key: PromoColorKey) => editable && !!onEditText && EDITABLE_TEXT.includes(key)
    const startEdit = (key: PromoColorKey, x?: number, y?: number) => { clickPos.current = (x != null && y != null) ? { x, y } : null; onSelect?.(key); setEditingKey(key) }
    const editProps = (key: PromoColorKey): React.HTMLAttributes<HTMLElement> => {
      if (!canEdit(key)) return {}
      if (editingKey !== key) return { onDoubleClick: (e) => { e.stopPropagation(); startEdit(key, e.clientX, e.clientY) }, title: 'Double-cliquez pour éditer' }
      return {
        contentEditable: true, suppressContentEditableWarning: true,
        onDoubleClick: (e) => e.stopPropagation(),
        // Laisse le clic placer le curseur dans le texte sans déclencher le drag du bloc parent.
        onPointerDown: (e) => e.stopPropagation(),
        onBlur: (e) => { onEditText!(key, (e.currentTarget.innerText || '').replace(/\s*\n\s*/g, ' ').trim()); setEditingKey(null) },
        onKeyDown: (e) => {
          if (e.key === 'Escape') { e.preventDefault(); setEditingKey(null) }
          else if (e.key === 'Enter' && key !== 'description') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() }
        },
      }
    }

    const startDrag = (e: ReactPointerEvent, id: PromoBlockId) => {
      if (!editable) return
      e.stopPropagation()
      if (onSelect && SELECTABLE.includes(id)) onSelect(id)
      if (!onMoveBlock) return
      e.preventDefault()
      const rect = cardElRef.current?.getBoundingClientRect()
      const scale = rect && rect.width ? rect.width / 595 : 1
      const o = config.offsets[id] ?? { dx: 0, dy: 0 }
      const sx = e.clientX, sy = e.clientY
      const move = (ev: PointerEvent) =>
        onMoveBlock(id, Math.round(o.dx + (ev.clientX - sx) / scale), Math.round(o.dy + (ev.clientY - sy) / scale))
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
    // Style commun d'un bloc : transform (décalage + échelle) + curseur + contour de sélection.
    const blk = (id: PromoBlockId, extra?: React.CSSProperties): React.CSSProperties => {
      const selected = editable && !capturing && selectedKey === id
      const css: React.CSSProperties = {
        ...blockBoxCss(config, id),
        ...(config.hidden?.[id] ? { display: 'none' } : null),
        ...(editable ? { cursor: editingKey === id ? 'text' : 'move' } : null),
        ...(selected ? { outline: '2px solid #6366f1', outlineOffset: 2, borderRadius: 2 } : null),
        ...extra,
      }
      // Effet des règles conditionnelles (produit courant) — l'emporte sur le style statique.
      const ef = effects?.[id]
      if (ef) {
        if (ef.visible === false) css.display = 'none'
        if (ef.opacity != null) css.opacity = ef.opacity
        // « Changer la couleur » : texte → couleur du texte ; bloc déco → fond.
        if (ef.fill) { if ((STYLE_KEYS as PromoBlockId[]).includes(id)) css.color = ef.fill; else css.background = ef.fill }
        if (ef.zOrder) css.zIndex = ef.zOrder === 'front' ? 999 : -1
        if (ef.scale && ef.scale !== 1) css.transform = `${css.transform ?? ''} scale(${ef.scale})`.trim()
      }
      return css
    }
    const es = (key: PromoColorKey) => resolveElementStyle(config, key, { capturing })
    const bg = (id: PromoBlockId) => resolveBlockBg(config, id)
    const drag = (id: PromoBlockId) => (editable && editingKey !== id ? { onPointerDown: (e: ReactPointerEvent) => startDrag(e, id) } : {})

    return (
      <div ref={setRefs} className="rp-card" data-layout={config.layout ?? 'classique'} style={styleVars(config)}>
        <style>{PROMO_CSS}</style>
        <div ref={setEl('header')} className="rp-head" style={blk('header', { color: hText, ...bg('header') })} {...drag('header')}>
          {config.showCategory && <span ref={setEl('category')} className="rp-kicker" style={blk('category', { color: catText, ...es('category') })} {...drag('category')} {...editProps('category')}>{data.category || 'Offre spéciale'}</span>}
          <div ref={setEl('name')} className="rp-name" style={blk('name', es('name'))} {...drag('name')} {...editProps('name')}>{data.name || 'Produit'}</div>
          {(data.brand || data.ref || data.ean) && (
            <div ref={setEl('brand')} className="rp-brand" style={blk('brand', es('brand'))} {...drag('brand')} {...editProps('brand')}>{[data.brand, data.ref, data.ean].filter(Boolean).join(' · ')}</div>
          )}
          {config.showDescription && data.description && <div ref={setEl('description')} className="rp-desc" style={blk('description', es('description'))} {...drag('description')} {...editProps('description')}>{data.description}</div>}
        </div>
        <div className="rp-product" style={bg('image')}>
          {data.imageUrl
            ? <img ref={setEl('image')} src={data.imageUrl} crossOrigin="anonymous" alt={data.name} style={blk('image')} {...drag('image')} />
            : <div className="rp-ph">PHOTO PRODUIT</div>}
          {config.showBadge && data.remiseLabel && (
            <div ref={setEl('badge')} className="rp-badge" style={blk('badge', { color: aText, ...bg('badge') })} {...drag('badge')}>
              <span className="rp-pct">{data.remiseLabel}</span>
              <span className="rp-pctlbl">de remise</span>
            </div>
          )}
        </div>
        {!config.hidden?.details && data.details.length > 0 && (
          <div ref={setEl('details')} className="rp-details" style={blk('details', bg('details'))} {...drag('details')}>
            {data.details.map((d, i) => <div key={i} className="rp-detail">{d}</div>)}
          </div>
        )}
        <div ref={setEl('price')} className="rp-price" style={blk('price', { color: priceText, ...bg('price') })} {...drag('price')}>
          <div className="rp-left">
            <span ref={setEl('priceLabel')} className="rp-plabel" style={blk('priceLabel', es('priceLabel'))} {...drag('priceLabel')} {...editProps('priceLabel')}>{data.priceLabel || 'Prix promo'}</span>
            {data.priceWas && <span ref={setEl('priceWas')} className="rp-was" style={blk('priceWas', es('priceWas'))} {...drag('priceWas')}>{data.priceWas}</span>}
            {config.showUnitPrice && data.unitPrice && <span ref={setEl('unitPrice')} className="rp-unit" style={blk('unitPrice', es('unitPrice'))} {...drag('unitPrice')}>{data.unitPrice}</span>}
          </div>
          <div ref={setEl('priceNow')} className="rp-now" style={blk('priceNow', { fontSize: priceFontSize, ...es('priceNow') })} {...drag('priceNow')}>
            {amount}{cur && <span className="rp-cur">{cur}</span>}{data.unit && <span className="rp-cur">{data.unit}</span>}
          </div>
        </div>
        {config.showFooter && <div ref={setEl('footer')} className="rp-foot" style={blk('footer', es('footer'))} {...drag('footer')} {...editProps('footer')}>{[data.enseigne, data.validite, data.mentions].filter(Boolean).join(' — ')}</div>}
        {editable && !capturing && selectedKey && !editingKey && (
          <PromoSelectionOverlay
            cardRef={cardElRef}
            getEl={() => (selectedKey ? blockEls.current.get(selectedKey) ?? null : null)}
            selected={selectedKey}
            isText={(STYLE_KEYS as PromoBlockId[]).includes(selectedKey)}
            config={config}
            onResizeText={onResizeText}
            onScaleBlock={onScaleBlock}
          />
        )}
      </div>
    )
  },
)
RetailPromoCard.displayName = 'RetailPromoCard'

function styleVars(config: PromoTemplateConfig): React.CSSProperties {
  return {
    '--rp-accent': config.accent, '--rp-head': config.headerBg,
    '--rp-font-h': `'${config.fontHeading}', sans-serif`, '--rp-font-p': `'${config.fontPrice}', sans-serif`,
  } as React.CSSProperties
}
