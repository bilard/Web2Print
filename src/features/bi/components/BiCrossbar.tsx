// En-tête d'un tableau de bord : son titre, le bouton de création, la barre d'outils.
//
// Extrait de `BiBoard` pour la tenir sous la limite de 150 lignes, et parce que l'en-tête
// est le seul endroit qui parle du CONTEXTE (quel tableau, sur quelles données) — le reste
// du composant ne parle que de tuiles.
import type { ReactNode } from 'react'
import { AlertTriangle, Table2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function BiBoardHeader({
  headerAction, toolbar, activeSheetName, usesMasterCatalogue, builtOnSheetName,
}: {
  /** Bouton « Nouveau tableau de bord », fourni par `BiScreen` qui possède seul `onCreated`. */
  headerAction?: ReactNode
  toolbar: ReactNode
  /** Feuille du module « Données » que les tuiles interrogent RÉELLEMENT, en ce moment. */
  activeSheetName?: string
  /** ⚠ Le moteur a TROIS chemins, pas deux (cf. `useTileData`) : sans feuille exploitable, il
   *  se replie sur le catalogue master du PIM. Annoncer « aucune feuille » pendant que les
   *  tuiles affichent de vrais chiffres serait exactement le mensonge qu'on corrige ici. */
  usesMasterCatalogue?: boolean
  /** Feuille sur laquelle le tableau a été construit (`Dashboard.sourceSheetName`). */
  builtOnSheetName?: string
}) {
  const { t } = useTranslation()
  // ⚠⚠ Deux feuilles aux mêmes en-têtes (un catalogue et celui d'un concurrent) sont
  // interchangeables sans que rien ne le signale : les identifiants de dimension SONT les
  // intitulés de colonnes. Un tableau bâti sur l'une recalcule sur l'autre, sous le même
  // titre et avec les mêmes libellés. L'écart doit donc se voir SANS SURVOL — un `title=`
  // ne serait jamais lu par celui qui ne se doute de rien.
  // ⚠ Le repli sur le catalogue master compte AUSSI comme un écart : les chiffres ne
  // viennent alors pas davantage de la feuille de construction.
  const mismatch = Boolean(builtOnSheetName && (
    usesMasterCatalogue || (activeSheetName && activeSheetName !== builtOnSheetName)
  ))

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">{t('bi.screen.title')}</h1>
          <p className="text-sm text-white/50">{t('bi.screen.intro')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Le jeu de données ne se devine pas : il se lit, à côté du titre. */}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/45">
              <Table2 className="w-3 h-3 shrink-0" />
              {activeSheetName
                ? t('bi.screen.onSheet', { sheet: activeSheetName })
                : usesMasterCatalogue ? t('bi.screen.onMasterCatalog')
                : t('bi.screen.noSheet')}
            </span>
            {mismatch && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/25 px-2 py-1 text-[11px] text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {t('bi.screen.sheetMismatch', { sheet: builtOnSheetName ?? '' })}
              </span>
            )}
          </div>
        </div>
        {headerAction}
      </div>
      {toolbar}
    </header>
  )
}
