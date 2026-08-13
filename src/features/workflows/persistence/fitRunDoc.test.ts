import { describe, it, expect } from 'vitest'
import { fitRunOutputs, utf8Len, OUTPUTS_BUDGET } from './fitRunDoc'
// ⚠ Jumeau SERVEUR importé par chemin relatif : `functions/` est un projet TypeScript
// distinct, mais le module est PUR. C'est le seul moyen de vérifier que le cron et le
// navigateur écrivent le même snapshot.
import { fitRunOutputs as fitServer } from '../../../../functions/src/workflow/fitRunDoc'

/** Une feuille dont chaque ligne porte un texte long — le profil qui a fait exploser le
 *  document en production (descriptions réécrites, HTML de mail de veille). */
function fatSheet(rows: number, cellChars: number) {
  return {
    n1: {
      out: {
        columns: ['ref', 'description'],
        rows: Array.from({ length: rows }, (_, i) => ({ ref: `R${i}`, description: 'x'.repeat(cellChars) })),
      },
    },
  }
}

describe('fitRunOutputs', () => {
  it('ne touche à rien quand le snapshot tient déjà', () => {
    const small = { n1: { out: { rows: [{ a: 1 }] } } }
    const fitted = fitRunOutputs(small)
    expect(fitted.outputs).toBe(small)
    expect(fitted.trimmed).toBeNull()
  })

  it('fait tenir 100 lignes de 30 ko, et le DIT', () => {
    // 3 Mo bruts : très exactement le cas de production (2 808 947 octets).
    const fat = fatSheet(100, 30_000)
    expect(utf8Len(fat)).toBeGreaterThan(1_048_576)
    const fitted = fitRunOutputs(fat)
    expect(utf8Len(fitted.outputs)).toBeLessThanOrEqual(OUTPUTS_BUDGET)
    expect(fitted.trimmed).toBeTruthy()
  })

  it('garde le VRAI nombre de lignes quand il en retire', () => {
    const fitted = fitRunOutputs(fatSheet(5000, 400))
    const port = (fitted.outputs.n1.out ?? {}) as { rows: unknown[]; totalRows: number }
    expect(port.totalRows).toBe(5000)
    expect(port.rows.length).toBeLessThan(5000)
  })

  it('sauve une ligne unique et ÉNORME en coupant ses textes', () => {
    // Un HTML de mail de veille de 2 Mo sur une seule ligne : aucun palier de lignes ne
    // l'aurait sauvé, c'est la coupe des textes qui le ramène sous la limite.
    const monstre = { n1: { out: { rows: [{ html: 'y'.repeat(2_000_000) }] } } }
    const fitted = fitRunOutputs(monstre)
    expect(utf8Len(fitted.outputs)).toBeLessThanOrEqual(OUTPUTS_BUDGET)
    expect(fitted.trimmed).toBeTruthy()
  })

  it('en dernier recours vide l’aperçu plutôt que de rendre un document inécrivable', () => {
    // Budget minuscule : même vidées de leurs lignes, les métadonnées des ports dépassent.
    const fitted = fitRunOutputs(fatSheet(10, 100), 40)
    expect(fitted.outputs).toEqual({})
    expect(fitted.trimmed).toContain('retiré')
  })

  it('rend EXACTEMENT le même snapshot des deux côtés', () => {
    for (const sample of [fatSheet(100, 30_000), fatSheet(5000, 400), { n1: { out: { rows: [{ a: 1 }] } } }]) {
      const client = fitRunOutputs(sample)
      const server = fitServer(sample)
      expect(server.trimmed).toBe(client.trimmed)
      expect(utf8Len(server.outputs)).toBe(utf8Len(client.outputs))
    }
  })
})
