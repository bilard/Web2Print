// La galerie de modèles en fenêtre, appelée depuis le menu du bandeau.
//
// ⚠ En fenêtre plutôt qu'en volet déroulant : trois cartes de 46 rem ne tiennent pas sous un
// bouton sans déborder de la zone de contenu, où elles se faisaient ROGNER. Une fenêtre se
// pose au centre et ne dépend d'aucun ancrage.
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { TemplateGallery } from './TemplateGallery'

export function TemplatesDialog({ open, onOpenChange, onOpen, canEdit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Identifiant du tableau à afficher — créé depuis le modèle, ou déjà présent. */
  onOpen: (id: string) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-6 overflow-auto"
      role="dialog" aria-modal="true">
      {/* Le fond ferme : sans lui, un clic à côté laisse croire que l'écran est bloqué. */}
      <button type="button" aria-label={t('bi.detail.close')} onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-4xl mt-10 rounded-xl border border-white/10 bg-surface p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-medium text-white">{t('bi.tpl.title')}</h2>
            <p className="text-xs text-white/45 mt-0.5">{t('bi.tpl.intro')}</p>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label={t('bi.detail.close')}
            className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* ⚠ La fenêtre se referme sur l'ouverture : la garder au-dessus du tableau qu'on
            vient d'afficher masquerait le résultat du clic. */}
        <TemplateGallery compact canEdit={canEdit}
          onOpen={(id) => { onOpenChange(false); onOpen(id) }} />
      </div>
    </div>
  )
}
