// Rendu CSS de la carte promo : feuille de style du gabarit, découpe du prix et
// résolution des styles effectifs (typo, remplissage, transformations).
//
// SOURCE UNIQUE partagée par l'aperçu React, la capture PNG et l'export HTML :
// toute divergence entre ces trois rendus se corrige ICI.
import type React from 'react'
import { gradientToCss } from '@/components/shared/GradientPicker'
import { STYLE_KEYS, type PromoTemplateConfig, type PromoColorKey, type PromoBlockId, type LayoutTune } from './promoCardTypes'

/** Réglages que le CSS ne peut pas surcharger (styles inline), selon la variante. */
export function layoutTune(config: PromoTemplateConfig): LayoutTune {
  switch (config.layout ?? 'classique') {
    case 'photo-cover': return { priceFontScale: 1, headerColor: '#ffffff' }
    case 'prix-fort': return { priceFontScale: 1.45 }
    case 'minimal': return { priceFontScale: 1.2, headerColor: '#111827', categoryColor: config.accent, priceColor: config.accent }
    default: return { priceFontScale: 1 }
  }
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
/** Luminance relative WCAG d'un hex #rrggbb. */
function relLum(hex: string): number {
  const h = (hex || '').replace('#', '')
  if (h.length < 6) return 1
  const lin = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
/** Ratio de contraste WCAG entre deux couleurs. */
function contrastRatio(a: string, b: string): number {
  const la = relLum(a), lb = relLum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
/** Fond effectif de l'en-tête selon le layout (le bandeau passe en blanc en « minimal »). */
function effectiveHeaderBg(config: PromoTemplateConfig): string {
  if (config.layout === 'minimal') return '#ffffff'
  if (config.layout === 'photo-cover') return '#0b1020'
  return config.headerBg || '#111827'
}
/** Textes de l'en-tête posés directement sur le fond du bandeau (garde-fou lisibilité). */
const HEADER_TEXT_KEYS = new Set<PromoColorKey>(['name', 'brand', 'description'])
/** Repli LISIBLE (bleu) quand une couleur de texte d'en-tête a un contraste trop
 *  faible sur son fond — évite le titre jaune illisible sur bandeau blanc. Un
 *  contraste correct est laissé intact. */
function ensureReadable(color: string, bg: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color
  if (contrastRatio(color, bg) >= 3) return color
  return relLum(bg) > 0.5 ? '#1d4ed8' : '#93c5fd' // bleu foncé sur clair, bleu clair sur sombre
}

export function resolveElementStyle(
  config: PromoTemplateConfig,
  key: PromoColorKey,
  opts?: { capturing?: boolean },
): React.CSSProperties {
  const guard = (c: string) => (HEADER_TEXT_KEYS.has(key) ? ensureReadable(c, effectiveHeaderBg(config)) : c)
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
    css.color = guard(st.fill)
  } else if (config.colors[key]) {
    css.color = guard(config.colors[key])
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
export function resolveBlockBg(config: PromoTemplateConfig, id: PromoBlockId): React.CSSProperties {
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
export function blockBoxCss(config: PromoTemplateConfig, id: PromoBlockId): React.CSSProperties {
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
