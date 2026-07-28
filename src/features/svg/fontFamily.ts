/**
 * Résolution du nom de police d'un SVG.
 *
 * Illustrator écrit une pile qui commence par le nom PostScript du STYLE et se
 * termine par la vraie famille : `font-family: Montserrat-ExtraBold, Montserrat`.
 * Le nom PostScript n'existe comme police ni sur le système ni sur Google Fonts,
 * donc le texte tombait sur une police à empattements — beaucoup plus large que
 * l'original, au point de déborder de la page.
 *
 * Règle : si le dernier nom de la pile est le préfixe du premier, c'est la
 * famille — on la retient (la graisse reste portée par `font-weight`).
 */
export function cleanFontFamily(ff: unknown): string | undefined {
  if (typeof ff !== 'string' || !ff) return undefined
  const stack = ff
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  if (stack.length === 0) return undefined
  const first = stack[0]
  const last = stack[stack.length - 1]
  if (last !== first && first.toLowerCase().startsWith(last.toLowerCase())) return last
  return first
}
