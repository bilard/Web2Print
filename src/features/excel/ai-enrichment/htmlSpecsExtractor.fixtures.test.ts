/**
 * Tests d'intégration de l'extracteur GÉNÉRIQUE sur fixtures live.
 *
 * But : garantir que l'approche universelle (Jina → DOMParser →
 * htmlSpecsExtractor → LLM) couvre plusieurs domaines sans code
 * spécifique à une marque. Si un nouveau site est ajouté, on capture
 * un fixture et on ajoute une ligne au tableau FIXTURES.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { extractSpecsBlockFromHtml, extractDocumentsBlockFromHtml } from './htmlSpecsExtractor'

interface FixtureCase {
  name: string
  file: string
  url: string
  /** Minimum de paires specs attendues (heuristique générique, pas valeur exacte) */
  minSpecs: number
  /** Minimum de documents PDF */
  minDocs: number
  /** Noms (normalisés lowercase) qui DOIVENT apparaître pour valider l'extraction */
  mustContainKeys: string[]
}

const FIXTURES: FixtureCase[] = [
  {
    name: 'bosch',
    file: 'bosch-gsr-18v.html',
    url: 'https://www.bosch-professional.com/be/fr/products/gsr-18v-110-c-06019G0108',
    minSpecs: 6,
    minDocs: 3,
    mustContainKeys: ['couple', 'tension', 'poids'],
  },
  {
    name: 'makita',
    file: 'makita-duh752z.html',
    url: 'https://www.makita.fr/product/duh752z.html',
    minSpecs: 10,
    minDocs: 3,
    mustContainKeys: ['énergie', 'composant batterie'],
  },
  {
    name: 'nicoll',
    file: 'nicoll-kenadrain.html',
    url: 'https://www.nicoll.fr/fr/caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain',
    minSpecs: 5,
    minDocs: 5,
    mustContainKeys: ['largeur', 'classe'],
  },
  {
    name: 'grundfos',
    file: 'grundfos-alpha1-go-specs.html',
    url: 'https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186',
    minSpecs: 5,
    minDocs: 1,
    mustContainKeys: ['tension', 'pression'],
  },
]

/** Patterns de raccourcis clavier de players vidéo — ne doivent JAMAIS
 *  apparaître dans les specs extraites (régression Bosch). */
const VIDEO_SHORTCUT_LEAK = /^(play\/?pause|lecture\/?pause|shortcuts?|raccourcis?|plein[-\s]?[eé]cran|volume|avancer|reculer|muet|sous-?titres?)\b/i

describe('htmlSpecsExtractor — couverture multi-domaines (générique)', () => {
  for (const fx of FIXTURES) {
    describe(`[${fx.name}] ${fx.file}`, () => {
      const html = readFileSync(resolve(__dirname, '__fixtures__/live', fx.file), 'utf-8')
      const specsBlock = extractSpecsBlockFromHtml(html)
      const docsBlock = extractDocumentsBlockFromHtml(html, fx.url)
      const specPairs = specsBlock
        .split('\n')
        .filter(l => l.includes(' = '))
        .map(l => {
          const [k, v] = l.split(' = ')
          return { k: (k ?? '').toLowerCase().trim(), v: (v ?? '').trim() }
        })
      const docLines = docsBlock.split('\n').filter(l => l.includes(' | '))

      it(`extrait ≥ ${fx.minSpecs} paires de specs`, () => {
        expect(specPairs.length).toBeGreaterThanOrEqual(fx.minSpecs)
      })

      it(`extrait ≥ ${fx.minDocs} documents PDF`, () => {
        expect(docLines.length).toBeGreaterThanOrEqual(fx.minDocs)
      })

      for (const key of fx.mustContainKeys) {
        it(`contient une spec dont le nom inclut "${key}"`, () => {
          expect(specPairs.some(p => p.k.includes(key))).toBe(true)
        })
      }

      it('aucun raccourci de player vidéo ne fuit dans les specs', () => {
        const leaks = specPairs.filter(p => VIDEO_SHORTCUT_LEAK.test(p.k))
        expect(leaks).toEqual([])
      })
    })
  }
})
