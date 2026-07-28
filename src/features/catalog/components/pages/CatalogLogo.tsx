// Logo de marque du catalogue, rendu à DEUX endroits : couverture (grand) et
// bandeau de chaque page produit (petit).
// Composition classique « emblème + nom » : le VISUEL (logoUrl, chargé ou
// généré) porte le symbole, le NOM reste TYPOGRAPHIQUE (police de titre +
// filet accent du thème). C'est délibéré : un modèle d'image orthographie très
// mal un nom propre, alors qu'un catalogue imprimé exige un nom exact et net.
// Un logo déjà complet (texte inclus) s'affiche seul : il suffit de vider le nom.
import type { CSSProperties } from 'react'
import type { CatalogPlan } from '../../catalogTypes'
import { mergedPageStyle } from './catalogCss'

interface Props {
  plan: CatalogPlan
  logoUrl?: string | null
  /** 'cover' = grand format sur la couverture · 'head' = petit, dans le bandeau. */
  place: 'cover' | 'head'
}

export function CatalogLogo({ plan, logoUrl, place }: Props) {
  const ps = mergedPageStyle(plan.pageStyle)
  if (place === 'cover' ? ps.showCoverLogo === false : ps.showHeaderLogo === false) return null
  const name = (plan.brandName ?? '').trim()
  if (!logoUrl && !name) return null
  // L'échelle passe par une variable CSS : rendu identique en aperçu, dans les
  // pages et à l'export (aucune mesure JS).
  const style = { '--cat-logo-s': ps.logoScale ?? 1 } as CSSProperties
  return (
    <span className={`cat-logo cat-logo--${place}`} style={style}>
      {/* `crossOrigin` : le bucket Storage a le CORS ouvert (cf. useCoverImage) —
          sans l'attribut, html2canvas souille le canvas et l'export échoue. */}
      {logoUrl && <img className="cat-logo-img" src={logoUrl} alt={name || 'Logo'} crossOrigin="anonymous" />}
      {name && <span className="cat-logo-txt">{name}</span>}
    </span>
  )
}
