// Les vingt derniers runs : début, durée, issue, volume.
// ⚠ La tendance des durées ne s'affiche plus ici mais dans l'en-tête (`OpsHeader`) : en bas
// de page et en petit, elle passait inaperçue alors que c'est l'information d'exploitation
// la plus utile de l'écran. Elle n'est pas dupliquée — un seul endroit la porte.
import { Clock } from 'lucide-react'
import type { RunHistoryEntry } from './useRunHistory'
import { when, duration } from '../dashboard/format'
import { useTranslation } from '@/lib/i18n'

const STATUS_TONE: Record<string, string> = {
  success: 'text-emerald-400/80', partial: 'text-amber-300/80', error: 'text-rose-400', stopped: 'text-white/40',
}

export function RunHistory({ runs }: { runs: RunHistoryEntry[] }) {
  const { t } = useTranslation()

  // Aucun run persisté encore : rien à raconter, pas de tableau vide muet.
  if (runs.length === 0) return null

  return (
    <div className="bg-surface rounded-lg p-4 flex flex-col h-full min-h-0" data-pw-section="ops-history">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-white/40" />
        <h3 className="text-sm font-semibold text-white">{t('ops.history.title')}</h3>
      </div>
      {/* `flex-1 min-h-0` : la liste prend toute la hauteur restante du panneau et scrolle
          seule. Sans `min-h-0`, un enfant flex refuse de rétrécir sous son contenu et
          c'est la PAGE qui s'allonge. */}
      <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[12px] tabular-nums">
            <span className="text-white/50 w-32 shrink-0">{when(r.startedAt)}</span>
            {/* Pas de branche « fin manquante » : la requête (`useRunHistory`) trie sur
                `endedAt`, que Firestore exclut donc des résultats quand il est absent —
                un run de cette liste a TOUJOURS sa fin. */}
            <span className="text-white/70 w-16 shrink-0">{duration((r.endedAt as number) - r.startedAt)}</span>
            <span className={`w-20 shrink-0 ${STATUS_TONE[r.status] ?? 'text-white/50'}`}>
              {t(`rd.wf.status.${r.status}` as 'rd.wf.status.running')}
            </span>
            {/* ⚠ Le DÉCLENCHEUR, à côté de l'issue : « 4 s · Terminé » ne se lit pas
                pareil selon qu'un cron est passé à vide ou qu'on a cliqué pour essayer. */}
            <span className="w-28 shrink-0 text-white/35 truncate">
              {r.trigger ? t(`rd.wf.trigger.${r.trigger}` as 'rd.wf.trigger.cron') : '—'}
            </span>
            <span className="text-white/35 flex-1 truncate text-right">
              {t('ops.history.nodes', { n: r.nodesTotal })}
              {r.nodesError > 0 ? ` · ${t('ops.history.errors', { n: r.nodesError })}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
