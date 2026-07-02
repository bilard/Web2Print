// src/features/catalog/components/pages/CatalogFooter.tsx
interface Props { pageNumber: number; totalPages: number; catalogName: string }

export function CatalogFooter({ pageNumber, totalPages, catalogName }: Props) {
  return (
    <footer className="cat-foot">
      <span>{catalogName}</span>
      <span>{pageNumber} / {totalPages}</span>
    </footer>
  )
}
