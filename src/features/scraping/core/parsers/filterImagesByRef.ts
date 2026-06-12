// Filtre des images produit par référence.
//
// Les pages fabricant embarquent BEAUCOUP d'images étrangères au produit :
// carrousels « Dispositifs compatibles » / « Machines connexes » / accessoires,
// méga-menu, produits récemment consultés. Sur la plupart des CDN fabricants,
// les vues du produit portent sa référence dans le nom de fichier
// (`DDA351_D1CK.png`, `dda351rtj_c2l0.png`) alors que les images des produits
// liés portent la LEUR (`DSL800RTEU_C2L0.png`). Quand on connaît la référence,
// ce signal suffit à isoler la galerie — générique, aucun code par-vendeur.

/** Stem d'une URL d'image : dernier segment de path sans extension(s). */
function stem(url: string): string {
  try {
    const last = new URL(url).pathname.replace(/\/$/, '').split('/').pop() ?? ''
    return last.replace(/\.(jpe?g|png|webp|avif|gif|svg)(\.(jpe?g|png|webp|avif|gif))?$/i, '').toLowerCase()
  } catch { return url.toLowerCase() }
}

/** Réduit les images aux seules vues du produit quand sa référence est connue.
 *
 *  `refs` : toutes les références candidates (model, réf. fabricant, réf.
 *  distributeur, EAN). Chacune génère deux clés de match : la forme
 *  normalisée complète (`dda351rtj`) et son préfixe modèle (`dda351` —
 *  lettres + premiers chiffres), car les CDN nomment tantôt par référence
 *  commerciale complète, tantôt par modèle de base.
 *
 *  Garde-fous :
 *   - aucune référence exploitable → liste inchangée ;
 *   - moins de 2 images qui matchent → liste inchangée (un seul match peut
 *     être un hasard, et certains CDN nomment la galerie par hash). */
export function filterImagesByProductRef(
  images: string[],
  refs: Array<string | undefined | null>,
): string[] {
  const bases = new Set<string>()
  for (const r of refs) {
    if (!r) continue
    const norm = r.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (norm.length >= 4) bases.add(norm)
    const prefix = norm.match(/^([a-z]{1,6}\d{2,6})/)?.[1]
    if (prefix && prefix.length >= 4) bases.add(prefix)
  }
  if (bases.size === 0) return images

  const matched = images.filter((u) => {
    const s = stem(u).replace(/[^a-z0-9]/g, '')
    for (const b of bases) {
      if (s.includes(b)) return true
    }
    return false
  })
  return matched.length >= 2 ? matched : images
}
