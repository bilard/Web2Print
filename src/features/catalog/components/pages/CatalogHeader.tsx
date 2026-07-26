// Header data-driven : breadcrumb Univers › Famille › Sous-famille de la page,
// calé au bord EXTÉRIEUR de la planche (verso = gauche, recto = droite), comme le folio.
interface Props { breadcrumb: string[]; pageNumber: number }

export function CatalogHeader({ breadcrumb, pageNumber }: Props) {
  const [univers, ...rest] = breadcrumb
  const recto = pageNumber % 2 === 1
  return (
    <header className={`cat-head${recto ? ' cat-head--recto' : ''}`}>
      <span className="cat-head-univers">{univers}</span>
      {rest.map((label, i) => (
        <span key={i} className="cat-head-crumb"><span className="cat-head-sep">› </span>{label}</span>
      ))}
    </header>
  )
}
