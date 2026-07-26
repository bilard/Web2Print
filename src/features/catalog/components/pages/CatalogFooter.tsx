interface Props { pageNumber: number; totalPages: number; catalogName: string; showName?: boolean }

export function CatalogFooter({ pageNumber, totalPages, catalogName, showName = true }: Props) {
  // Convention brochure : page 1 = recto → impair = recto (folio au bord DROIT),
  // pair = verso (folio au bord GAUCHE, côté extérieur de la planche).
  const verso = pageNumber % 2 === 0
  return (
    <footer className={`cat-foot${verso ? ' cat-foot--verso' : ''}`}>
      {/* span vide : préserve le space-between → folio toujours au bord extérieur */}
      <span className="cat-foot-name">{showName ? catalogName : ''}</span>
      <span className="cat-foot-folio">{pageNumber} / {totalPages}</span>
    </footer>
  )
}
