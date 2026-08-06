// Commande de la compilation, en tête du rail des concurrents.
//
// Sa place n'est pas dans la barre de filtres : la compilation ne filtre pas la liste
// affichée, elle CHANGE ce qui est listé — le rail passe de « un concurrent » à « tous ».
// Le bouton est donc là où l'on choisit le périmètre.
import { Layers, Loader2, X, AlertTriangle } from 'lucide-react'
import type { CompilationState } from './useCompilation'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function ExplorerCompileBar({ state, sites, ready, onRun, onClose }: {
  state: CompilationState
  /** Concurrents qui seront balayés (ceux qui ont des fiches). */
  sites: number
  /** Le catalogue source est lu : sans lui tout serait orphelin, donc rien à contrôler. */
  ready: boolean
  onRun: () => void
  onClose: () => void
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  const active = state.running || state.finished

  if (!active) {
    return (
      <button type="button" onClick={onRun} disabled={!ready || sites === 0}
        title={ready ? t('pwx.compile.help', { count: sites }) : t('pwx.compile.needSource')}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-indigo-200 hover:bg-indigo-500/10 border-b border-white/[0.06] disabled:opacity-30 disabled:hover:text-white/50 disabled:hover:bg-transparent transition-colors">
        <Layers className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{t('pwx.compile.run')}</span>
      </button>
    )
  }

  return (
    <div className="px-2.5 py-2 border-b border-indigo-500/30 bg-indigo-500/[0.07] space-y-1">
      <div className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
        <span className="text-[11px] text-indigo-200 font-medium truncate">{t('pwx.compile.title')}</span>
        <button type="button" onClick={onClose} title={t('pwx.compile.close')}
          className="ml-auto p-0.5 rounded text-white/35 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {state.running ? (
        <p className="text-[10px] text-white/50 flex items-center gap-1.5 tabular-nums">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          {t('pwx.compile.progress', { done: state.done, total: state.total, rows: n(state.rows.length) })}
        </p>
      ) : (
        <p className="text-[10px] text-white/50 tabular-nums">
          {t('pwx.compile.done', { rows: n(state.rows.length), sites: state.total, scanned: n(state.scanned) })}
        </p>
      )}
      {/* Ce que la compilation N'A PAS pu faire. Le taire ferait passer une lecture ratée
          pour un concurrent sans rien à contrôler, et l'export serait incomplet sans que
          personne ne le sache. */}
      {state.failed.length > 0 && (
        <p className="text-[10px] text-amber-300/80 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
          {t('pwx.compile.failed', { list: state.failed.join(', ') })}
        </p>
      )}
      {state.capped && (
        <p className="text-[10px] text-amber-300/80 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
          {t('pwx.compile.capped', { cap: n(state.rows.length) })}
        </p>
      )}
    </div>
  )
}
