import type { PromoLayout } from './promoTypes'

const A4: PromoLayout = {
  id: 'affiche-a4', label: 'Affiche A4', width: 794, height: 1123, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.06, yPct: 0.05, wPct: 0.88, hPct: 0.12 },
    { blockId: 'cadre-photo', xPct: 0.12, yPct: 0.20, wPct: 0.76, hPct: 0.40 },
    { blockId: 'prix-barre', xPct: 0.10, yPct: 0.64, wPct: 0.55, hPct: 0.16 },
    { blockId: 'badge-remise', xPct: 0.68, yPct: 0.60, wPct: 0.24, hPct: 0.16 },
    { blockId: 'bandeau-lot', xPct: 0.10, yPct: 0.82, wPct: 0.80, hPct: 0.07 },
    { blockId: 'bandeau-validite', xPct: 0.10, yPct: 0.90, wPct: 0.80, hPct: 0.04 },
    { blockId: 'mentions', xPct: 0.10, yPct: 0.95, wPct: 0.80, hPct: 0.03 },
  ],
}

const ENCART: PromoLayout = {
  id: 'encart-demi', label: 'Encart ½ page', width: 794, height: 561, background: '#ffffff',
  blocks: [
    { blockId: 'cadre-photo', xPct: 0.04, yPct: 0.10, wPct: 0.40, hPct: 0.78 },
    { blockId: 'accroche', xPct: 0.48, yPct: 0.10, wPct: 0.48, hPct: 0.20 },
    { blockId: 'prix-barre', xPct: 0.48, yPct: 0.36, wPct: 0.34, hPct: 0.28 },
    { blockId: 'badge-remise', xPct: 0.82, yPct: 0.34, wPct: 0.14, hPct: 0.24 },
    { blockId: 'bandeau-validite', xPct: 0.48, yPct: 0.70, wPct: 0.48, hPct: 0.08 },
  ],
}

const ETIQUETTE: PromoLayout = {
  id: 'etiquette-a6', label: 'Étiquette rayon A6', width: 559, height: 397, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.05, yPct: 0.06, wPct: 0.90, hPct: 0.22 },
    { blockId: 'prix-barre', xPct: 0.05, yPct: 0.34, wPct: 0.60, hPct: 0.46 },
    { blockId: 'badge-remise', xPct: 0.66, yPct: 0.34, wPct: 0.30, hPct: 0.34 },
    { blockId: 'mentions', xPct: 0.05, yPct: 0.86, wPct: 0.90, hPct: 0.08 },
  ],
}

const A3: PromoLayout = {
  id: 'affiche-a3', label: 'Affiche A3', width: 1123, height: 1587, background: '#ffffff',
  blocks: [
    { blockId: 'accroche', xPct: 0.06, yPct: 0.05, wPct: 0.88, hPct: 0.12 },
    { blockId: 'cadre-photo', xPct: 0.10, yPct: 0.20, wPct: 0.80, hPct: 0.42 },
    { blockId: 'prix-barre', xPct: 0.10, yPct: 0.66, wPct: 0.55, hPct: 0.16 },
    { blockId: 'badge-remise', xPct: 0.68, yPct: 0.62, wPct: 0.24, hPct: 0.16 },
    { blockId: 'bandeau-lot', xPct: 0.10, yPct: 0.84, wPct: 0.80, hPct: 0.06 },
    { blockId: 'mentions', xPct: 0.10, yPct: 0.94, wPct: 0.80, hPct: 0.03 },
  ],
}

export const CURATED_TEMPLATES: PromoLayout[] = [A4, ENCART, ETIQUETTE, A3]

export function nearestTemplate(width: number, height: number): PromoLayout {
  const target = width / height
  return CURATED_TEMPLATES.reduce((best, t) =>
    Math.abs(t.width / t.height - target) < Math.abs(best.width / best.height - target) ? t : best,
  CURATED_TEMPLATES[0])
}
