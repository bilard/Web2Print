import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractCalls, frenchLiterals } from './frenchLiterals'

/**
 * Garde-fou des messages ADRESSÉS À L'UTILISATEUR hors JSX.
 *
 * Un toast est le texte le plus VU de l'application et le moins couvert :
 * il n'apparaît dans aucun rendu de test, aucune capture, aucun contrôle de
 * type. Les 208 toasts français du lot 41 ont survécu à quarante lots de
 * traduction pour cette seule raison. Idem pour `confirm`/`prompt`, qui sont
 * en plus MODAUX : impossible de les rater à l'usage, faciles à rater au grep.
 *
 * Règle : dans `src/`, aucun appel à `toast*()`, `window.confirm()` ou
 * `window.prompt()` ne doit contenir de la prose française littérale. Le texte
 * passe par `t('…')`, ou il n'existe pas.
 */
const OPENER = /(?:toast(?:\.\w+)?|window\.confirm|window\.prompt|(?<![.\w])confirm)\(/g

/**
 * Exemptions : ce qui n'est PAS de la prose affichée.
 * - `id`, position, durée : options de Sonner.
 * - une clé de catalogue (`tst.…`, `err.…`) est déjà traduite.
 */
function exempt(lit: string): boolean {
  return /^(top|bottom)-(left|right|center)$/.test(lit)
    || /^[a-z]+\.[a-z0-9.]+$/i.test(lit) // clé de catalogue ou identifiant pointé
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'ui' ? [] : walk(full) // shadcn/ui : intouchable
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : []
  })
}

describe('messages utilisateur hors JSX', () => {
  it("n'affiche aucun toast ni dialogue natif en français littéral", () => {
    const offences: string[] = []
    for (const file of walk('src')) {
      const source = readFileSync(file, 'utf8')
      for (const call of extractCalls(source, OPENER)) {
        for (const lit of frenchLiterals(call, exempt)) {
          offences.push(`${file} → « ${lit.trim()} »`)
        }
      }
    }
    expect(offences, `texte non traduit dans un toast/confirm :\n${offences.join('\n')}`).toEqual([])
  })

  it('détecte réellement un texte en dur', () => {
    // Un garde-fou non éprouvé est un garde-fou fail-open : on provoque l'échec.
    expect(frenchLiterals("toast.error('Échec de la sauvegarde')", exempt)).toEqual([
      'Échec de la sauvegarde',
    ])
    // Du français SANS accent — le trou par lequel ce lot est passé.
    expect(frenchLiterals("toast.error('Choisis au moins un site.')", exempt)).toEqual([
      'Choisis au moins un site.',
    ])
    // Traduit : rien à signaler, même avec des options Sonner à côté.
    expect(frenchLiterals("toast.success(t('tst.saved'), { id: 'x', position: 'top-right' })", exempt)).toEqual([])
  })
})
