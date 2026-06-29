import { forwardRef } from 'react'

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

const CSS = `
.rp-card * { margin:0; padding:0; box-sizing:border-box; }
.rp-card { position:relative; width:595px; height:842px; background:#fff; overflow:hidden;
  display:flex; flex-direction:column; font-family:'Montserrat','Inter',system-ui,sans-serif; color:#111827; }
.rp-head { background:#111827; color:#fff; padding:30px 40px 26px; display:flex; flex-direction:column; gap:8px; }
.rp-kicker { align-self:flex-start; background:#ef4444; color:#fff; font-weight:800; font-size:14px;
  letter-spacing:.18em; text-transform:uppercase; padding:6px 14px; border-radius:4px; }
.rp-name { font-weight:800; font-size:44px; line-height:1.03; letter-spacing:-.01em; }
.rp-brand { color:#9ca3af; font-weight:600; font-size:17px; }
.rp-desc { color:#cbd5e1; font-weight:500; font-size:15px; line-height:1.3; margin-top:4px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.rp-unit { font-weight:600; font-size:15px; opacity:.85; margin-top:2px; }
.rp-product { position:relative; flex:1; display:flex; align-items:center; justify-content:center; padding:36px;
  background:radial-gradient(120% 90% at 50% 30%, #f1f5f9 0%, #ffffff 70%); }
.rp-product img { max-width:84%; max-height:88%; object-fit:contain; filter:drop-shadow(0 24px 30px rgba(15,23,42,.18)); }
.rp-ph { width:78%; height:74%; border-radius:16px; background:repeating-linear-gradient(45deg,#e9eef5 0 18px,#eef2f8 18px 36px);
  display:flex; align-items:center; justify-content:center; color:#94a3b8; font-weight:700; letter-spacing:.12em; font-size:13px; }
.rp-badge { position:absolute; top:28px; right:34px; width:150px; height:150px; border-radius:50%; background:#ef4444; color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 10px 24px rgba(239,68,68,.30); }
.rp-pct { font-weight:900; font-size:50px; line-height:.9; }
.rp-pctlbl { font-weight:700; font-size:12px; letter-spacing:.14em; text-transform:uppercase; margin-top:2px; }
.rp-price { background:#ef4444; color:#fff; padding:26px 40px 30px; display:flex; align-items:flex-end; justify-content:space-between; }
.rp-plabel { font-weight:700; font-size:14px; letter-spacing:.2em; text-transform:uppercase; opacity:.9; }
.rp-was { font-size:25px; font-weight:600; text-decoration:line-through; opacity:.7; }
.rp-left { display:flex; flex-direction:column; gap:8px; }
.rp-now { font-weight:900; font-size:92px; line-height:.85; letter-spacing:-.02em; }
.rp-foot { background:#111827; color:#9ca3af; font-size:12px; padding:10px 40px; text-align:center; letter-spacing:.03em; min-height:38px; }
`

/** Carte promo Retail (HTML/CSS) — design moderne data-driven. Rendue puis capturée en PNG (html2canvas). */
export const RetailPromoCard = forwardRef<HTMLDivElement, { data: RetailCardData }>(({ data }, ref) => {
  return (
    <div ref={ref} className="rp-card">
      <style>{CSS}</style>
      <div className="rp-head">
        <span className="rp-kicker">{data.category || 'Offre spéciale'}</span>
        <div className="rp-name">{data.name || 'Produit'}</div>
        {(data.brand || data.ref) && (
          <div className="rp-brand">{[data.brand, data.ref].filter(Boolean).join(' · ')}</div>
        )}
        {data.description && <div className="rp-desc">{data.description}</div>}
      </div>
      <div className="rp-product">
        {data.imageUrl
          ? <img src={data.imageUrl} crossOrigin="anonymous" alt={data.name} />
          : <div className="rp-ph">PHOTO PRODUIT</div>}
        {data.remiseLabel && (
          <div className="rp-badge">
            <span className="rp-pct">{data.remiseLabel}</span>
            <span className="rp-pctlbl">de remise</span>
          </div>
        )}
      </div>
      <div className="rp-price">
        <div className="rp-left">
          <span className="rp-plabel">Prix promo</span>
          {data.priceWas && <span className="rp-was">{data.priceWas}</span>}
          {data.unitPrice && <span className="rp-unit">{data.unitPrice}</span>}
        </div>
        <div className="rp-now">{data.priceNow}</div>
      </div>
      <div className="rp-foot">{data.validite || ''}</div>
    </div>
  )
})
RetailPromoCard.displayName = 'RetailPromoCard'
