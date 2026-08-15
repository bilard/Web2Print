// Le filtre d'un coup d'œil : choisir une valeur, et toute la page s'y restreint.
//
// ⚠⚠ Le filtrage croisé existait déjà — cliquer une barre restreint la page — mais rien ne
// l'annonçait : on cherchait « comment sélectionner un concurrent » sans trouver de porte
// d'entrée. Ce sélecteur EST cette porte, et il pose exactement le même filtre : une seule
// mécanique, une seule puce à retirer.
import { useMemo } from 'react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { filterOptions } from '../filters/filterOptions'
import { dimensionLabel } from '../filters/dimensionLabel'
import { useSourceRows } from '../hooks/useSourceRows'
import type { DataSource } from '../registry/types'
import type { SourceId } from '../types'

/** Valeur du sélecteur quand rien n'est filtré. ⚠ Une chaîne vide ne peut pas entrer en
 *  collision avec une valeur réelle : celles-ci sont préfixées ci-dessous. */
const ALL = ''
const VALUE_PREFIX = 'v:'

export function BiQuickFilter({ sourceId, source, field, value, onChange }: {
  sourceId: SourceId
  source: DataSource
  /** Dimension filtrée (par exemple le concurrent). */
  field: string
  /** Valeur active, `null` si aucune. */
  value: string | null
  onChange: (value: string | null) => void
}) {
  const { t } = useTranslation()
  const rows = useSourceRows(sourceId)
  const dim = source.dimensions.find((d) => d.id === field)

  const options = useMemo(() => {
    if (!dim) return []
    // ⚠ Les valeurs viennent des LIGNES, jamais d'une liste écrite à la main : proposer une
    // valeur absente des données ne retiendrait rien, et l'écran se viderait sans raison.
    const { options: found } = filterOptions(rows, dim)
    return [
      { id: ALL, label: t('bi.filter.all') },
      ...found
        // Une valeur ABSENTE n'a pas sa place dans un filtre rapide : elle désigne un groupe
        // sans nom, qu'on choisit dans le volet des filtres, pas d'un coup d'œil.
        .filter((o) => o.value !== null)
        .map((o) => ({ id: `${VALUE_PREFIX}${o.value!}`, label: `${o.value!} (${o.count})` })),
    ]
  }, [rows, dim, t])

  if (!dim || options.length <= 1) return null

  return (
    <BiPicker
      label={dimensionLabel(source, field, t)}
      hint={t('bi.filter.quickHint')}
      value={value === null ? ALL : `${VALUE_PREFIX}${value}`}
      options={options}
      onChange={(id) => onChange(id === ALL ? null : id.slice(VALUE_PREFIX.length))}
    />
  )
}
