// En-tête d'un tableau de bord : son titre, le bouton de création, la barre d'outils.
//
// Extrait de `BiBoard` pour la tenir sous la limite de 150 lignes, et parce que l'en-tête
// est le seul endroit qui parle du CONTEXTE (quel tableau, sur quelles données) — le reste
// du composant ne parle que de tuiles.
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n'

export function BiBoardHeader({ headerAction, toolbar }: {
  /** Bouton « Nouveau tableau de bord », fourni par `BiScreen` qui possède seul `onCreated`. */
  headerAction?: ReactNode
  toolbar: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('bi.screen.title')}</h1>
          <p className="text-sm text-white/50">{t('bi.screen.intro')}</p>
        </div>
        {headerAction}
      </div>
      {toolbar}
    </header>
  )
}
