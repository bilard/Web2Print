// indesign-plugin/src/lib/slug.ts
/** Convertit un libellé en nom de tag XML InDesign valide (NCName simplifié).
 *  Préserve les lettres accentuées (valides en NCName) ; ne remplace que les
 *  caractères interdits (espaces, ponctuation, symboles) par `_`. */
export function slugifyTag(label: string): string {
  let s = label.replace(/[^\p{L}\p{N}_]+/gu, '_')
  if (!s || s === '_') return '_'
  if (/^[0-9]/.test(s)) s = `_${s}`
  return s
}
