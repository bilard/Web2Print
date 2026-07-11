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

/** URL « document » pour les liens TITRÉS : extension bureautique classique,
 *  OU suffixe `pdf` SANS extension — les CDN Scene7 (Adobe Dynamic Media,
 *  ex. media.castorama.fr `is/content/...7290106928435_int_frpdf`) servent
 *  les notices sans `.pdf`. */
const TITLED_DOC_URL_RE = /(?:\.(?:pdf|docx?|xlsx?|pptx?|zip)|pdf)(?:[?#]|$)/i

/** Lien titré, avec éventuellement UNE icône image imbriquée dans le libellé :
 *  `[![Image 28](…icon…)Téléchargez la notice de montage](https://…pdf)`. */
const TITLED_LINK_RE = /\[((?:!\[[^\]]*\]\([^)]*\))?[^\][]+)\]\((https?:\/\/[^)\s]+)\)/g

/** Apparie chaque lien document à texte vide avec la ligne de texte courte
 *  qui le précède immédiatement (le libellé affiché sur la page), puis
 *  collecte les liens document TITRÉS (icône imbriquée retirée du libellé). */
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
  // Pass 2 : liens titrés `[Libellé](url-document)`.
  for (const m of md.matchAll(TITLED_LINK_RE)) {
    const url = m[2]
    if (!TITLED_DOC_URL_RE.test(url)) continue
    const label = m[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    if (label.length < 3 || label.length > 90 || /^https?:\/\//.test(label)) continue
    if (!out.some((d) => d.url === url)) out.push({ name: label, url })
  }
  return out
}
