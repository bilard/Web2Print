import { PROMO_CSS, FONTS_HREF, splitPrice, idealText, type RetailCardData, type PromoTemplateConfig, type PromoColorKey } from './RetailPromoCard'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

const colAttr = (config: PromoTemplateConfig, k: PromoColorKey): string =>
  config.colors[k] ? ` style="color:${esc(config.colors[k])}"` : ''

const offCss = (config: PromoTemplateConfig, id: 'header' | 'image' | 'badge' | 'price' | 'footer'): string => {
  const o = config.offsets[id]
  return o ? `transform:translate(${o.dx}px,${o.dy}px);` : ''
}

const sanitizeId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'champ'

/**
 * Construit une composition HyperFrames AUTONOME (self-contained) pour un produit :
 * - tous les champs source déclarés en `data-composition-variables` (éditables en Studio) ;
 * - rendu HTML/CSS identique à la carte in-app, couleurs pilotées par config ;
 * - image attendue en data-URI (le fichier reste autonome, pas de blob: éphémère).
 */
export function buildPromoHtml(
  data: RetailCardData,
  config: PromoTemplateConfig,
  allFields: { label: string; value: string }[],
): string {
  const { amount, cur, fontSize } = splitPrice(data.priceNow)
  const hText = idealText(config.headerBg)
  const aText = idealText(config.accent)

  // Variables HyperFrames : tous les champs source (pour édition/réutilisation en Studio).
  const seen = new Set<string>()
  const vars = allFields
    .filter((f) => f.label && !seen.has(sanitizeId(f.label)) && seen.add(sanitizeId(f.label)))
    .map((f) => ({ id: sanitizeId(f.label), type: 'string', label: f.label, default: f.value }))
  const varsJson = JSON.stringify(vars).replace(/'/g, '&#39;')

  const badge = config.showBadge && data.remiseLabel
    ? `<div class="rp-badge" style="color:${aText};${offCss(config, 'badge')}"><span class="rp-pct">${esc(data.remiseLabel)}</span><span class="rp-pctlbl">de remise</span></div>`
    : ''
  const img = data.imageUrl
    ? `<img src="${esc(data.imageUrl)}" alt="${esc(data.name)}" style="${offCss(config, 'image')}" />`
    : `<div class="rp-ph">PHOTO PRODUIT</div>`

  return `<!doctype html>
<html lang="fr" data-composition-variables='${varsJson}'>
<head>
<meta charset="utf-8" />
<link href="${FONTS_HREF}" rel="stylesheet" />
<style>
  body { margin:0; display:flex; justify-content:center; align-items:flex-start; background:#e5e7eb; padding:24px; }
  ${PROMO_CSS}
</style>
</head>
<body>
  <div class="rp-card" data-composition-id="promo" data-width="595" data-height="842"
       style="--rp-accent:${esc(config.accent)};--rp-head:${esc(config.headerBg)};--rp-font-h:'${esc(config.fontHeading)}',sans-serif;--rp-font-p:'${esc(config.fontPrice)}',sans-serif">
    <div class="rp-head" style="color:${hText};${offCss(config, 'header')}">
      ${config.showCategory ? `<span class="rp-kicker" style="color:${esc(config.colors.category || aText)}">${esc(data.category || 'Offre spéciale')}</span>` : ''}
      <div class="rp-name"${colAttr(config, 'name')}>${esc(data.name || 'Produit')}</div>
      ${(data.brand || data.ref) ? `<div class="rp-brand"${colAttr(config, 'brand')}>${esc([data.brand, data.ref].filter(Boolean).join(' · '))}</div>` : ''}
      ${config.showDescription && data.description ? `<div class="rp-desc"${colAttr(config, 'description')}>${esc(data.description)}</div>` : ''}
    </div>
    <div class="rp-product">
      ${img}
      ${badge}
    </div>
    <div class="rp-price" style="color:${aText};${offCss(config, 'price')}">
      <div class="rp-left">
        <span class="rp-plabel"${colAttr(config, 'priceLabel')}>Prix promo</span>
        ${data.priceWas ? `<span class="rp-was"${colAttr(config, 'priceWas')}>${esc(data.priceWas)}</span>` : ''}
        ${config.showUnitPrice && data.unitPrice ? `<span class="rp-unit"${colAttr(config, 'unitPrice')}>${esc(data.unitPrice)}</span>` : ''}
      </div>
      <div class="rp-now" style="font-size:${fontSize}px${config.colors.priceNow ? `;color:${esc(config.colors.priceNow)}` : ''}">${esc(amount)}${cur ? `<span class="rp-cur">${esc(cur)}</span>` : ''}</div>
    </div>
    ${config.showFooter ? `<div class="rp-foot" style="${config.colors.footer ? `color:${esc(config.colors.footer)};` : ''}${offCss(config, 'footer')}">${esc(data.validite || '')}</div>` : ''}
  </div>
</body>
</html>`
}
