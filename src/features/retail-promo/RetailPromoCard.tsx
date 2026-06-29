import { forwardRef, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface RetailCardData {
  name: string
  brand?: string
  ref?: string
  category?: string
  description?: string
  priceNow: string
  priceWas?: string
  unitPrice?: string
  remiseLabel?: string
  validite?: string
  imageUrl?: string
}

export type PromoColorKey =
  | 'category' | 'name' | 'brand' | 'description'
  | 'priceLabel' | 'priceWas' | 'unitPrice' | 'priceNow' | 'footer'

export type PromoBlockId = 'header' | 'image' | 'badge' | 'price' | 'footer'

export interface PromoTemplateConfig {
  accent: string        // accroche + badge + bandeau prix
  headerBg: string      // bandeau d'en-tête + pied
  fontHeading: string   // nom / accroche / badge
  fontPrice: string     // prix
  colors: Partial<Record<PromoColorKey, string>> // surcharge couleur par donnée
  offsets: Partial<Record<PromoBlockId, { dx: number; dy: number }>> // déplacement par bloc
  showCategory: boolean
  showDescription: boolean
  showUnitPrice: boolean
  showBadge: boolean
  showFooter: boolean
}

export const FONT_OPTIONS = ['Montserrat', 'Oswald', 'Poppins', 'Archivo', 'Bebas Neue', 'Anton', 'Playfair Display', 'Inter'] as const

export const DEFAULT_PROMO_CONFIG: PromoTemplateConfig = {
  accent: '#ef4444',
  headerBg: '#111827',
  fontHeading: 'Montserrat',
  fontPrice: 'Montserrat',
  colors: {},
  offsets: {},
  showCategory: true,
  showDescription: true,
  showUnitPrice: true,
  showBadge: true,
  showFooter: true,
}

export const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Oswald:wght@500;600;700&family=Poppins:wght@500;600;700;800&family=Archivo:wght@600;700;800;900&family=Bebas+Neue&family=Anton&family=Playfair+Display:wght@600;700;800;900&family=Inter:wght@500;600;700&display=swap'

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
`

/** Découpe « 1 144,29 € » en montant + symbole, et choisit une taille qui tient sur une ligne. */
export function splitPrice(priceNow: string): { amount: string; cur: string; fontSize: number } {
  const t = (priceNow || '').trim()
  const m = t.match(/^(.*?)\s*([€$£])\s*$/)
  const amount = m ? m[1].trim() : t
  const cur = m ? m[2] : ''
  const fontSize = amount.length <= 6 ? 88 : amount.length <= 8 ? 68 : 54
  return { amount, cur, fontSize }
}

const col = (c: PromoTemplateConfig, k: PromoColorKey) => (c.colors[k] ? { color: c.colors[k] } : undefined)

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
  /** Active le glisser-déposer des blocs (aperçu éditable). */
  editable?: boolean
  onMoveBlock?: (id: PromoBlockId, dx: number, dy: number) => void
}

/** Carte promo Retail (HTML/CSS) — design data-driven, couleurs/polices/champs/positions configurables. */
export const RetailPromoCard = forwardRef<HTMLDivElement, CardProps>(
  ({ data, config = DEFAULT_PROMO_CONFIG, editable = false, onMoveBlock }, ref) => {
    const { amount, cur, fontSize } = splitPrice(data.priceNow)
    const hText = idealText(config.headerBg)
    const aText = idealText(config.accent)
    const cardElRef = useRef<HTMLDivElement | null>(null)
    const setRefs = (el: HTMLDivElement | null) => {
      cardElRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
    }

    const startDrag = (e: ReactPointerEvent, id: PromoBlockId) => {
      if (!editable || !onMoveBlock) return
      e.preventDefault(); e.stopPropagation()
      const rect = cardElRef.current?.getBoundingClientRect()
      const scale = rect && rect.width ? rect.width / 595 : 1
      const o = config.offsets[id] ?? { dx: 0, dy: 0 }
      const sx = e.clientX, sy = e.clientY
      const move = (ev: PointerEvent) =>
        onMoveBlock(id, Math.round(o.dx + (ev.clientX - sx) / scale), Math.round(o.dy + (ev.clientY - sy) / scale))
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
    // Style commun d'un bloc déplaçable : transform du décalage + curseur en mode édition.
    const blk = (id: PromoBlockId, extra?: React.CSSProperties): React.CSSProperties => {
      const o = config.offsets[id]
      return {
        ...(o ? { transform: `translate(${o.dx}px, ${o.dy}px)` } : null),
        ...(editable ? { cursor: 'move' } : null),
        ...extra,
      }
    }
    const drag = (id: PromoBlockId) => (editable ? { onPointerDown: (e: ReactPointerEvent) => startDrag(e, id) } : {})

    return (
      <div ref={setRefs} className="rp-card" style={styleVars(config)}>
        <style>{PROMO_CSS}</style>
        <div className="rp-head" style={blk('header', { color: hText })} {...drag('header')}>
          {config.showCategory && <span className="rp-kicker" style={col(config, 'category') ?? { color: aText }}>{data.category || 'Offre spéciale'}</span>}
          <div className="rp-name" style={col(config, 'name')}>{data.name || 'Produit'}</div>
          {(data.brand || data.ref) && (
            <div className="rp-brand" style={col(config, 'brand')}>{[data.brand, data.ref].filter(Boolean).join(' · ')}</div>
          )}
          {config.showDescription && data.description && <div className="rp-desc" style={col(config, 'description')}>{data.description}</div>}
        </div>
        <div className="rp-product">
          {data.imageUrl
            ? <img src={data.imageUrl} crossOrigin="anonymous" alt={data.name} style={blk('image')} {...drag('image')} />
            : <div className="rp-ph">PHOTO PRODUIT</div>}
          {config.showBadge && data.remiseLabel && (
            <div className="rp-badge" style={blk('badge', { color: aText })} {...drag('badge')}>
              <span className="rp-pct">{data.remiseLabel}</span>
              <span className="rp-pctlbl">de remise</span>
            </div>
          )}
        </div>
        <div className="rp-price" style={blk('price', { color: aText })} {...drag('price')}>
          <div className="rp-left">
            <span className="rp-plabel" style={col(config, 'priceLabel')}>Prix promo</span>
            {data.priceWas && <span className="rp-was" style={col(config, 'priceWas')}>{data.priceWas}</span>}
            {config.showUnitPrice && data.unitPrice && <span className="rp-unit" style={col(config, 'unitPrice')}>{data.unitPrice}</span>}
          </div>
          <div className="rp-now" style={{ fontSize, ...col(config, 'priceNow') }}>
            {amount}{cur && <span className="rp-cur">{cur}</span>}
          </div>
        </div>
        {config.showFooter && <div className="rp-foot" style={blk('footer', col(config, 'footer'))} {...drag('footer')}>{data.validite || ''}</div>}
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
