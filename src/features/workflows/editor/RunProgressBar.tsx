// L'avancement du run, CHIFFRÉ et CARTE PAR CARTE, sous la barre d'outils.
//
// ⚠ Le bandeau disait « En cours · démarré 18:57 » et rien d'autre : ni combien de cartes
// sont passées, ni laquelle travaille, ni combien de lignes ont été traitées. Sur une
// chaîne de veille qui tourne une heure, on avançait à l'aveugle — et la seule façon de
// savoir était de déplier la console et de lire les journaux à la main.
//
// ⚠ Sur sa PROPRE ligne, pas glissé entre les boutons : coincé au milieu de la rangée
// d'actions, le résumé se lisait comme un bouton de plus, et les noms de cartes n'avaient
// nulle part où aller. Une bande pleine largeur laisse la place de tout nommer.
import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, AlertCircle, MinusCircle, Circle } from 'lucide-react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { runProgress, type RunCard } from '../runtime/runProgress'
import type { NodeStatus } from '../types'
import { intlLocale, useTranslation } from '@/lib/i18n'

/** Durée compacte : « 39 s », « 3 min 39 s », « 1 h 12 ». Les secondes disparaissent
 *  au-delà de l'heure — à ce stade, personne ne les lit. */
function shortDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

const ICON: Record<NodeStatus, typeof Circle> = {
  pending: Circle, running: Loader2, success: CheckCircle2, error: AlertCircle, skipped: MinusCircle,
}
const TINT: Record<NodeStatus, string> = {
  pending: 'text-white/25',
  running: 'text-indigo-300',
  success: 'text-emerald-400/80',
  error: 'text-rose-400',
  skipped: 'text-amber-300/70',
}

/** Une mesure ÉTIQUETÉE : un nombre nu au milieu d'autres nombres nus ne se lit pas. */
function Stat({ label, value, tone = 'text-white/70' }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10px] uppercase tracking-wide text-white/30">{label}</span>
      <span className={`tabular-nums font-medium ${tone}`}>{value}</span>
    </span>
  )
}

function Card({ card, locale }: { card: RunCard; locale: string }) {
  const Icon = ICON[card.status]
  const running = card.status === 'running'
  return (
    <span className={`flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 ${
      running ? 'bg-indigo-500/10 border border-indigo-400/25' : ''
    }`}>
      <Icon className={`w-3 h-3 shrink-0 ${TINT[card.status]} ${running ? 'animate-spin' : ''}`} />
      <span className={card.status === 'pending' ? 'text-white/30' : 'text-white/70'}>{card.label}</span>
      {/* Ce que la carte a produit : c'est le seul chiffre qui dit si elle avance ou
          si elle est simplement lente. */}
      {typeof card.count === 'number' && card.count > 0 && (
        <span className="tabular-nums text-white/45">{card.count.toLocaleString(locale)}</span>
      )}
      {card.durationMs != null && card.durationMs > 1000 && (
        <span className="tabular-nums text-white/25">{shortDuration(card.durationMs)}</span>
      )}
    </span>
  )
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
  // Rien de commencé : la bande n'a rien à dire, et une barre à zéro se lit comme une panne.
  if (p.total === 0 || (p.done === 0 && p.running === 0)) return null

  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  const pct = Math.round(p.ratio * 100)
  // ⚠ Les cartes TERMINÉES sont repliées en un compteur. Toutes déployées, la ligne
  // faisait deux mètres de long et ce qui travaille se perdait au milieu de ce qui est
  // fini — or c'est l'inverse qu'on cherche. Le détail reste dans l'onglet « Nodes ».
  const done = p.cards.filter((c) => c.status === 'success')
  const rest = p.cards.filter((c) => c.status !== 'success')

  return (
    <div className="border-b border-neutral-800 bg-well">
      <div className="px-3 py-2 flex items-center gap-4 text-xs">
        {/* Le CHIFFRE d'abord, en grand : c'est la première chose qu'on vient chercher. */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={`text-sm font-semibold tabular-nums ${p.failed > 0 ? 'text-rose-300' : 'text-indigo-300'}`}>
            {pct} %
          </span>
          <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
            <div className={`h-full transition-[width] duration-500 ${p.failed > 0 ? 'bg-rose-400/80' : 'bg-indigo-400/80'}`}
              style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums text-white/70 whitespace-nowrap">
            {t('wfe.progress.cards', { done: n(p.done), total: n(p.total) })}
          </span>
        </div>

        {/* Les mesures, chacune étiquetée : un nombre nu au milieu d'autres nombres nus ne
            se lit pas. */}
        <div className="flex items-center gap-4 shrink-0 text-[11px]">
          {p.items > 0 && <Stat label={t('wfe.progress.lbl.items')} value={n(p.items)} />}
          {p.itemsPerMin != null && <Stat label={t('wfe.progress.lbl.rate')} value={t('wfe.progress.perMin', { count: n(p.itemsPerMin) })} />}
          {p.elapsedMs > 0 && <Stat label={t('wfe.progress.lbl.elapsed')} value={shortDuration(p.elapsedMs)} />}
          {p.etaMs != null && <Stat label={t('wfe.progress.lbl.eta')} value={shortDuration(p.etaMs)} tone="text-amber-200/80" />}
          {p.failed > 0 && <Stat label={t('wfe.progress.lbl.failed')} value={n(p.failed)} tone="text-rose-300" />}
          {p.skipped > 0 && <Stat label={t('wfe.progress.lbl.skipped')} value={n(p.skipped)} tone="text-amber-300/70" />}
        </div>
      </div>

      {/* Ce qui TRAVAILLE et ce qui ATTEND, sur sa propre ligne. Les terminées se résument
          à leur compte : savoir « 3/11 » ne dit pas ce qui reste — cette ligne, si. */}
      <div className="px-3 pb-2 flex items-center gap-1.5 text-[11px] overflow-x-auto">
        {done.length > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-emerald-400/70"
            title={done.map((c) => c.label).join(' · ')}>
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            {t('wfe.progress.doneCards', { count: n(done.length) })}
          </span>
        )}
        {rest.map((c) => <Card key={c.id} card={c} locale={intlLocale(locale)} />)}
      </div>
    </div>
  )
}
