import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ES_REF_STRINGS } from './refStrings.es'
import { refText } from './refStrings'

/**
 * Couverture des textes de RÉFÉRENTIEL (hors catalogue d'UI).
 *
 * ⚠️ Ces textes-là échappent à TOUS les garde-fous du catalogue : ils vivent
 * inline dans trois fichiers de données, `tsc` ne connaît pas leur langue, et
 * `refText` retombe sur le français sans rien dire. Une fonction Sheets ajoutée
 * demain resterait donc française en espagnol, en silence — sauf ici.
 *
 * Le parsing reprend la regex de `scripts/i18n-ref-strings.mjs` : si l'un des
 * fichiers change de forme (paire non adjacente), le compte extrait s'effondre
 * et le premier test le voit avant que la couverture ne devienne illusoire.
 */
const FILES = [
  'src/features/gdrive/googleSheetsFunctions.ts',
  'src/features/excel/formulaEngine.ts',
  'src/features/data-graph/firestoreSchema.ts',
]

const PAIR = /(\w+):\s*(['"])((?:\\.|(?!\2).)*)\2,?\s*\w+En:\s*(['"])((?:\\.|(?!\4).)*)\4/g

function frenchTexts(): string[] {
  const out = new Set<string>()
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(PAIR)) {
      const fr = m[3]
      if (fr.trim() !== '') out.add(fr)
    }
  }
  return [...out]
}

describe('textes de référentiel', () => {
  it('en extrait autant que le script de génération', () => {
    // Sentinelle de FORME : un chiffre qui s'effondre signale que les paires
    // `champ` / `champEn` ne sont plus adjacentes, pas qu'on a supprimé du texte.
    expect(frenchTexts().length).toBeGreaterThanOrEqual(200)
  })

  it('sont tous traduits en espagnol', () => {
    const missing = frenchTexts().filter((fr) => ES_REF_STRINGS[fr] === undefined)
    expect(
      missing,
      `textes de référentiel sans traduction ES (relancer \`node scripts/i18n-ref-strings.mjs es\`) :\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('ne laissent aucune phrase en français', () => {
    /** Identiques à bon droit : un chemin Firestore n'a pas de traduction. */
    const IDENTICAL_ASSUMED = ['Pipelines (users/{uid}/workflows).']
    // Même seuil que le catalogue : un libellé court coïncide légitimement
    // (« Maths », « Format »), une phrase entière jamais.
    const offences = frenchTexts()
      .filter((fr) => !IDENTICAL_ASSUMED.includes(fr))
      .filter((fr) => fr.length >= 25 && ES_REF_STRINGS[fr] === fr)
    expect(offences, `phrases restées en français :\n${offences.join('\n')}`).toEqual([])
  })

  it('retombe sur le français pour une langue sans mapping', () => {
    expect(refText('Somme d’une plage', 'Sum of a range', 'de')).toBe('Somme d’une plage')
    expect(refText('Somme d’une plage', 'Sum of a range', 'en')).toBe('Sum of a range')
    expect(refText('Somme d’une plage', 'Sum of a range', 'es')).toBe('Suma de un rango')
  })
})
