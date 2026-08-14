// Le nom LISIBLE d'une dimension, pour les puces de filtre et les messages.
//
// ⚠ Une dimension porte deux libellés possibles : `label` quand son nom vient de la DONNÉE
// (l'intitulé réel d'une colonne de feuille) et `labelKey` quand il vient du catalogue i18n
// (une source déclarée). Afficher l'identifiant technique — `domain`, `taxo.1` — au lieu de
// l'un des deux est le défaut qui a fait juger l'écran inutilisable ; il ne doit reparaître
// nulle part.
import type { DataSource } from '../registry/types'
import type { TranslationKey } from '@/lib/i18n'

export function dimensionLabel(
  source: DataSource,
  field: string,
  t: (key: TranslationKey) => string,
): string {
  const dim = source.dimensions.find((d) => d.id === field)
  if (!dim) return field
  return dim.label ?? t(dim.labelKey)
}
