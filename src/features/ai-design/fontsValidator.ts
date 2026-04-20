export interface FontValidationResult {
  usedFonts: string[]      // uniques, normalisées
  missingFonts: string[]   // usedFonts \ allowedFonts
}

function normalizeFontFamily(raw: string): string {
  // "'Playfair Display'" → "Playfair Display"
  // "Inter, sans-serif" → "Inter"
  const first = raw.split(',')[0].trim()
  return first.replace(/^['"]|['"]$/g, '')
}

export function validateSvgFonts(svgText: string, allowedFonts: string[]): FontValidationResult {
  const used = new Set<string>()
  const regex = /font-family\s*=\s*"([^"]+)"|font-family\s*=\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(svgText)) !== null) {
    const raw = match[1] ?? match[2] ?? ''
    const normalized = normalizeFontFamily(raw)
    if (normalized) used.add(normalized)
  }

  const allowedSet = new Set(allowedFonts)
  const usedFonts = [...used]
  const missingFonts = usedFonts.filter((f) => !allowedSet.has(f))

  return { usedFonts, missingFonts }
}
