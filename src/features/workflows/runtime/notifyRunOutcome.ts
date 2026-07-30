// Message visible de fin de process (toast) — appliqué à TOUS les chemins
// d'exécution (Run global, Pas à pas, RUN par carte).
//
// ⚠️ Trouvé à l'écran : ce toast mélangeait les langues. Le corps reprenait le
// message d'erreur du node (traduit) mais l'en-tête disait « 1 node(s) en
// erreur » en dur. Hors composant → helper `t()` de module.
import { notify } from '@/lib/notify'
import { t } from '@/lib/i18n'
import type { RunOutcome } from './executor'

// Durées longues : un message de fin de run doit laisser le temps de lire.
const DURATION = { aborted: 6_000, error: 20_000, warning: 12_000, success: 8_000 }

export function notifyRunOutcome(o: RunOutcome, label: string): void {
  if (o.aborted) {
    notify.info(t('run.outcome.aborted', { label }), t('run.outcome.abortedBody'), {
      duration: DURATION.aborted,
    })
    return
  }
  if (o.errorCount > 0) {
    notify.error(
      t('run.outcome.error', { label, count: o.errorCount }),
      (o.firstError ?? t('run.outcome.seeLogs')).slice(0, 160),
      { duration: DURATION.error },
    )
    return
  }
  if (o.firstWarn) {
    notify.warning(t('run.outcome.warning', { label }), o.firstWarn.slice(0, 160), {
      duration: DURATION.warning,
    })
    return
  }
  notify.success(t('run.outcome.success', { label }), t('run.outcome.successBody', { count: o.okCount }), {
    duration: DURATION.success,
  })
}
