// La cadence d'envoi décide d'un effet IRRÉVERSIBLE (un mail part, ou non). Ses règles
// se testent donc sur des instants précis, dans un fuseau explicite — l'heure locale du
// processus n'entre jamais en jeu, les Cloud Functions tournant en UTC.
import { describe, it, expect } from 'vitest'
import { evaluateWindow, periodKey, timeZoneForLocale, weekdayName, DEFAULT_SEND_WINDOW, type SendWindowConfig } from './sendWindow'
import { describeWindow } from './sendWindowLabels'

const cfg = (patch: Partial<SendWindowConfig> = {}): SendWindowConfig => ({ ...DEFAULT_SEND_WINDOW, ...patch })

// 2026-08-10 est un LUNDI. En août, Paris est à UTC+2.
const paris = (iso: string) => new Date(iso)

describe('fenêtre d’envoi', () => {
  it('ouvre le bon jour, passé l’heure', () => {
    const v = evaluateWindow(paris('2026-08-10T06:30:00Z'), cfg({ atTime: '08:00' }), null) // 08:30 à Paris
    expect(v.open).toBe(true)
  })

  it('reste fermée AVANT l’heure, dans le fuseau retenu', () => {
    // 05:30 UTC = 07:30 à Paris : l'heure d'envoi (08:00) n'est pas atteinte. Calculé en
    // UTC, ce run serait passé — c'est exactement l'erreur que le fuseau évite.
    const v = evaluateWindow(paris('2026-08-10T05:30:00Z'), cfg({ atTime: '08:00' }), null)
    expect(v.open).toBe(false)
    expect(v.closed?.code).toBe('time')
  })

  it('refuse un jour non retenu', () => {
    // 2026-08-09 = dimanche.
    const v = evaluateWindow(paris('2026-08-09T10:00:00Z'), cfg({ weekdays: [1, 2, 3, 4, 5] }), null)
    expect(v.open).toBe(false)
    expect(v.closed?.code).toBe('day')
    // Le jour est rendu en NUMÉRO, pas en français : le moteur est pur et dupliqué côté
    // serveur — c'est l'appelant, qui connaît la langue, qui en fait une phrase.
    expect(v.closed?.weekday).toBe(0)
    expect(weekdayName(0, 'fr')).toBe('dimanche')
    expect(weekdayName(0, 'en')).toBe('Sunday')
    expect(weekdayName(1, 'es')).toBe('lunes')
  })

  it('n’envoie qu’UNE fois par période, quel que soit le nombre de runs', () => {
    const at = paris('2026-08-10T07:00:00Z')
    const first = evaluateWindow(at, cfg(), null)
    expect(first.open).toBe(true)
    // Deuxième run du même jour : même clé de période → rien à faire.
    const second = evaluateWindow(paris('2026-08-10T09:00:00Z'), cfg(), first.key)
    expect(second.open).toBe(false)
    expect(second.closed?.code).toBe('period')
    // Lendemain : nouvelle période, l'envoi repart.
    expect(evaluateWindow(paris('2026-08-11T07:00:00Z'), cfg(), first.key).open).toBe(true)
  })

  it('« à chaque run » ne bloque jamais sur la période', () => {
    const c = cfg({ frequency: 'always', atTime: '', weekdays: [] })
    const a = evaluateWindow(paris('2026-08-10T07:00:00Z'), c, null)
    const b = evaluateWindow(paris('2026-08-10T07:05:00Z'), c, a.key)
    expect(a.open && b.open).toBe(true)
  })

  it('groupe la semaine ISO, pas sept jours glissants', () => {
    const c = cfg({ frequency: 'weekly', weekdays: [] })
    // Lundi et vendredi de la MÊME semaine → même clé.
    expect(periodKey(paris('2026-08-10T10:00:00Z'), c)).toBe(periodKey(paris('2026-08-14T10:00:00Z'), c))
    // Lundi suivant → clé différente.
    expect(periodKey(paris('2026-08-17T10:00:00Z'), c)).not.toBe(periodKey(paris('2026-08-10T10:00:00Z'), c))
  })

  it('groupe le mois civil', () => {
    const c = cfg({ frequency: 'monthly', weekdays: [] })
    expect(periodKey(paris('2026-08-01T10:00:00Z'), c)).toBe(periodKey(paris('2026-08-31T10:00:00Z'), c))
    expect(periodKey(paris('2026-09-01T10:00:00Z'), c)).not.toBe(periodKey(paris('2026-08-31T10:00:00Z'), c))
  })

  it('résume la cadence pour la carte, sans déborder', () => {
    // Jours consécutifs → plage, sinon la carte affichait « lun–mar–mer–jeu–ven … ».
    expect(describeWindow(cfg())).toBe('1×/jour · lun→ven à partir de 08:00')
    expect(describeWindow(cfg({ weekdays: [1, 4] }))).toBe('1×/jour · lun, jeu à partir de 08:00')
    expect(describeWindow(cfg({ weekdays: [] }))).toContain('tous les jours')
  })

  it('dit « au 1er passage » dès que la période dépasse la journée', () => {
    // « 1×/mois » et cinq jours cochés se lisent comme une contradiction tant que rien ne
    // dit que les jours AUTORISENT l'envoi sans le déclencher.
    expect(describeWindow(cfg({ frequency: 'monthly' }))).toBe('1×/mois · au 1er passage lun→ven à partir de 08:00')
    expect(describeWindow(cfg({ frequency: 'daily' }))).not.toContain('1er passage')
  })

  it('déduit le fuseau de la langue, et retombe sur Paris pour une langue inconnue', () => {
    // ⚠ La MÊME règle des deux côtés : la mémoire d'envoi est partagée cron ↔ navigateur.
    expect(timeZoneForLocale('fr')).toBe('Europe/Paris')
    expect(timeZoneForLocale('en')).toBe('Europe/London')
    expect(timeZoneForLocale('es')).toBe('Europe/Madrid')
    expect(timeZoneForLocale('de')).toBe(DEFAULT_SEND_WINDOW.timeZone)
    expect(timeZoneForLocale('')).toBe(DEFAULT_SEND_WINDOW.timeZone)
  })
})
