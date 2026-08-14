// L'accueil du module : les trois modèles en cartes. AUTONOME — il ne connaît que
// `onOpen`, et se pose aussi bien sur l'écran vide qu'à côté de la création vierge.
//
// ⚠ Ce composant ne touche NI au bandeau, NI au rail de vues : il s'y branche.
import { Layers, Scale, SquareCheckBig } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from '@/lib/i18n'
import { DASHBOARD_TEMPLATES } from './index'
import { TemplateCard } from './TemplateCard'
import { useCreateFromTemplate } from './useCreateFromTemplate'
import { useTemplateAvailability } from './useTemplateAvailability'
import type { TemplateKey } from './types'

const ICONS: Record<TemplateKey, ComponentType<{ className?: string }>> = {
  watchGaps: Scale, catalogCoverage: Layers, pimCompleteness: SquareCheckBig,
}

export interface TemplateGalleryProps {
  /** Appelé avec l'identifiant du tableau de bord à afficher, créé ou déjà présent. */
  onOpen: (id: string) => void
  /** Rendu SANS son titre ni son introduction (usage en volet, à côté d'un écran déjà rempli). */
  compact?: boolean
  /** Droit d'édition (`useCan('bi.edit')`). Par défaut oui — la création reste alors ouverte. */
  canEdit?: boolean
}

export function TemplateGallery({ onOpen, compact, canEdit = true }: TemplateGalleryProps) {
  const { t } = useTranslation()
  const availabilityOf = useTemplateAvailability()
  const { existingId, create, busy } = useCreateFromTemplate(onOpen)

  return (
    <section className="space-y-4">
      {!compact && (
        <header className="space-y-1 text-center">
          <h2 className="text-sm font-medium text-white">{t('bi.tpl.title')}</h2>
          <p className="text-xs text-white/45">{t('bi.tpl.intro')}</p>
        </header>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_TEMPLATES.map((tpl) => (
          <TemplateCard
            key={tpl.key}
            tpl={tpl}
            icon={ICONS[tpl.key]}
            availability={availabilityOf(tpl)}
            existingId={existingId(tpl)}
            busy={busy === tpl.key}
            canEdit={canEdit}
            onCreate={() => void create(tpl)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  )
}
