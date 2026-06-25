// indesign-plugin/src/lib/slug.ts
/** Convertit un libellé en nom de tag XML InDesign valide (NCName simplifié). */
export function slugifyTag(label: string): string {
  const noAccents = label.normalize('NFD').replace(/[̀-ͯ]/g, '')
  let s = noAccents.replace(/[^A-Za-z0-9_]+/g, '_')
  if (!s || s === '_') return '_'
  if (/^[0-9]/.test(s)) s = `_${s}`
  return s
}
