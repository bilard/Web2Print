// Barre transversale, juste au-dessus du canevas : sur QUOI la page est calculée.
//
// Anciennement `BiBoardHeader`. L'écran a désormais un vrai bandeau supérieur (`BiTopBar`) ;
// il restait à ce composant sa seule raison d'être — dire le jeu de données réellement lu, et
// avertir quand ce n'est plus celui de construction.
import { AlertTriangle, Table2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { ReactNode } from 'react'

export function BiCrossbar({
  activeSheetName, usesMasterCatalogue, builtOnSheetName, trailing,
}: {
  /** Feuille du module « Données » que les tuiles interrogent RÉELLEMENT, en ce moment. */
  activeSheetName?: string
  /** ⚠ Le moteur a TROIS chemins, pas deux (cf. `useTileData`) : sans feuille exploitable, il
   *  se replie sur le catalogue master du PIM. Annoncer « aucune feuille » pendant que les
   *  tuiles affichent de vrais chiffres serait exactement le mensonge qu'on corrige ici. */
  usesMasterCatalogue?: boolean
  /** Feuille sur laquelle le tableau a été construit (`Dashboard.sourceSheetName`). */
  builtOnSheetName?: string
  /** Ce que le tableau de bord pose à droite de la barre : aujourd'hui le menu d'ajout de
   *  tuile, demain les puces de filtres actifs (chacune retirable, cf. spec lot 2, D4). */
  trailing?: ReactNode
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
    <div className="flex flex-wrap items-center gap-2 shrink-0 min-h-[38px] px-3 py-1.5 bg-surface border-b border-white/[0.06]">
      {/* Le jeu de données ne se devine pas : il se lit, au-dessus des chiffres. */}
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
      {trailing}
    </div>
  )
}
