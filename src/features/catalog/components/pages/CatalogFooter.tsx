// src/features/catalog/components/pages/CatalogFooter.tsx
interface Props { pageNumber: number; totalPages: number; catalogName: string }

export function CatalogFooter({ pageNumber, totalPages, catalogName }: Props) {
  // Convention brochure : page 1 = recto → impair = recto (folio au bord DROIT),
  // pair = verso (folio au bord GAUCHE, côté extérieur de la planche).
  const verso = pageNumber % 2 === 0
  return (
    <footer className={`cat-foot${verso ? ' cat-foot--verso' : ''}`}>
      <span className="cat-foot-name">{catalogName}</span>
      <span className="cat-foot-folio">{pageNumber} / {totalPages}</span>
    </footer>
  )
}
