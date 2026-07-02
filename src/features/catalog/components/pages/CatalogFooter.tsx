// src/features/catalog/components/pages/CatalogFooter.tsx
interface Props { pageNumber: number; totalPages: number; catalogName: string }

export function CatalogFooter({ pageNumber, totalPages, catalogName }: Props) {
  return (
    <footer className="cat-foot">
      <span className="cat-foot-name">{catalogName}</span>
      <span className="cat-foot-folio">{pageNumber} / {totalPages}</span>
    </footer>
  )
}
