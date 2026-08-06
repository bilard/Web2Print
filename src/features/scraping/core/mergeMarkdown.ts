// Fusion des markdowns collectés sur plusieurs onglets d'une même fiche produit.
//
// Partagé par les DEUX assembleurs de bundle — celui du moteur de scraping
// (`bundleSources`) et celui du PIM (`scrapeBundle`), qui restent des forks pour le
// reste (le PIM qualifie les PDF et sait les inclure sur opt-in). Le dédoublonnage, lui,
// n'a aucune raison de différer : c'est la même page, vue deux fois.
const MARKER = 'JINA_EXTRACTED_'

/** Empreinte d'un paragraphe, insensible à la casse et aux blancs — les onglets d'une
 *  fiche répètent massivement les mêmes blocs, à un espacement près. */
function hashParagraph(p: string): string {
  const trimmed = p.trim().toLowerCase().replace(/\s+/g, ' ')
  let h = 0
  for (let i = 0; i < trimmed.length; i++) h = ((h << 5) - h + trimmed.charCodeAt(i)) | 0
  return `${trimmed.length}:${h}`
}

/**
 * Concatène les sections en préfixant chacune de sa source, sans répéter un paragraphe
 * déjà vu ailleurs.
 *
 * ⚠ Les blocs `JINA_EXTRACTED_*` (listes d'images, de PDF) échappent au dédoublonnage :
 * ce sont des inventaires, pas de la prose — deux onglets peuvent légitimement en porter
 * d'identiques, et en perdre un ampute la fiche de ses visuels.
 */
export function dedupParagraphs(sections: Array<{ label: string; markdown: string }>): string {
  const seen = new Set<string>()
  const output: string[] = []
  for (const s of sections) {
    output.push(`## [Source: ${s.label}]`)
    for (const p of s.markdown.split(/\n\n+/)) {
      if (!p.trim()) continue
      if (p.includes(MARKER)) { output.push(p); continue }
      const h = hashParagraph(p)
      if (seen.has(h)) continue
      seen.add(h)
      output.push(p)
    }
  }
  return output.join('\n\n').trim()
}
