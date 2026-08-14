// Barre d'état : d'où viennent les chiffres, combien de lignes, et depuis quand.
//
// ⚠⚠ Les trois se lisent ENSEMBLE. Une source sans volume laisse croire qu'elle est
// complète ; un volume sans âge laisse croire qu'il est frais. Le pied les tient côte à côte
// pour qu'aucun des trois ne puisse mentir seul.
import { useTranslation, intlLocale } from '@/lib/i18n'
import { ageLabel } from '../engine/age'

// ⚠ `pr-[104px]` : les deux boutons flottants d'aide occupent le coin bas-droit de TOUTES
// les pages de l'application. Sans cette réserve, la fraîcheur passe DESSOUS et devient
// illisible — exactement le chiffre qu'on affiche pour qu'il soit vérifiable.
export function BiStatusBar({ sourceLabel, rowCount, updatedAt, now }: {
  /** Libellé DÉJÀ traduit de la source qui alimente les tuiles. */
  sourceLabel: string
  /** `null` = rien n'est chargé — jamais 0, qui se lirait comme « source vide ». */
  rowCount: number | null
  updatedAt: number | null
  /** Horloge FOURNIE : le pied ne bat pas tout seul (il re-rendrait l'écran entier). */
  now: number
}) {
  const { t, locale } = useTranslation()
  return (
    <div className="ml-auto flex items-center gap-3 text-[11px] text-white/30 shrink-0 pl-3 pr-[104px]">
      <span className="truncate max-w-[280px]">{t('bi.status.source', { source: sourceLabel })}</span>
      {rowCount != null && (
        <span className="tabular-nums shrink-0">
          {t('bi.status.rows', { count: rowCount.toLocaleString(intlLocale(locale)) })}
        </span>
      )}
      <span className="tabular-nums shrink-0">
        {updatedAt == null ? t('bi.status.noAge') : t('bi.status.age', { age: ageLabel(updatedAt, now) })}
      </span>
    </div>
  )
}
