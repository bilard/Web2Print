// src/pages/CatalogBuilderPage.tsx
// Squelette — complété en Task 9 (wizard sélection PIM → prompt → PDF).
import { useParams } from 'react-router-dom'

export default function CatalogBuilderPage() {
  const { id } = useParams<{ id: string }>()
  return <div className="min-h-screen bg-background text-white p-8">Builder catalogue {id} — en construction</div>
}
