// UN seul choix : sur quoi porte ce tableau. PUR.
//
// ⚠⚠ Il en fallait trois auparavant — la source (« Veille — synthèse par concurrent »), le
// suivi, la base produits —, chacun dans son coin et sans lien apparent. Personne ne
// devinait qu'il fallait les combiner, ni lequel commencer. Une entrée de cette liste porte
// la combinaison ENTIÈRE : choisir « Catalogue_GSB_2026 » dit à la fois « ce tableau lit le
// PIM » et « sur cette base ».
//
// ⚠ Les identifiants sont ENCODÉS puis relus ici : le composant n'a pas à savoir ce qu'il y
// a dedans, et une entrée mal formée ne peut pas atteindre le reste du module.
import type { PickerOption } from './BiPicker'
import type { SourceId } from '../types'

/** Les trois angles de la veille, dans l'ordre où on les regarde. */
const WATCH_ANGLES: { source: SourceId; labelKey: string }[] = [
  { source: 'watch.summary', labelKey: 'bi.dataset.watchSummary' },
  { source: 'watch.catalog', labelKey: 'bi.dataset.watchCatalog' },
  { source: 'watch.site', labelKey: 'bi.dataset.watchSite' },
]

export interface DatasetChoice {
  /** Source à lire. */
  source: SourceId
  /** Suivi de veille à activer, quand le choix en désigne un. */
  watchId?: string
  /** Base produits à retenir. `null` = suivre la feuille ouverte dans le module Données. */
  dbId?: string | null
  dbName?: string
}

interface Watch { watchId: string; label?: string }
interface Db { docId: string; name: string; rows: number }

/** Identifiant d'une entrée : `w:<watchId>:<source>` ou `p:<docId>` (`p:` = feuille ouverte). */
const watchId = (w: string, s: SourceId) => `w:${w}:${s}`
const dbId = (d: string) => `p:${d}`

export function datasetOptions(
  watches: Watch[], dbs: Db[], t: (key: string, params?: Record<string, unknown>) => string,
): PickerOption[] {
  const out: PickerOption[] = []
  for (const w of watches) {
    // ⚠ Le groupe NOMME le suivi : avec deux veilles, « Synthèse par concurrent » apparaîtrait
    // deux fois sans qu'on sache laquelle est laquelle.
    const group = watches.length > 1
      ? t('bi.dataset.watchGroupNamed', { name: w.label || w.watchId })
      : t('bi.dataset.watchGroup')
    for (const a of WATCH_ANGLES) {
      out.push({ id: watchId(w.watchId, a.source), label: t(a.labelKey), group })
    }
  }
  const pimGroup = t('bi.dataset.pimGroup')
  out.push({ id: dbId(''), label: t('bi.db.activeSheet'), group: pimGroup })
  for (const d of dbs) {
    out.push({
      id: dbId(d.docId),
      label: t(d.rows === 1 ? 'bi.db.optionOne' : 'bi.db.option', { name: d.name, rows: d.rows }),
      group: pimGroup,
    })
  }
  return out
}

/** L'entrée qui correspond à l'état courant, pour que la liste s'ouvre sur le bon choix. */
export function datasetValue(
  source: SourceId, activeWatch: string | null, activeDb: string | undefined,
): string {
  return source === 'pim.products' ? dbId(activeDb ?? '') : watchId(activeWatch ?? '', source)
}

/** Relit une entrée. `null` si elle ne vient pas de cette liste — jamais un repli deviné. */
export function parseDataset(id: string, dbs: Db[]): DatasetChoice | null {
  if (id.startsWith('p:')) {
    const docId = id.slice(2)
    if (docId === '') return { source: 'pim.products', dbId: null }
    const db = dbs.find((d) => d.docId === docId)
    return db ? { source: 'pim.products', dbId: db.docId, dbName: db.name } : null
  }
  if (!id.startsWith('w:')) return null
  const rest = id.slice(2)
  const cut = rest.lastIndexOf(':')
  if (cut <= 0) return null
  const watch = rest.slice(0, cut)
  const source = rest.slice(cut + 1) as SourceId
  if (!WATCH_ANGLES.some((a) => a.source === source)) return null
  return { source, watchId: watch }
}
