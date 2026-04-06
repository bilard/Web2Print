/**
 * Parser for Adobe AdobeFnt25.lst files found in InDesign Assembly packages.
 * Extracts font metadata: FamilyName, StyleName, WeightClass, AngleClass, OutlineFileName.
 */

export interface AdobeFontEntry {
  fontName: string
  familyName: string
  styleName: string
  weightClass: number
  angleClass: number
  outlineFileName: string
  fontType: string
}

/**
 * Parse an AdobeFnt25.lst file content into structured font entries.
 * Skips entries with FontType:Invalid.
 */
export function parseAdobeFntList(content: string): AdobeFontEntry[] {
  const entries: AdobeFontEntry[] = []
  const blocks = content.split('%BeginFont')

  for (const block of blocks) {
    if (!block.includes('%EndFont')) continue

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    const props = new Map<string, string>()

    for (const line of lines) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0 && !line.startsWith('%')) {
        props.set(line.slice(0, colonIdx), line.slice(colonIdx + 1))
      }
    }

    const fontType = props.get('FontType') ?? ''
    if (fontType === 'Invalid') continue

    const familyName = props.get('FamilyName') ?? ''
    const styleName = props.get('StyleName') ?? ''
    if (!familyName || !styleName) continue

    entries.push({
      fontName: props.get('FontName') ?? '',
      familyName,
      styleName,
      weightClass: parseInt(props.get('WeightClass') ?? '400') || 400,
      angleClass: parseInt(props.get('AngleClass') ?? '0') || 0,
      outlineFileName: props.get('OutlineFileName') ?? '',
      fontType,
    })
  }

  return entries
}

/**
 * Build a lookup map: outlineFileName (basename, lowercase) → AdobeFontEntry
 * Used to match loaded font files to their Adobe metadata.
 */
export function buildFontLookup(entries: AdobeFontEntry[]): Map<string, AdobeFontEntry> {
  const map = new Map<string, AdobeFontEntry>()
  for (const entry of entries) {
    // Extract basename from full path
    const parts = entry.outlineFileName.split('/')
    const basename = parts[parts.length - 1].toLowerCase()
    if (basename) map.set(basename, entry)
  }
  return map
}
