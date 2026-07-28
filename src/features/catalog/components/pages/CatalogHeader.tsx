// Header data-driven : breadcrumb Univers › Famille › Sous-famille de la page,
// calé au bord EXTÉRIEUR de la planche (verso = gauche, recto = droite), comme le folio.
// Le LOGO de marque se pose au bord opposé (il est répété sur chaque page).
import type { CatalogPlan } from '../../catalogTypes'
import { CatalogLogo } from './CatalogLogo'

interface Props {
  breadcrumb: string[]
  pageNumber: number
  /** Plan du catalogue — porte la marque et les réglages du logo. Absent = pas de logo. */
  plan?: CatalogPlan
  logoUrl?: string | null
}

export function CatalogHeader({ breadcrumb, pageNumber, plan, logoUrl }: Props) {
  const [univers, ...rest] = breadcrumb
  const recto = pageNumber % 2 === 1
  return (
    <header className={`cat-head${recto ? ' cat-head--recto' : ''}`}>
      <span className="cat-head-univers">{univers}</span>
      {rest.map((label, i) => (
        <span key={i} className="cat-head-crumb"><span className="cat-head-sep">› </span>{label}</span>
      ))}
      {plan && <CatalogLogo plan={plan} logoUrl={logoUrl} place="head" />}
    </header>
  )
}
