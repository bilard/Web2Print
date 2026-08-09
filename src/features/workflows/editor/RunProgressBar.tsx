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
import { useEffect, useRef, useState } from 'react'
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

/**
 * Silence au-delà duquel on le DIT.
 *
 * ⚠ « 50 % » immobile pendant une heure ne distingue pas un run lent d'un run mort — et
 * sur une chaîne segmentée, une carte en cours ne finit jamais, donc le pourcentage ne
 * bouge plus par construction. Ce qui manquait n'est pas un meilleur pourcentage : c'est
 * de savoir si QUELQUE CHOSE a changé récemment. Trois minutes, parce qu'un lot de vingt
 * textes ou une page de moisson tiennent largement dedans.
 */
const STALLED_MS = 3 * 60_000

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

function Card({ card, locale, live }: { card: RunCard; locale: string; live: boolean }) {
  const Icon = ICON[card.status]
  // ⚠ « En cours » ne veut dire « en cours » que si un run tourne VRAIMENT. Après un arrêt,
  // le dernier écho garde ses cartes en l'état : elles tournaient à l'écran indéfiniment,
  // ce qui laissait croire à un travail qui n'existait plus.
  const running = card.status === 'running' && live
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
      {/* ⚠ Les PASSAGES, pas la progression : sur un run segmenté, une carte repasse des
          dizaines de fois sans jamais « finir ». « ×7 » dit que ça avance là où un statut
          « en cours » figé depuis une heure laisse croire à un blocage. */}
      {(card.cycles ?? 0) > 1 && (
        <span className="tabular-nums text-indigo-300/70">×{card.cycles}</span>
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
  const serverRunActive = useRunContext((s) => s.serverRunActive)
  // Le temps écoulé n'est pas un état : il avance tout seul. Sans ce tic, le compteur
  // reste figé entre deux changements de carte — c'est-à-dire pendant l'essentiel du run.
  //
  // ⚠ `isRunning` ne suffit PAS : il désigne un run lancé DEPUIS CE NAVIGATEUR. Un run
  // planifié n'y touche jamais (`hydrateServerRun` laisse la main à un éventuel run
  // client), donc aucun tic ne partait et « écoulé », « débit » et « restant » restaient
  // figés entre deux échos Firestore — c'est-à-dire des minutes entières. C'est ce qui
  // faisait dire que la barre n'est jamais à jour.
  const live = isRunning || serverRunActive
  const [, tick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [live])

  // Depuis quand plus RIEN ne change — ni les cartes, ni les lignes, ni les cycles.
  // C'est la seule mesure qui répond à « c'est bloqué ou c'est lent ? ».
  const lastChange = useRef({ sig: '', at: Date.now() })

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
  // ⚠ Le compteur de lignes EN FAIT PARTIE : une moisson qui indexe des fiches avance,
  // même si aucune carte ne franchit la ligne. Sans lui, on annoncerait un blocage sur un
  // run parfaitement vivant.
  const sig = `${p.done}/${p.running}/${p.failed}/${p.skipped}/${p.items}/${p.cyclesDone}`
  if (lastChange.current.sig !== sig) lastChange.current = { sig, at: Date.now() }
  const stalledMs = live ? Date.now() - lastChange.current.at : 0
  // ⚠ Les cartes TERMINÉES sont repliées en un compteur. Toutes déployées, la ligne
  // faisait deux mètres de long et ce qui travaille se perdait au milieu de ce qui est
  // fini — or c'est l'inverse qu'on cherche. Le détail reste dans l'onglet « Nodes ».
  const done = p.cards.filter((c) => c.status === 'success')
  const rest = p.cards.filter((c) => c.status !== 'success')

  return (
    // ⚠ UNE seule ligne : sur deux, la bande mangeait le haut du canvas et le regard
    // devait faire l'aller-retour entre le résumé et les cartes qu'il résume.
    <div className="border-b border-neutral-800 bg-well px-3 py-1.5 flex items-center gap-3 text-[11px] overflow-x-auto">
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold tabular-nums ${p.failed > 0 ? 'text-rose-300' : 'text-indigo-300'}`}>
          {pct} %
        </span>
        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
          <div className={`h-full transition-[width] duration-500 ${p.failed > 0 ? 'bg-rose-400/80' : 'bg-indigo-400/80'}`}
            style={{ width: `${pct}%` }} />
        </div>
        {/* ⚠ Les cartes EN COURS sont dites. « 50 % » à côté de « 3/11 cartes » se lisait
            comme une contradiction — 3 sur 11 font 27 % — alors que les deux sont justes :
            une carte en cours compte pour une demie. Le compteur montre donc les trois
            nombres qui expliquent le pourcentage. */}
        <span className="tabular-nums text-white/70 whitespace-nowrap">
          {p.running > 0 && live
            ? t('wfe.progress.cardsRunning', { done: n(p.done), running: n(p.running), total: n(p.total) })
            : t('wfe.progress.cards', { done: n(p.done), total: n(p.total) })}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Les CYCLES d'abord : sur un run segmenté, c'est le seul chiffre qui dit que le
            travail avance — aucune carte n'atteint jamais 100 % au sens du graphe. */}
        {p.cyclesDone > 0 && <Stat label={t('wfe.progress.lbl.cycles')} value={n(p.cyclesDone)} tone="text-indigo-200" />}
        {p.items > 0 && <Stat label={t('wfe.progress.lbl.items')} value={n(p.items)} />}
        {p.itemsPerMin != null && <Stat label={t('wfe.progress.lbl.rate')} value={t('wfe.progress.perMin', { count: n(p.itemsPerMin) })} />}
        {p.elapsedMs > 0 && <Stat label={t('wfe.progress.lbl.elapsed')} value={shortDuration(p.elapsedMs)} />}
        {/* ⚠ Pas d'estimation sur un run ARRÊTÉ : « restant ≈ 59 min » sur une chaîne qui
            ne tourne plus annonce un travail qui n'aura jamais lieu. */}
        {live && p.etaMs != null && <Stat label={t('wfe.progress.lbl.eta')} value={shortDuration(p.etaMs)} tone="text-amber-200/80" />}
        {stalledMs > STALLED_MS && (
          <Stat label={t('wfe.progress.lbl.stalled')} value={shortDuration(stalledMs)} tone="text-amber-300" />
        )}
        {p.failed > 0 && <Stat label={t('wfe.progress.lbl.failed')} value={n(p.failed)} tone="text-rose-300" />}
        {p.skipped > 0 && <Stat label={t('wfe.progress.lbl.skipped')} value={n(p.skipped)} tone="text-amber-300/70" />}
      </div>

      <span className="h-3 w-px bg-white/10 shrink-0" />

      <div className="flex items-center gap-1.5">
        {done.length > 0 && (
          <span className="flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-emerald-400/70"
            title={done.map((c) => c.label).join(' · ')}>
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            {t('wfe.progress.doneCards', { count: n(done.length) })}
          </span>
        )}
        {rest.map((c) => <Card key={c.id} card={c} locale={intlLocale(locale)} live={live} />)}
      </div>
    </div>
  )
}
