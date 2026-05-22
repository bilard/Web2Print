import type { StyleConfig } from '../promptToStyleConfig'

export interface PlaceholderInputs {
  width: number
  height: number
  topic?: string
  brand?: string
  caption?: string
  styleConfig?: StyleConfig
}

export interface PlaceholderResult {
  svg: string
  width: number
  height: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pickHeroLabel(topic?: string): string {
  if (!topic) return ''
  const cleaned = topic.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(' ').filter((w) => w.length >= 3)
  if (words.length === 0) return cleaned.slice(0, 22).toUpperCase()
  let label = ''
  for (const w of words) {
    if (label.length + w.length + 1 > 22) break
    label = label ? `${label} ${w}` : w
  }
  return (label || words[0]).toUpperCase()
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

export function generatePlaceholderSvg(opts: PlaceholderInputs): PlaceholderResult {
  const W = Math.max(240, Math.round(opts.width))
  const H = Math.max(240, Math.round(opts.height))
  const bg = opts.styleConfig?.palette.bg ?? '#0a0a0a'
  const accent = opts.styleConfig?.palette.accent ?? '#ffffff'

  const heroLabel = pickHeroLabel(opts.topic)
  const heroFont = Math.round(Math.min(W, H) * (heroLabel.length > 14 ? 0.075 : 0.11))
  const cx = W / 2
  const cy = H / 2
  const minDim = Math.min(W, H)

  // Dégradé radial sobre : très léger halo accent au centre, fondu vers le bg
  // aux bords. Pas de formes superposées (= plus jamais de bouillie opaque).
  const accentHalo = withAlpha(accent, 0.10)
  const gradient =
    `<defs>` +
    `<radialGradient id="halo" cx="50%" cy="42%" r="55%">` +
    `<stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>` +
    `<stop offset="55%" stop-color="${accent}" stop-opacity="0.05"/>` +
    `<stop offset="100%" stop-color="${bg}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>`
  void accentHalo

  // Filets décoratifs très discrets (2 lignes parallèles + un point au centre),
  // sémantiquement neutres et bornés en opacité — pas d'accumulation possible.
  const lineY1 = (cy - heroFont * 1.2).toFixed(1)
  const lineY2 = (cy + heroFont * 1.2).toFixed(1)
  const lineW = (minDim * 0.18).toFixed(1)
  const lineH = (minDim * 0.0035).toFixed(1)
  const decoLines =
    `<rect x="${(cx - parseFloat(lineW) / 2).toFixed(1)}" y="${lineY1}" width="${lineW}" height="${lineH}" fill="${accent}" opacity="0.35"/>` +
    `<rect x="${(cx - parseFloat(lineW) / 2).toFixed(1)}" y="${lineY2}" width="${lineW}" height="${lineH}" fill="${accent}" opacity="0.35"/>`

  const heroFill = withAlpha(accent, 0.95)
  const subFill = withAlpha(accent, 0.55)
  const subLabel = (opts.caption || opts.brand || '').toUpperCase()
  const subFont = Math.round(heroFont * 0.28)

  const heroBlock = heroLabel
    ? `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${heroFill}" font-family="-apple-system, 'SF Pro Display', Helvetica, sans-serif" font-weight="800" font-size="${heroFont}" letter-spacing="-0.02em">${escapeXml(heroLabel)}</text>`
    : ''
  const subBlock =
    subLabel && heroLabel
      ? `<text x="${cx.toFixed(1)}" y="${(cy + heroFont * 1.05).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${subFill}" font-family="-apple-system, 'SF Pro Display', Helvetica, sans-serif" font-weight="500" font-size="${subFont}" letter-spacing="0.25em">${escapeXml(subLabel)}</text>`
      : ''

  const accentLineY = (H - minDim * 0.08).toFixed(1)
  const accentLine = `<rect x="${(W * 0.5 - minDim * 0.06).toFixed(1)}" y="${accentLineY}" width="${(minDim * 0.12).toFixed(1)}" height="${(minDim * 0.006).toFixed(1)}" rx="${(minDim * 0.003).toFixed(1)}" fill="${accent}" opacity="0.7"/>`

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    gradient +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#halo)"/>` +
    decoLines +
    heroBlock +
    subBlock +
    accentLine +
    `</svg>`

  return { svg, width: W, height: H }
}
