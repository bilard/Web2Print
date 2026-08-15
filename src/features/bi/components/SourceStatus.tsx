// Ce qu'UNE source est en train de faire, dit là où l'utilisateur choisit sa source.
//
// ⚠ Sorti de `SourcePicker` pour laisser la place au sélecteur de base : le fichier passait
// les 150 lignes. Rien d'autre n'a changé.
// ⚠ Le type `WatchContext` vient du HOOK (`hooks/useWatchData`), jamais de `SourcePicker` :
// un type exporté depuis un module de composant est la cause récurrente des cycles de ce
// projet.
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { getSource } from '../registry/sources'
import { useWatchSourceState } from '../hooks/useWatchData'
import type { SourceId } from '../types'

/**
 * Ce qui EMPÊCHE de mesurer, ou la réserve qui accompagne des chiffres. L'avancement d'un
 * chargement, lui, vit dans le bandeau (`BiProgressBar`).
 */
export function SourceStatus({ sourceId }: { sourceId: SourceId }) {
  const { t } = useTranslation()
  const data = useWatchSourceState(sourceId)
  const name = t(getSource(sourceId).labelKey)

  // ⚠⚠ Le CHARGEMENT n'est plus dit ici : il vit dans le bandeau, en barre de progression
  // (`BiProgressBar`). Une phrase grise sous le bandeau ne se voyait pas — et la redire
  // ici, à côté de la barre, ferait deux fois la même information.
  if (data.state === 'loading') return null

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

