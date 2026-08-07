// Résumé LISIBLE d'une cadence d'envoi (badge de la carte, aperçu du panneau de config).
//
// Séparé de `sendWindow.ts` à dessein, comme `cronLabels.ts` l'est de `cronSchedule.ts` :
// le moteur de créneau est pur et dupliqué côté functions, y faire entrer le store de
// langue y ferait entrer Firebase par ricochet. Ici la dépendance est assumée : c'est de
// l'affichage, et il n'existe aucune carte à résumer dans un cron.
//
// ⚠️ Les libellés sont rendus À L'APPEL, jamais figés dans une constante de module : un
// tableau traduit une seule fois au chargement resterait dans la langue de départ.
import { t, type TranslationKey } from '@/lib/i18n'
import { WEEKDAY_SHORT_KEYS } from './cronLabels'
import type { SendWindowConfig } from './sendWindow'

const FREQ_KEYS = {
  always: 'sendWindow.freq.always',
  daily: 'sendWindow.freq.daily',
  weekly: 'sendWindow.freq.weekly',
  monthly: 'sendWindow.freq.monthly',
} as const satisfies Record<string, TranslationKey>

/** Abréviation sans le point final : « lun. » se lit mal accolé à une flèche. */
const short = (d: number) => t(WEEKDAY_SHORT_KEYS[d]).replace(/\.$/, '')

/** Jours retenus : plage quand ils se suivent, sinon énumération. Vide ou sept = tous. */
function describeDays(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b)
  if (sorted.length === 0 || sorted.length === 7) return t('sendWindow.days.all')
  const consecutive = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  return consecutive
    ? `${short(sorted[0])}→${short(sorted[sorted.length - 1])}`
    : sorted.map(short).join(', ')
}

/**
 * Résumé de la cadence — ex. « 1×/mois · au 1er passage lun→ven à partir de 08:00 ».
 *
 * ⚠ La mention « au 1er passage » n'est pas décorative : « une fois par mois » avec cinq
 * jours cochés se lit comme une contradiction tant qu'on n'a pas dit que les jours ne
 * *déclenchent* pas l'envoi, ils l'AUTORISENT — le mois part au premier d'entre eux.
 */
export function describeWindow(cfg: SendWindowConfig): string {
  // « À chaque run » ne retient ni jour ni heure : les mentionner décrirait un filtrage
  // qui n'a pas lieu, alors même que l'écran grise les deux champs.
  if (cfg.frequency === 'always') return t(FREQ_KEYS.always)
  const parts = [
    cfg.frequency === 'weekly' || cfg.frequency === 'monthly' ? t('sendWindow.firstPass') : '',
    describeDays(cfg.weekdays),
    cfg.atTime ? t('sendWindow.at', { time: cfg.atTime }) : '',
  ].filter(Boolean)
  return `${t(FREQ_KEYS[cfg.frequency] ?? FREQ_KEYS.daily)} · ${parts.join(' ')}`
}
