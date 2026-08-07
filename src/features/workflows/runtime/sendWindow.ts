// Cadence d'envoi : « ce run a-t-il le droit d'envoyer, maintenant ? ». PUR.
//
// Le besoin : un workflow de veille tourne toutes les trente minutes, mais on ne veut pas
// quarante-huit mails par jour. Le node Cron planifie le WORKFLOW ; il manquait de quoi
// planifier une ÉTAPE — envoyer le lundi à 8 h, une fois par semaine, quel que soit le
// nombre de passages.
//
// ⚠ Tout se calcule dans un FUSEAU explicite, jamais dans l'heure locale du processus :
// les Cloud Functions tournent en UTC. « 8 h » y tomberait à 10 h en heure d'été
// française, et le passage à l'heure d'hiver déplacerait l'envoi d'une heure sans que
// personne n'ait rien changé.

export type SendFrequency = 'always' | 'daily' | 'weekly' | 'monthly'

export interface SendWindowConfig {
  frequency: SendFrequency
  /** Heure au plus tôt, « HH:MM » dans le fuseau retenu. Vide = dès le premier passage. */
  atTime: string
  /** Jours autorisés, 0 = dimanche … 6 = samedi. Vide = tous les jours. */
  weekdays: number[]
  timeZone: string
}

export const DEFAULT_SEND_WINDOW: SendWindowConfig = {
  frequency: 'daily',
  atTime: '08:00',
  weekdays: [1, 2, 3, 4, 5],
  timeZone: 'Europe/Paris',
}

/** Champs de date lus DANS le fuseau demandé (et non dans celui du processus). */
function zonedParts(at: Date, timeZone: string): {
  year: number; month: number; day: number; hour: number; minute: number; weekday: number
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]))
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    // 24:00 existe en `hour12: false` sur certains moteurs : minuit doit rester 0.
    hour: Number(parts.hour) % 24, minute: Number(parts.minute),
    weekday: WD[parts.weekday ?? 'Mon'] ?? 1,
  }
}

/** Numéro de semaine ISO — deux envois « hebdomadaires » ne doivent pas tomber le même
 *  dimanche et le lundi suivant simplement parce que l'année a changé de ligne. */
function isoWeek(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  const dow = (d.getUTCDay() + 6) % 7 // lundi = 0
  d.setUTCDate(d.getUTCDate() - dow + 3) // jeudi de la semaine ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const fdow = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdow + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Clé de la PÉRIODE en cours. Deux runs qui rendent la même clé appartiennent au même
 * créneau : le second n'a rien à envoyer. C'est ce qui rend la cadence indépendante de la
 * fréquence des runs — et robuste à un rattrapage de cron qui déclencherait trois fois.
 */
export function periodKey(at: Date, cfg: SendWindowConfig): string {
  const p = zonedParts(at, cfg.timeZone)
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  switch (cfg.frequency) {
    case 'daily': return ymd
    case 'weekly': return isoWeek(p.year, p.month, p.day)
    case 'monthly': return `${p.year}-${String(p.month).padStart(2, '0')}`
    // « à chaque run » : aucune période ne se répète, donc jamais de doublon à écarter.
    default: return `run-${at.getTime()}`
  }
}

export interface WindowVerdict {
  /** L'envoi peut avoir lieu maintenant. */
  open: boolean
  /** Pourquoi il n'a pas lieu — affiché tel quel dans le journal du run. */
  reason: string
  /** Clé de période à mémoriser après un envoi réussi. */
  key: string
}

/**
 * Décide si l'envoi doit avoir lieu. `lastKey` est la période du dernier envoi effectué.
 *
 * L'ordre des contrôles est celui des causes : jour, puis heure, puis unicité. Un journal
 * qui dit « pas le bon jour » évite de chercher du côté de l'heure.
 */
export function evaluateWindow(at: Date, cfg: SendWindowConfig, lastKey: string | null): WindowVerdict {
  const p = zonedParts(at, cfg.timeZone)
  const key = periodKey(at, cfg)

  if (cfg.weekdays.length > 0 && !cfg.weekdays.includes(p.weekday)) {
    return { open: false, key, reason: `Jour non retenu pour l'envoi (${dayName(p.weekday)}).` }
  }
  const [h, m] = (cfg.atTime || '').split(':').map((v) => Number(v))
  if (Number.isFinite(h)) {
    const minutesNow = p.hour * 60 + p.minute
    const minutesTarget = h * 60 + (Number.isFinite(m) ? m : 0)
    if (minutesNow < minutesTarget) {
      return { open: false, key, reason: `Avant l'heure d'envoi (${cfg.atTime}, ${cfg.timeZone}).` }
    }
  }
  if (lastKey != null && lastKey === key) {
    return { open: false, key, reason: `Déjà envoyé pour cette période (${key}).` }
  }
  return { open: true, key, reason: '' }
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
function dayName(d: number): string { return DAYS[d] ?? String(d) }

/** Résumé lisible pour la carte : « lun–ven à 08:00 · 1×/jour ». */
export function describeWindow(cfg: SendWindowConfig): string {
  // Jours CONSÉCUTIFS résumés en plage : « lun→ven » plutôt que
  // « lun–mar–mer–jeu–ven », qui débordait de la carte et s'y tronquait.
  const sorted = [...cfg.weekdays].sort((a, b) => a - b)
  const consecutive = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  const days = sorted.length === 0 || sorted.length === 7
    ? 'tous les jours'
    : consecutive
      ? `${DAYS[sorted[0]]?.slice(0, 3)}→${DAYS[sorted[sorted.length - 1]]?.slice(0, 3)}`
      : sorted.map((d) => DAYS[d]?.slice(0, 3)).join(', ')
  const freq = cfg.frequency === 'always' ? 'à chaque run'
    : cfg.frequency === 'daily' ? '1×/jour'
    : cfg.frequency === 'weekly' ? '1×/semaine' : '1×/mois'
  return `${days}${cfg.atTime ? ` à ${cfg.atTime}` : ''} · ${freq}`
}
