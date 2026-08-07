// La cadence d'envoi décide d'un effet IRRÉVERSIBLE (un mail part, ou non). Ses règles
// se testent donc sur des instants précis, dans un fuseau explicite — l'heure locale du
// processus n'entre jamais en jeu, les Cloud Functions tournant en UTC.
import { describe, it, expect } from 'vitest'
import { evaluateWindow, periodKey, describeWindow, DEFAULT_SEND_WINDOW, type SendWindowConfig } from './sendWindow'

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
    expect(v.reason).toContain('08:00')
  })

  it('refuse un jour non retenu', () => {
    // 2026-08-09 = dimanche.
    const v = evaluateWindow(paris('2026-08-09T10:00:00Z'), cfg({ weekdays: [1, 2, 3, 4, 5] }), null)
    expect(v.open).toBe(false)
    expect(v.reason).toContain('dimanche')
  })

  it('n’envoie qu’UNE fois par période, quel que soit le nombre de runs', () => {
    const at = paris('2026-08-10T07:00:00Z')
    const first = evaluateWindow(at, cfg(), null)
    expect(first.open).toBe(true)
    // Deuxième run du même jour : même clé de période → rien à faire.
    const second = evaluateWindow(paris('2026-08-10T09:00:00Z'), cfg(), first.key)
    expect(second.open).toBe(false)
    expect(second.reason).toContain('Déjà envoyé')
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
    expect(describeWindow(cfg())).toBe('lun→ven à 08:00 · 1×/jour')
    expect(describeWindow(cfg({ weekdays: [1, 4] }))).toBe('lun, jeu à 08:00 · 1×/jour')
    expect(describeWindow(cfg({ weekdays: [] }))).toContain('tous les jours')
  })
})
