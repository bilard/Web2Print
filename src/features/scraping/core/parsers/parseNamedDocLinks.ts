// Liens documents « titre au-dessus, lien vide en dessous ».
//
// Beaucoup de CMS fabricants rendent leurs listes de téléchargements ainsi :
//     Déclaration de conformité CE
//     [](https://…/DDA351.pdf)
// Le libellé visible est une ligne de texte ORPHELINE et l'ancre n'a pas de
// texte → les parsers d'URL brutes ne voient que le nom de fichier
// (`DDA351.pdf`) et perdent le vrai titre. Ce parser réassocie les deux.

export interface NamedDocLink {
  name: string
  url: string
}

const DOC_URL_RE = /\[\]\((https?:\/\/[^)\s]+\.(?:pdf|docx?|xlsx?|pptx?|zip)[^)\s]*)\)/i

/** Apparie chaque lien document à texte vide avec la ligne de texte courte
 *  qui le précède immédiatement (le libellé affiché sur la page). */
export function parseNamedDocLinks(md: string): NamedDocLink[] {
  const out: NamedDocLink[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(DOC_URL_RE)
    if (!m) continue
    // Remonter à la première ligne non vide au-dessus.
    let j = i - 1
    while (j >= 0 && !lines[j].trim()) j--
    const label = j >= 0 ? lines[j].trim() : ''
    // Libellé plausible : ligne courte de texte pur — pas un heading, pas un
    // lien/image markdown, pas une URL, pas un bullet.
    const isLabel = label.length >= 3 && label.length <= 90
      && !/^#{1,6}\s|^[*•·>|-]\s|\]\(|https?:\/\//.test(label)
    if (isLabel) out.push({ name: label.replace(/\s+/g, ' '), url: m[1] })
  }
  return out
}
