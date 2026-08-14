// Sélecteur de la SOURCE qui alimente les tuiles, à côté du titre du tableau de bord.
//
// ⚠⚠ Une tuile qui affiche un chiffre sans dire d'où il vient est invérifiable : ce bandeau
// nomme la source, le suivi de veille actif et, pour les fiches d'un concurrent, le site lu.
// ⚠ Aucun `<select>` natif (spec lot 2, D5) : le popover maison `BiPicker` (motif
// `AiProviderCard`, fermeture au clic extérieur) sert tous les sélecteurs du module.
import { AlertTriangle, Database, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { getSource } from '../registry/sources'
import { WATCH_SOURCES } from '../registry/watch.source'
import { pimSource } from '../registry/pim.source'
import { useWatchSelection, useWatchSourceState, isWatchSource, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

/** Sources proposées, de la moins coûteuse à la plus lourde — c'est l'ordre de lecture. */
const OFFERED: SourceId[] = [pimSource.id, ...WATCH_SOURCES.map((s) => s.id)]

export function SourcePicker({ context, sourceId, onSourceChange }: {
  /** Ce que `useWatchLoader` sait du suivi actif : ses concurrents, la liste des suivis. */
  context: WatchContext
  /** Source des NOUVELLES tuiles. Les tuiles déjà posées gardent la leur (elle est persistée). */
  sourceId: SourceId
  onSourceChange: (id: SourceId) => void
}) {
  const { t } = useTranslation()
  const { setWatchId, setSiteId } = useWatchSelection()
  const data = useWatchSourceState(sourceId)
  const onWatch = isWatchSource(sourceId)

  const sourceOptions = OFFERED.map((id) => ({ id, label: t(getSource(id).labelKey) }))
  const watchOptions = context.watches.map((w) => ({ id: w.watchId, label: w.label || w.watchId }))
  const siteOptions = context.sites.map((s) => ({ id: s.siteId, label: s.domain }))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <Database className="w-3.5 h-3.5 text-white/30 mb-1.5 shrink-0" />
        <BiPicker
          label={t('bi.source.picker')} value={sourceId} options={sourceOptions}
          // ⚠ L'identifiant vient de `OFFERED`, donc du registre : jamais une chaîne libre.
          onChange={(id) => { const s = OFFERED.find((x) => x === id); if (s) onSourceChange(s) }}
        />
        {onWatch && (
          <BiPicker
            label={t('bi.source.watch')} value={context.watchId ?? ''} options={watchOptions}
            onChange={setWatchId}
          />
        )}
        {/* ⚠⚠ Un seul concurrent en mémoire à la fois : le sélecteur en DÉSIGNE un, il n'en
            précharge aucun autre (plusieurs Mo par site, cf. `useSiteExplorer`). */}
        {sourceId === 'watch.site' && (
          siteOptions.length > 0 ? (
            <BiPicker
              label={t('bi.source.pickSite')} value={context.siteId ?? ''} options={siteOptions}
              onChange={setSiteId}
            />
          ) : (
            <span className="text-[11px] text-white/35 mb-1">{t('bi.source.noSite')}</span>
          )
        )}
      </div>
      {onWatch && <SourceStatus sourceId={sourceId} data={data} sites={context.sites} />}
    </div>
  )
}

/**
 * Ce que la source est en train de faire. ⚠⚠ Un chargement de plusieurs secondes SANS
 * explication se lit comme une panne : l'avancement s'affiche en TRANCHES, l'unité dans
 * laquelle le catalogue source est réellement relu.
 */
function SourceStatus({ sourceId, data, sites }: {
  sourceId: SourceId
  data: ReturnType<typeof useWatchSourceState>
  sites: WatchContext['sites']
}) {
  const { t } = useTranslation()
  const { siteId, watchId } = useWatchSelection()

  // ⚠ Aucun suivi : le dire AVANT tout le reste, avec le geste à faire. Sans cela, l'écran
  // n'offre qu'un sélecteur de suivi vide, ce qui se lit comme une panne.
  if (!watchId) return <Warning text={t('bi.watch.noWatch')} />

  if (data.state === 'loading') {
    const { done, total, expected } = data.progress
    const site = sites.find((s) => s.siteId === siteId)?.domain ?? siteId ?? ''
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-white/45">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        {sourceId === 'watch.site'
          ? t('bi.source.loadingSite', { site })
          : t('bi.source.loadingCatalog', { done, total, expected })}
      </span>
    )
  }

  // ⚠⚠ Un total sous-compté est le pire des résultats : la cause s'affiche en AVERTISSEMENT,
  // pas en note de bas de page, et les tuiles refusent de mesurer tant qu'elle tient.
  if (data.state === 'error' || data.state === 'empty') {
    const text = data.message === undefined ? ''
      : data.message.kind === 'key' ? t(data.message.key, data.message.params) : data.message.text
    if (text) return <Warning text={text} />
  }

  return (
    <span className="text-[11px] text-white/30">
      {data.state === 'idle' ? t('bi.source.idle') : t('bi.source.serverNeeded')}
    </span>
  )
}

/** Ce qui empêche de mesurer, dit là où l'utilisateur choisit sa source — jamais en note. */
function Warning({ text }: { text: string }) {
  return (
    <span className="inline-flex items-start gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/25 px-2 py-1 text-[11px] text-amber-200 max-w-2xl">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
      {text}
    </span>
  )
}
