// functions/src/workflow/nodes/sendWindow.ts
// Jumeau SERVEUR du node « Cadence d'envoi ». C'est LE cas d'usage : le cron passe toutes
// les demi-heures, et seul ce node décide qu'un mail part le lundi à 8 h.
//
// ⚠ La mémoire du dernier envoi est la MÊME que celle du client (users/{uid}/sendWindows)
// — sinon le navigateur et le cron enverraient chacun le leur pour la même période.
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import {
  evaluateWindow, timeZoneForLocale, weekdayName, DEFAULT_SEND_WINDOW,
  type SendFrequency, type SendWindowConfig, type WindowVerdict,
} from '../sendWindow'
import type { Locale } from '../../i18n'
import { t } from '../../i18n'

/** La phrase du journal, dans la langue de l'utilisateur — jumelle de celle du client. */
function closedReason(v: WindowVerdict, cfg: SendWindowConfig, locale: Locale): string {
  switch (v.closed?.code) {
    case 'day': return t(locale, 'run.sendWindow.reason.day', { day: weekdayName(v.closed.weekday, locale) })
    case 'time': return t(locale, 'run.sendWindow.reason.time', { time: cfg.atTime, tz: cfg.timeZone })
    default: return t(locale, 'run.sendWindow.reason.period', { key: v.key })
  }
}

function toConfig(c: Record<string, unknown>, locale: Locale): SendWindowConfig {
  const weekdays = String(c.weekdays ?? '')
    .split(/[,\s]+/).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return {
    frequency: (String(c.frequency ?? '') || DEFAULT_SEND_WINDOW.frequency) as SendFrequency,
    atTime: String(c.atTime ?? '').trim(),
    weekdays,
    // Déduit de la LANGUE, comme au navigateur. Un `timeZone` resté dans une config
    // ancienne est IGNORÉ : deux règles, ce sont deux découpages de la journée pour une
    // mémoire d'envoi partagée — donc un mail en double, ou pas de mail du tout.
    timeZone: timeZoneForLocale(locale),
  }
}

registerServerNode({
  type: 'send-window',
  run: async (ctx, config, inputs) => {
    const key = String(config.key ?? '') || 'default'
    const ref = getFirestore().doc(`users/${ctx.uid}/sendWindows/${ctx.workflowId || 'wf'}__${key}`)
    const snap = await ref.get().catch(() => null)
    const lastKey = (snap?.data()?.lastKey as string | undefined) ?? null

    const cfg = toConfig(config, ctx.locale)
    const verdict = evaluateWindow(new Date(), cfg, lastKey)
    if (!verdict.open) {
      // `skip` et non une erreur : hors créneau, ne rien envoyer est le comportement
      // NORMAL. Un run nocturne marqué en échec toutes les demi-heures ferait sonner une
      // alerte pour un fonctionnement correct.
      ctx.skip?.(t(ctx.locale, 'run.sendWindow.closed', { reason: closedReason(verdict, cfg, ctx.locale) }))
      return { value: undefined }
    }
    // Mémorisé AVANT de laisser passer : mieux vaut un mail manqué qu'un mail en double.
    await ref.set({ lastKey: verdict.key, at: Date.now() }, { merge: true }).catch(() => {})
    ctx.log('info', t(ctx.locale, 'run.sendWindow.open', { key: verdict.key }))
    return { value: inputs.value }
  },
})
