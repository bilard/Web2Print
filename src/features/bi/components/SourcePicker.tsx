// Sélecteur de la SOURCE qui alimente les tuiles, à côté du titre du tableau de bord.
//
// ⚠⚠ Ce bandeau parle de ce qui ALIMENTE les tuiles (`demanded`), pas de ce que la liste
// affiche : un tableau de veille rouvert lit son catalogue pendant plusieurs secondes alors
// que la liste, elle, repart sur la source sélectionnée. Sans cette distinction, l'écran
// resterait sur des squelettes sans un mot — l'écran figé sans explication qu'on refuse.
// ⚠ Aucun `<select>` natif (spec lot 2, D5) : le popover maison `BiPicker` (motif
// `AiProviderCard`, fermeture au clic extérieur) sert tous les sélecteurs du module.
import { AlertTriangle, Database, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker } from './BiPicker'
import { getSource } from '../registry/sources'
import { WATCH_SOURCES } from '../registry/watch.source'
import { pimSource } from '../registry/pim.source'
import { useWatchSelection, useWatchSourceState, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

/** Sources proposées, de la moins coûteuse à la plus lourde — c'est l'ordre de lecture. */
const OFFERED: SourceId[] = [pimSource.id, ...WATCH_SOURCES.map((s) => s.id)]
const WATCH_IDS: SourceId[] = WATCH_SOURCES.map((s) => s.id)

export function SourcePicker({ context, demanded, sourceId, onSourceChange }: {
  /** Ce que `useWatchLoader` sait du suivi actif : ses concurrents, la liste des suivis. */
  context: WatchContext
  /** Sources RÉELLEMENT citées par les tuiles posées — ce que l'écran est en train de lire. */
  demanded: SourceId[]
  /** Source des NOUVELLES tuiles. Les tuiles déjà posées gardent la leur (elle est persistée). */
  sourceId: SourceId
  onSourceChange: (id: SourceId) => void
}) {
  const { t } = useTranslation()
  const { setWatchId, setSiteId } = useWatchSelection()
  // Sources de veille concernées : celles qui alimentent des tuiles, plus celle qu'on vient
  // de choisir (elle n'alimente encore rien, mais son état se prépare sous les yeux).
  const shown = WATCH_IDS.filter((id) => demanded.includes(id) || id === sourceId)
  const needsSite = shown.includes('watch.site')

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
        {shown.length > 0 && (
          <BiPicker
            label={t('bi.source.watch')} value={context.watchId ?? ''} options={watchOptions}
            onChange={setWatchId}
          />
        )}
        {/* ⚠⚠ Un seul concurrent en mémoire à la fois : le sélecteur en DÉSIGNE un, il n'en
            précharge aucun autre (plusieurs Mo par site, cf. `useSiteExplorer`). */}
        {needsSite && (siteOptions.length > 0 ? (
          <BiPicker
            label={t('bi.source.pickSite')} value={context.siteId ?? ''} options={siteOptions}
            onChange={setSiteId}
          />
        ) : <span className="text-[11px] text-white/35 mb-1">{t('bi.source.noSite')}</span>)}
      </div>
      {shown.length > 0 && (context.watchId
        ? shown.map((id) => <SourceStatus key={id} sourceId={id} sites={context.sites} />)
        // ⚠ Aucun suivi : le dire, avec le geste à faire. Sans cela, l'écran n'offre qu'un
        // sélecteur de suivi vide, ce qui se lit comme une panne.
        : <Warning text={t('bi.watch.noWatch')} />)}
    </div>
  )
}

/**
 * Ce qu'UNE source de veille est en train de faire. ⚠⚠ Un chargement de plusieurs secondes
 * SANS explication se lit comme une panne : l'avancement s'affiche en TRANCHES, l'unité dans
 * laquelle le catalogue source est réellement relu.
 */
function SourceStatus({ sourceId, sites }: { sourceId: SourceId; sites: WatchContext['sites'] }) {
  const { t } = useTranslation()
  const { siteId } = useWatchSelection()
  const data = useWatchSourceState(sourceId)
  const name = t(getSource(sourceId).labelKey)

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

  // ⚠⚠ Une réserve se dit AUSSI quand la source rend des chiffres (relevé incomplet) : c'est
  // le seul cas où l'avertissement accompagne des totaux au lieu de les remplacer, et le
  // taire ici ferait d'un catalogue amputé un catalogue comme un autre.
  const text = data.message === undefined ? ''
    : data.message.kind === 'key' ? t(data.message.key, data.message.params) : data.message.text
  if (text) {
    // Plusieurs sources peuvent alimenter le même tableau : l'avertissement NOMME la sienne.
    return <Warning text={`${name} — ${text}`} />
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
