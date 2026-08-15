// Ce qu'UNE source est en train de faire, dit là où l'utilisateur choisit sa source.
//
// ⚠ Sorti de `SourcePicker` pour laisser la place au sélecteur de base : le fichier passait
// les 150 lignes. Rien d'autre n'a changé.
// ⚠ Le type `WatchContext` vient du HOOK (`hooks/useWatchData`), jamais de `SourcePicker` :
// un type exporté depuis un module de composant est la cause récurrente des cycles de ce
// projet.
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { getSource } from '../registry/sources'
import { useWatchSelection, useWatchSourceState, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

/**
 * ⚠⚠ Un chargement de plusieurs secondes SANS explication se lit comme une panne :
 * l'avancement s'affiche en TRANCHES, l'unité dans laquelle le catalogue source est relu.
 */
export function SourceStatus({ sourceId, sites }: { sourceId: SourceId; sites: WatchContext['sites'] }) {
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

  // ⚠⚠ Ni la limite du lot 3, ni « rien n'est chargé » ne dépendent de LA source : rendues
  // ici, elles se répétaient mot pour mot autant de fois qu'il y avait de sources en jeu —
  // deux lignes de bandeau pour une seule information. `SourceStatusList` les dit une fois.
  return null
}

/** Ce qui empêche de mesurer, dit là où l'utilisateur choisit sa source — jamais en note. */
export function Warning({ text }: { text: string }) {
  return (
    <span className="inline-flex items-start gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/25 px-2 py-1 text-[11px] text-amber-200 max-w-2xl">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
      {text}
    </span>
  )
}

/** Un chargement en cours, nommé et chiffré. Muet ne veut pas dire immobile. */
export function Loading({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-white/45">
      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
      {text}
    </span>
  )
}
