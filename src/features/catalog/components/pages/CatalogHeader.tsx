// src/features/catalog/components/pages/CatalogHeader.tsx
// Header data-driven : breadcrumb Univers › Famille › Sous-famille de la page.
interface Props { breadcrumb: string[] }

export function CatalogHeader({ breadcrumb }: Props) {
  const [univers, ...rest] = breadcrumb
  return (
    <header className="cat-head">
      <span className="cat-head-univers">{univers}</span>
      {rest.map((label, i) => (
        <span key={i} className="cat-head-crumb"><span className="cat-head-sep">› </span>{label}</span>
      ))}
    </header>
  )
}
