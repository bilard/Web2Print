// L'avancement du run, CHIFFRÉ, dans la barre d'outils de l'éditeur.
//
// ⚠ Le bandeau disait « En cours · démarré 18:57 » et rien d'autre : ni combien de cartes
// sont passées, ni laquelle travaille, ni combien de lignes ont été traitées. Sur une
// chaîne de veille qui tourne une heure, on avançait à l'aveugle — et la seule façon de
// savoir était de déplier la console et de lire les journaux à la main.
import { useEffect, useState } from 'react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { runProgress } from '../runtime/runProgress'
import { intlLocale, useTranslation } from '@/lib/i18n'

/** Durée compacte : « 3 min 39 s », « 1 h 12 ». Les secondes disparaissent au-delà de
 *  l'heure — à ce stade, personne ne les lit. */
function shortDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function RunProgressBar() {
  const { t, locale } = useTranslation()
  const wf = useWorkflowStore((s) => s.current)
  const nodeStates = useRunContext((s) => s.nodeStates)
  const isRunning = useRunContext((s) => s.isRunning)
  // Le temps écoulé n'est pas un état : il avance tout seul. Sans ce tic, le compteur
  // reste figé entre deux changements de carte — c'est-à-dire pendant l'essentiel du run.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  if (!wf) return null
  const p = runProgress(wf, nodeStates, (id) => {
    const node = wf.nodes.find((n) => n.id === id)
    const spec = node && nodeRegistry.get(node.type)
    return spec ? t(spec.labelKey) : (node?.type ?? id)
  })
  // Rien de commencé : la barre n'a rien à dire, et une barre à zéro se lit comme une panne.
  if (p.total === 0 || (p.done === 0 && p.running === 0)) return null

  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  return (
    <div className="flex items-center gap-2 min-w-0 shrink-0 rounded-md border border-white/10 bg-well px-2.5 py-1"
      title={p.runningLabels.length > 0 ? t('wfe.progress.running', { cards: p.runningLabels.join(', ') }) : undefined}>
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded bg-white/[0.08]">
        <div className={`h-full transition-[width] duration-500 ${p.failed > 0 ? 'bg-rose-400/80' : 'bg-indigo-400/80'}`}
          style={{ width: `${Math.round(p.ratio * 100)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-white/70 whitespace-nowrap">
        {t('wfe.progress.cards', { done: n(p.done), total: n(p.total) })}
      </span>
      {/* Ce qui TRAVAILLE, pas seulement combien : « 4/12 » ne dit pas si on attend une
          moisson de vingt minutes ou l'envoi d'un mail. */}
      {p.runningLabels.length > 0 && (
        <span className="text-[11px] text-indigo-300/80 truncate max-w-[180px]">
          {p.runningLabels[0]}{p.runningLabels.length > 1 ? ` +${p.runningLabels.length - 1}` : ''}
        </span>
      )}
      {p.items > 0 && (
        <span className="text-[11px] tabular-nums text-white/45 whitespace-nowrap">
          {t('wfe.progress.items', { count: n(p.items) })}
        </span>
      )}
      {p.elapsedMs > 0 && (
        <span className="text-[11px] tabular-nums text-white/35 whitespace-nowrap">{shortDuration(p.elapsedMs)}</span>
      )}
      {p.failed > 0 && (
        <span className="text-[11px] tabular-nums text-rose-300 whitespace-nowrap">
          {t('wfe.progress.failed', { count: n(p.failed) })}
        </span>
      )}
      {p.skipped > 0 && (
        <span className="text-[11px] tabular-nums text-amber-300/70 whitespace-nowrap">
          {t('wfe.progress.skipped', { count: n(p.skipped) })}
        </span>
      )}
    </div>
  )
}
