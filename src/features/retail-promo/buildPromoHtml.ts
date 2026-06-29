import { PROMO_CSS, splitPrice, type RetailCardData, type PromoTemplateConfig } from './RetailPromoCard'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

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

  // Variables HyperFrames : tous les champs source (pour édition/réutilisation en Studio).
  const seen = new Set<string>()
  const vars = allFields
    .filter((f) => f.label && !seen.has(sanitizeId(f.label)) && seen.add(sanitizeId(f.label)))
    .map((f) => ({ id: sanitizeId(f.label), type: 'string', label: f.label, default: f.value }))
  const varsJson = JSON.stringify(vars).replace(/'/g, '&#39;')

  const badge = config.showBadge && data.remiseLabel
    ? `<div class="rp-badge"><span class="rp-pct">${esc(data.remiseLabel)}</span><span class="rp-pctlbl">de remise</span></div>`
    : ''
  const img = data.imageUrl
    ? `<img src="${esc(data.imageUrl)}" alt="${esc(data.name)}" />`
    : `<div class="rp-ph">PHOTO PRODUIT</div>`

  return `<!doctype html>
<html lang="fr" data-composition-variables='${varsJson}'>
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
  body { margin:0; display:flex; justify-content:center; align-items:flex-start; background:#e5e7eb; padding:24px; }
  ${PROMO_CSS}
</style>
</head>
<body>
  <div class="rp-card" data-composition-id="promo" data-width="595" data-height="842"
       style="--rp-accent:${esc(config.accent)};--rp-head:${esc(config.headerBg)}">
    <div class="rp-head">
      ${config.showCategory ? `<span class="rp-kicker">${esc(data.category || 'Offre spéciale')}</span>` : ''}
      <div class="rp-name">${esc(data.name || 'Produit')}</div>
      ${(data.brand || data.ref) ? `<div class="rp-brand">${esc([data.brand, data.ref].filter(Boolean).join(' · '))}</div>` : ''}
      ${config.showDescription && data.description ? `<div class="rp-desc">${esc(data.description)}</div>` : ''}
    </div>
    <div class="rp-product">
      ${img}
      ${badge}
    </div>
    <div class="rp-price">
      <div class="rp-left">
        <span class="rp-plabel">Prix promo</span>
        ${data.priceWas ? `<span class="rp-was">${esc(data.priceWas)}</span>` : ''}
        ${config.showUnitPrice && data.unitPrice ? `<span class="rp-unit">${esc(data.unitPrice)}</span>` : ''}
      </div>
      <div class="rp-now" style="font-size:${fontSize}px">${esc(amount)}${cur ? `<span class="rp-cur">${esc(cur)}</span>` : ''}</div>
    </div>
    ${config.showFooter ? `<div class="rp-foot">${esc(data.validite || '')}</div>` : ''}
  </div>
</body>
</html>`
}
