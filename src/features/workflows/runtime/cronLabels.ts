// Libellés LISIBLES de la planification (badge du node Cron, panneau d'état,
// cockpit OPS). Séparés de `cronSchedule.ts` À DESSEIN : ce dernier ne dépend de
// rien (« aucune dépendance React / Firebase → testable isolément ») et le
// traduire y aurait fait entrer le store de langue, donc Firebase par ricochet.
// Ici la dépendance est assumée : c'est de l'affichage.
//
// ⚠️ Les libellés sont rendus À L'APPEL (comme `t()`), jamais figés dans une
// constante de module : un tableau traduit une seule fois au chargement resterait
// dans la langue de départ après un changement de langue.
import { t, type TranslationKey } from '@/lib/i18n'
import { normalizeEvery, type CronConfig, type CronUnit, type CycleCalendar } from './cronSchedule'

const CRON_UNIT_LABEL: Record<CronUnit, TranslationKey> = {
  minute: 'cron.unit.minute', hour: 'cron.unit.hour', day: 'cron.unit.day',
  week: 'cron.unit.week', month: 'cron.unit.month',
}

const WEEKDAY_KEYS = [
  'cron.weekday.0', 'cron.weekday.1', 'cron.weekday.2', 'cron.weekday.3',
  'cron.weekday.4', 'cron.weekday.5', 'cron.weekday.6',
] as const satisfies readonly TranslationKey[]

const WEEKDAY_SHORT_KEYS = [
  'cron.weekdayShort.0', 'cron.weekdayShort.1', 'cron.weekdayShort.2', 'cron.weekdayShort.3',
  'cron.weekdayShort.4', 'cron.weekdayShort.5', 'cron.weekdayShort.6',
] as const satisfies readonly TranslationKey[]

/** Libellé court de la cadence — ex : « 2 jour(s) à 14:30 », « lundi à 09:00 ». */
export function describeCron(cfg: CronConfig): string {
  const every = normalizeEvery(cfg.every)
  const unit = t(CRON_UNIT_LABEL[cfg.unit] ?? 'cron.unit.minute')
  // Mode « après la fin » : cadence relative, l'heure/jour ne s'appliquent pas.
  if (cfg.afterCompletion) return t('cron.afterCompletion', { every, unit })
  const at = cfg.atTime && /^\d{1,2}:\d{2}$/.test(cfg.atTime) ? t('cron.at', { time: cfg.atTime }) : ''
  if (cfg.unit === 'week' && cfg.weekday != null) {
    if (Number(cfg.weekday) < 0) return t('cron.everyDay', { at })
    const wd = t(WEEKDAY_KEYS[((Math.trunc(Number(cfg.weekday)) % 7) + 7) % 7])
    return every === 1 ? `${wd}${at}` : t('cron.weeks', { every, wd, at })
  }
  if (cfg.unit === 'day' || cfg.unit === 'month') return `${every} ${unit}${at}`
  return `${every} ${unit}`
}

/** Libellé court de la relance calendaire — ex : « cycle ven. à 07:00 »,
 *  « cycle le 14/10/2026 à 07:00 (+2) ». */
export function describeCycle(cal: CycleCalendar): string {
  const at = t('cron.at', { time: cal.atTime })
  const every = normalizeEvery(cal.every ?? 1)
  if (cal.kind === 'dates') {
    const dates = [...(cal.dates ?? [])].sort()
    if (dates.length === 0) return t('cron.cycle.noDate', { at })
    const [y, mo, d] = dates[0].split('-')
    return t('cron.cycle.onDate', {
      date: `${d}/${mo}/${y}`, at, more: dates.length > 1 ? ` (+${dates.length - 1})` : '',
    })
  }
  if (cal.kind === 'week') {
    const days = cal.weekdays ?? []
    const names = days.length
      ? days.map((d) => (WEEKDAY_SHORT_KEYS[d] ? t(WEEKDAY_SHORT_KEYS[d]) : '?')).join(' ')
      : t('cron.cycle.everyDayShort')
    return t('cron.cycle.week', { names, at })
  }
  if (cal.kind === 'month') {
    return every === 1
      ? t('cron.cycle.monthday', { day: cal.monthday ?? 1, at })
      : t('cron.cycle.monthdayEvery', { day: cal.monthday ?? 1, every, at })
  }
  return every === 1 ? t('cron.cycle.daily', { at }) : t('cron.cycle.everyNDays', { every, at })
}

/** Compte à rebours lisible — ex : « 2 j 3 h », « 5 min 12 s », « maintenant ». */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return t('cron.now')
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return t('cron.dh', { d, h })
  if (h > 0) return t('cron.hm', { h, m })
  if (m > 0) return t('cron.ms', { m, s })
  return t('cron.s', { s })
}
