/**
 * Neutralise les images placeholder (href="placeholder:XXX") en les convertissant
 * en rectangles simples que Fabric peut parser sans crasher.
 *
 * Fabric v6 crashe avec "Cannot read properties of null (reading 'fill')"
 * quand il rencontre des <image href="placeholder:..."> parce que:
 * 1. fabric.Image.fromElement cherche à charger l'image
 * 2. Le href invalid retourne null
 * 3. Le code essaie d'accéder à .fill sur null → crash
 *
 * Cette fonction remplace chaque <image href="placeholder:..."> par un <rect>
 * avec les mêmes attributs de position/taille et un attribut data-role conservé.
 */
export function neutralizePlaceholderImages(svgText: string): string {
  // Regex pour trouver tous les <image> avec href="placeholder:..." ou href='placeholder:...'
  // Couvre à la fois double et single quotes
  const imageRegex = /<image\s+([^>]*(href|xlink:href)\s*=\s*['"]placeholder:[^'"]*['"][^>]*)\s*\/?\s*>/gi

  return svgText.replace(imageRegex, (match, attrs) => {
    // Extraire les attributs pertinents (couvrir à la fois double et single quotes)
    const xMatch = attrs.match(/x\s*=\s*['"]([^'"]*)['"]/i)
    const yMatch = attrs.match(/y\s*=\s*['"]([^'"]*)['"]/i)
    const widthMatch = attrs.match(/width\s*=\s*['"]([^'"]*)['"]/i)
    const heightMatch = attrs.match(/height\s*=\s*['"]([^'"]*)['"]/i)
    const dataRoleMatch = attrs.match(/data-role\s*=\s*['"]([^'"]*)['"]/i)
    const dataIdMatch = attrs.match(/data-id\s*=\s*['"]([^'"]*)['"]/i)

    const x = xMatch?.[1] || '0'
    const y = yMatch?.[1] || '0'
    const width = widthMatch?.[1] || '100'
    const height = heightMatch?.[1] || '100'
    const dataRole = dataRoleMatch?.[1] || 'image-slot'
    const dataId = dataIdMatch?.[1] || ''

    // Construire un <rect> avec les mêmes dimensions et rôle
    let rectAttrs = `x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="#cccccc" stroke-width="1" data-role="${dataRole}"`
    if (dataId) {
      rectAttrs += ` data-id="${dataId}"`
    }

    return `<rect ${rectAttrs} />`
  })
}
