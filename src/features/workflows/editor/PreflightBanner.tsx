// Bandeau PERMANENT des incohérences du workflow.
//
// Le contrôle de cohérence n'existait qu'au clic sur « Lancer », et ne s'affichait que
// s'il trouvait quelque chose : un workflow mal câblé ne se signalait donc qu'au pire
// moment — ou jamais, quand le run part du planning ou d'une carte. Ici, l'état est
// visible en permanence, avant tout lancement, et se corrige à froid.
import { AlertTriangle, TriangleAlert } from 'lucide-react'
import type { WorkflowIssue } from '../runtime/validateWorkflow'
import { useTranslation } from '@/lib/i18n'

export function PreflightBanner({ issues, errors, onOpen }: {
  issues: WorkflowIssue[]
  /** Nombre d'incohérences BLOQUANTES (le reste est un avertissement). */
  errors: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  if (issues.length === 0) return null
  const warnings = issues.length - errors
  const blocking = errors > 0
  // ⚠️ Pluriel par CLÉS dédiées. L'ancienne version recollait un « s » au mot
  // traduit (`${t('wfc.inconsistency')}s`) et affichait « 2 inconsistencys » en
  // anglais : une règle de pluriel française ne survit pas à la traduction.
  const inconsistencies = (n: number) => t(n > 1 ? 'wfc.inconsistencies.many' : 'wfc.inconsistencies.one', { count: n })
  const warns = (n: number) => t(n > 1 ? 'wfc.warnings.many' : 'wfc.warnings.one', { count: n })
  return (
    <button
      onClick={onOpen}
      title={t('wfc.detail')}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs border-b transition-colors ${
        blocking
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200 hover:bg-rose-500/15'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/15'
      }`}
    >
      {blocking ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <TriangleAlert className="w-3.5 h-3.5 shrink-0" />}
      <span className="font-medium">
        {blocking ? inconsistencies(errors) : warns(warnings)}
      </span>
      <span className="text-white/50 truncate">
        {blocking && warnings > 0 ? `+ ${warns(warnings)} · ` : ''}
        {issues[0].nodeLabel} — {issues[0].message}
      </span>
      <span className="ml-auto shrink-0 underline underline-offset-2 opacity-80">{t('wfc.see')}</span>
    </button>
  )
}
