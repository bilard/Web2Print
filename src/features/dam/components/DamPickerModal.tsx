import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { DamPage } from './DamPage'

/**
 * Full-screen modal qui affiche l'interface DamPage (onglets Stock / Mes images /
 * Favoris / Collections / Récents / Nano Banana) par-dessus l'éditeur. Ouvert
 * depuis la ToolBar → dropdown "Image". L'insertion sur le canvas se fait via
 * la DamLightbox déjà intégrée à DamPage (bouton "Canvas").
 */
export function DamPickerModal() {
  const { damPickerOpen, setDamPickerOpen } = useUIStore()

  useEffect(() => {
    if (!damPickerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDamPickerOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [damPickerOpen, setDamPickerOpen])

  if (!damPickerOpen) return null

  return (
    <div className="fixed inset-0 z-[90] bg-[#0f0f0f] flex flex-col">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
        <div className="text-xs font-medium text-white/70">Bibliothèque d'images</div>
        <button
          onClick={() => setDamPickerOpen(false)}
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition"
          title="Fermer (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* DamPage — uses the same UI as the dashboard images section */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DamPage />
      </div>
    </div>
  )
}
