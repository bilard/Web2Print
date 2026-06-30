import { PROMO_CSS, FONTS_HREF, splitPrice, idealText, elementCss, blockBgCss, type RetailCardData, type PromoTemplateConfig, type PromoColorKey, type PromoBlockId } from './RetailPromoCard'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Décalage + échelle d'un bloc (offsets + scales) en CSS inline.
const offCss = (config: PromoTemplateConfig, id: PromoBlockId): string => {
  const o = config.offsets[id], sc = config.scales?.[id]
  const t = [o ? `translate(${o.dx}px,${o.dy}px)` : '', sc ? `scale(${sc.sx},${sc.sy})` : ''].filter(Boolean).join(' ')
  return t ? `transform:${t};${sc ? 'transform-origin:top left;' : ''}` : ''
}
// Fond d'un bloc déco (suffixé d'un ; si présent).
const bgCss = (config: PromoTemplateConfig, id: PromoBlockId): string => {
  const c = blockBgCss(config, id)
  return c ? `${c};` : ''
}

/** Attribut style combiné (caractéristiques typo/remplissage + décalage) pour un sous-élément. */
const subAttr = (config: PromoTemplateConfig, key: PromoColorKey): string => {
  const parts: string[] = []
  const css = elementCss(config, key)
  if (css) parts.push(css)
  const o = config.offsets[key]
  if (o) parts.push(`transform:translate(${o.dx}px,${o.dy}px)`)
  return parts.length ? ` style="${parts.join(';')}"` : ''
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
    ? `<div class="rp-badge" style="color:${aText};${bgCss(config, 'badge')}${offCss(config, 'badge')}"><span class="rp-pct">${esc(data.remiseLabel)}</span><span class="rp-pctlbl">de remise</span></div>`
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
    <div class="rp-head" style="color:${hText};${bgCss(config, 'header')}${offCss(config, 'header')}">
      ${config.showCategory ? `<span class="rp-kicker" style="${elementCss(config, 'category') || `color:${aText}`};${offCss(config, 'category')}">${esc(data.category || 'Offre spéciale')}</span>` : ''}
      <div class="rp-name"${subAttr(config, 'name')}>${esc(data.name || 'Produit')}</div>
      ${(data.brand || data.ref) ? `<div class="rp-brand"${subAttr(config, 'brand')}>${esc([data.brand, data.ref].filter(Boolean).join(' · '))}</div>` : ''}
      ${config.showDescription && data.description ? `<div class="rp-desc"${subAttr(config, 'description')}>${esc(data.description)}</div>` : ''}
    </div>
    <div class="rp-product" style="${bgCss(config, 'image')}">
      ${img}
      ${badge}
    </div>
    <div class="rp-price" style="color:${aText};${bgCss(config, 'price')}${offCss(config, 'price')}">
      <div class="rp-left">
        <span class="rp-plabel"${subAttr(config, 'priceLabel')}>Prix promo</span>
        ${data.priceWas ? `<span class="rp-was"${subAttr(config, 'priceWas')}>${esc(data.priceWas)}</span>` : ''}
        ${config.showUnitPrice && data.unitPrice ? `<span class="rp-unit"${subAttr(config, 'unitPrice')}>${esc(data.unitPrice)}</span>` : ''}
      </div>
      <div class="rp-now" style="font-size:${fontSize}px;${elementCss(config, 'priceNow')};${offCss(config, 'priceNow')}">${esc(amount)}${cur ? `<span class="rp-cur">${esc(cur)}</span>` : ''}</div>
    </div>
    ${config.showFooter ? `<div class="rp-foot" style="${elementCss(config, 'footer')};${offCss(config, 'footer')}">${esc(data.validite || '')}</div>` : ''}
  </div>
</body>
</html>`
}
