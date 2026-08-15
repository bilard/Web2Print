// Le volet « Source », à gauche du canevas : sur quoi porte ce tableau.
//
// ⚠⚠ En LISTE et non en menu déroulant : un menu cache ses entrées jusqu'au clic, et c'est
// précisément ce qui rendait le choix incompréhensible — on ne voyait ni qu'une veille et
// une base produits s'excluent, ni combien il y en avait. Tout est sous les yeux, le choix
// courant surligné.
//
// ⚠ Rendu en ÉDITION seulement : ce choix ÉCRIT dans le document (il change la source des
// tuiles). En consultation, le bandeau dit en toutes lettres ce qui alimente l'écran.
import { Database, Scale } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { datasetOptions, datasetValue, parseDataset, type DatasetChoice } from './datasetOptions'
import { usePimDbList, usePimDbLoader } from '../hooks/usePimDatabases'
import type { WatchSummary } from '@/features/priceWatch/useCatalogReport'
import type { SourceId } from '../types'

export function BiSourceRail({
  watches, sourceId, watchId, dbId, sheetName, demanded, readOnly = false, onChoose,
}: {
  watches: WatchSummary[]
  sourceId: SourceId
  watchId: string | null
  dbId: string | undefined
  sheetName?: string
  /** Sources RÉELLEMENT lues par les tuiles posées. ⚠⚠ Distinctes de la sélection : poser
   *  une tuile PIM sur un tableau de veille est légitime, mais le volet ne doit pas laisser
   *  croire que le tableau a changé de jeu de données — c'est ce qui faisait chercher
   *  pourquoi un sélecteur de concurrent subsistait après avoir cliqué une base produits. */
  demanded: SourceId[]
  /**
   * Mode CONSULTATION : on peut regarder le même tableau sur un autre suivi ou une autre
   * base — c'est une exploration, elle ne touche pas au document. Changer la NATURE du jeu
   * de données, en revanche, rebâtit les tuiles : ce geste-là reste à l'Édition, et les
   * entrées concernées le DISENT au survol plutôt que de ne rien faire au clic.
   */
  readOnly?: boolean
  onChoose: (choice: DatasetChoice) => void
}) {
  const { t } = useTranslation()
  const { items, loading } = usePimDbList()
  // ⚠ Le chargement de la base retenue vit ici : ce volet, en étant monté, atteste que le
  // module est en train de construire — donc qu'une base peut être réclamée.
  usePimDbLoader({ dbId, sheetName, list: items, listLoading: loading })

  const options = datasetOptions(watches, items, t as (k: string, p?: Record<string, unknown>) => string)
  const active = datasetValue(sourceId, watchId, dbId)
  // Ce que le tableau LIT, entrée par entrée : la veille sur le suivi actif, et la base
  // produits retenue.
  /** L'entrée s'applique-t-elle DIRECTEMENT à ce tableau ? Les autres restent cliquables :
   *  ⚠⚠ un bouton grisé est un mur — on ne sait ni pourquoi, ni quoi faire ensuite. Le clic
   *  explique, et propose de créer un tableau sur ce jeu de données. */
  const direct = (id: string): boolean => {
    if (!readOnly) return true
    const c = parseDataset(id, items)
    return c !== null && demanded.includes(c.source)
  }

  const isRead = (id: string): boolean => {
    const c = parseDataset(id, items)
    if (!c || !demanded.includes(c.source)) return false
    if (c.source === 'pim.products') return (c.dbId ?? null) === (dbId ?? null)
    return c.watchId === watchId
  }

  // Les entrées arrivent déjà groupées dans l'ordre : on ne fait que poser les intertitres.
  const groups: { name: string; items: typeof options }[] = []
  for (const o of options) {
    const name = o.group ?? ''
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.items.push(o)
    else groups.push({ name, items: [o] })
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-surface border-r border-white/[0.06] overflow-y-auto">
      <p className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-wider text-white/35">
        {t('bi.dataset.label')}
      </p>
      {groups.map((g) => (
        <div key={g.name} className="pb-2">
          <p className="flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-medium text-white/45">
            {g.name.startsWith(t('bi.dataset.pimGroup'))
              ? <Database className="w-3 h-3 shrink-0" />
              : <Scale className="w-3 h-3 shrink-0" />}
            <span className="truncate">{g.name}</span>
          </p>
          {g.items.map((o) => (
            <button
              key={o.id} type="button"
              title={!direct(o.id)
                ? t('bi.dataset.otherBoard')
                : isRead(o.id) ? `${o.label} — ${t('bi.dataset.feeds')}` : o.label}
              // ⚠ Une entrée qui ne se relit pas est IGNORÉE, jamais remplacée par un repli
              // deviné : le tableau lirait un jeu de données que personne n'a désigné.
              onClick={() => { const c = parseDataset(o.id, items); if (c) onChoose(c) }}
              className={`w-full text-left px-3 py-1.5 text-[11.5px] truncate transition-colors ${
                o.id === active
                  ? 'bg-indigo-500/15 text-indigo-200 border-l-2 border-indigo-400'
                  : direct(o.id)
                    ? 'text-white/65 hover:text-white hover:bg-white/[0.05] border-l-2 border-transparent'
                    // Estompée, jamais éteinte : elle reste un chemin.
                    : 'text-white/40 hover:text-white hover:bg-white/[0.05] border-l-2 border-transparent'
              }`}
            >
              {/* ⚠ Le point vert dit « ALIMENTE ce tableau », le surlignage dit « choisi
                  pour la prochaine tuile ». Les deux ne coïncident pas toujours, et les
                  confondre laissait croire que le tableau avait changé de jeu de données. */}
              {isRead(o.id) && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle" />
              )}
              {o.label}
            </button>
          ))}
        </div>
      ))}
      {loading && (
        <p className="px-3 py-1 text-[10.5px] text-white/30">{t('bi.db.listing')}</p>
      )}
    </aside>
  )
}
