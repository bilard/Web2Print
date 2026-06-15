// src/features/workflows/runtime/notifyRunOutcome.ts
// Message visible de fin de process (toast) — appliqué à TOUS les chemins
// d'exécution (Run global, Pas à pas, RUN par carte).
import { notify } from '@/lib/notify'
import type { RunOutcome } from './executor'

export function notifyRunOutcome(o: RunOutcome, label: string): void {
  if (o.aborted) {
    notify.info(`⏹ « ${label} » arrêté`, 'Exécution interrompue.')
    return
  }
  if (o.errorCount > 0) {
    notify.error(
      `❌ « ${label} » — ${o.errorCount} node(s) en erreur`,
      (o.firstError ?? 'voir les logs').slice(0, 160),
    )
    return
  }
  if (o.firstWarn) {
    notify.warning(`⚠️ « ${label} » terminé avec avertissement`, o.firstWarn.slice(0, 160))
    return
  }
  notify.success(`✅ « ${label} » terminé`, `${o.okCount} node(s) exécuté(s) avec succès.`)
}
