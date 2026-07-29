import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { CloseButton } from '@/components/shared/CloseButton'
import { DamPage } from './DamPage'
import { useTranslation } from '@/lib/i18n'

/**
 * Full-screen modal qui affiche l'interface DamPage (onglets Stock / Mes images /
 * Favoris / Collections / Récents / Image IA) par-dessus l'éditeur. Ouvert
 * depuis la ToolBar → dropdown "Image". L'insertion sur le canvas se fait via
 * la DamLightbox déjà intégrée à DamPage (bouton "Canvas").
 */
export function DamPickerModal() {
  const { t } = useTranslation()
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
    <div className="fixed inset-0 z-[90] bg-background flex flex-col">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
        <div className="text-xs font-medium text-white/70">{t('dam.picker.title')}</div>
        <CloseButton onClick={() => setDamPickerOpen(false)} title={t('dam.close')} />
      </div>

      {/* DamPage — uses the same UI as the dashboard images section */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DamPage />
      </div>
    </div>
  )
}
