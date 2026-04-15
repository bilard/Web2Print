/**
 * Harness de test pour l'extracteur sémantique typé.
 *
 * Objectif : mesurer le taux de pass par champ (title, description, specs,
 * images, documents, price, variants) sur les fixtures HTML live.
 *
 * Approche : 100 % générique — aucun sélecteur ni règle spécifique à un
 * fournisseur. Si un nouveau site est ajouté, on capture un fixture et on
 * ajoute une ligne au tableau FIXTURES.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { extractSemantic } from './semanticExtractor'

interface FixtureCase {
  name: string
  file: string
  url: string
  minSpecs: number
  minImages: number
  minDocs: number
  /** Tokens (lowercase) qui DOIVENT apparaître dans le title (au moins un) */
  titleMustContain: string[]
  /** Noms de specs (lowercase, inclusion) dont au moins un doit apparaître */
  specsMustContain: string[]
  /** Si true : un prix doit être extrait (confidence ≥ 0.5) */
  expectPrice?: boolean
  /** Si false : la fixture HTML ne contient pas de description (cookie notice seule) */
  expectDescription?: boolean
}

const FIXTURES: FixtureCase[] = [
  {
    name: 'bosch',
    file: 'bosch-gsr-18v.html',
    url: 'https://www.bosch-professional.com/be/fr/products/gsr-18v-110-c-06019G0108',
    minSpecs: 6,
    minImages: 1,
    minDocs: 2,
    titleMustContain: ['gsr', '18v'],
    specsMustContain: ['couple', 'tension', 'poids'],
  },
  {
    name: 'makita',
    file: 'makita-duh752z.html',
    url: 'https://www.makita.fr/product/duh752z.html',
    minSpecs: 10,
    minImages: 1,
    minDocs: 1,
    titleMustContain: ['duh752', 'taille'],
    specsMustContain: ['énergie', 'batterie'],
    // Fixture capturée ne contient pas de meta description ni de JSON-LD
    // (la page Makita rend ces champs via JS après le capture Jina).
    expectDescription: false,
  },
  {
    name: 'milwaukee',
    file: 'milwaukee-m18-fpd3.html',
    url: 'https://fr.milwaukeetool.eu/products/m18-fpd3',
    // Fixture capturée pré-hydration SPA : la page Milwaukee charge ses
    // tech specs via JS après render. Seules la section hero et des
    // blocs marketing sont présents. On valide juste que l'extracteur
    // ne plante pas et ne pollue pas avec du junk marketing/reviews.
    minSpecs: 0,
    minImages: 1,
    minDocs: 0,
    titleMustContain: ['m18', 'fpd3', 'perceuse'],
    specsMustContain: [],
  },
  {
    name: 'milwaukee-scrolled',
    file: 'milwaukee-m18-fpd3-scrolled.html',
    url: 'https://fr.milwaukeetool.eu/products/m18-fpd3',
    minSpecs: 0,
    minImages: 1,
    minDocs: 0,
    titleMustContain: ['m18', 'fpd3', 'perceuse'],
    specsMustContain: [],
  },
  {
    name: 'nicoll',
    file: 'nicoll-kenadrain.html',
    url: 'https://www.nicoll.fr/fr/caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain',
    minSpecs: 5,
    minImages: 1,
    minDocs: 3,
    titleMustContain: ['kenadrain', 'caniveau'],
    specsMustContain: ['largeur', 'classe', 'longueur'],
  },
  {
    name: 'nicoll-scrolled',
    file: 'nicoll-kenadrain-scrolled.html',
    url: 'https://www.nicoll.fr/fr/caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain',
    minSpecs: 5,
    minImages: 1,
    minDocs: 3,
    titleMustContain: ['kenadrain', 'caniveau'],
    specsMustContain: ['largeur', 'classe', 'longueur'],
  },
  {
    name: 'grundfos',
    file: 'grundfos-alpha1-go.html',
    url: 'https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186',
    minSpecs: 3,
    minImages: 1,
    minDocs: 0,
    titleMustContain: ['alpha1', 'alpha'],
    specsMustContain: [],
  },
  {
    name: 'grundfos-specs',
    file: 'grundfos-alpha1-go-specs.html',
    url: 'https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186',
    minSpecs: 5,
    minImages: 1,
    minDocs: 0,
    titleMustContain: ['alpha'],
    specsMustContain: ['tension', 'pression'],
  },
]

/** Patterns qui ne doivent jamais fuiter dans les specs (junk universel). */
const SPEC_LEAK_RE =
  /^(strictement\s+n[eé]cessaire|fonctionnel|statistiques?|marketing|publicit[éaire]+|analytique|performance|pr[eé]f[eé]rences?|ciblage|targeting|essential|necessary|functional|analytics|advertising|finalit[eé]|expiration|prestataire|aspsessionid|play\/?pause|lecture\/?pause|shortcuts?|raccourcis?|plein[-\s]?[eé]cran|volume|muet|sous-?titres?)\b/i

interface FieldStats {
  field: string
  passed: number
  total: number
}

const stats: FieldStats[] = [
  { field: 'title', passed: 0, total: 0 },
  { field: 'description', passed: 0, total: 0 },
  { field: 'specs', passed: 0, total: 0 },
  { field: 'images', passed: 0, total: 0 },
  { field: 'documents', passed: 0, total: 0 },
  { field: 'no-junk', passed: 0, total: 0 },
]

function bump(field: string, ok: boolean) {
  const s = stats.find(x => x.field === field)
  if (!s) return
  s.total++
  if (ok) s.passed++
}

describe('semanticExtractor — couverture multi-domaines (type-based)', () => {
  for (const fx of FIXTURES) {
    describe(`[${fx.name}] ${fx.file}`, () => {
      const html = readFileSync(resolve(__dirname, '__fixtures__/live', fx.file), 'utf-8')
      const result = extractSemantic(html, fx.url)

      it('extrait un title ≥ 0.5 confidence', () => {
        const ok = result.title.value != null && result.title.confidence >= 0.5
        bump('title', ok)
        expect(ok).toBe(true)
      })

      it(`title contient au moins un token attendu`, () => {
        const t = (result.title.value ?? '').toLowerCase()
        const ok = fx.titleMustContain.some(tok => t.includes(tok.toLowerCase()))
        expect(ok).toBe(true)
      })

      if (fx.expectDescription !== false) {
        it('extrait une description ≥ 0.5 confidence', () => {
          const ok = result.description.value != null && result.description.confidence >= 0.5
          bump('description', ok)
          expect(ok).toBe(true)
        })
      }

      it(`extrait ≥ ${fx.minSpecs} specs`, () => {
        const ok = result.specs.length >= fx.minSpecs
        bump('specs', ok)
        if (!ok) {
          console.log(`[${fx.name}] specs=${result.specs.length}`, result.specs.slice(0, 3))
        }
        expect(ok).toBe(true)
      })

      if (fx.specsMustContain.length > 0) {
        it(`specs contiennent au moins un nom attendu (${fx.specsMustContain.join(', ')})`, () => {
          const names = result.specs.map(s => s.name.toLowerCase())
          const ok = fx.specsMustContain.some(k => names.some(n => n.includes(k)))
          expect(ok).toBe(true)
        })
      }

      it(`extrait ≥ ${fx.minImages} images`, () => {
        const ok = result.images.length >= fx.minImages
        bump('images', ok)
        expect(ok).toBe(true)
      })

      it(`extrait ≥ ${fx.minDocs} documents`, () => {
        const ok = result.documents.length >= fx.minDocs
        bump('documents', ok)
        expect(ok).toBe(true)
      })

      it('aucune fuite junk (cookie, player vidéo, session-id) dans les specs', () => {
        const leaks = result.specs.filter(
          s => SPEC_LEAK_RE.test(s.name) || (s.group && SPEC_LEAK_RE.test(s.group))
        )
        bump('no-junk', leaks.length === 0)
        if (leaks.length > 0) {
          console.log(`[${fx.name}] junk leaks:`, leaks.slice(0, 3))
        }
        expect(leaks).toEqual([])
      })
    })
  }

  it('rapport global de pass rate par champ', () => {
    console.log('\n═══ Pass rate par champ (semanticExtractor) ═══')
    for (const s of stats) {
      const pct = s.total === 0 ? 0 : Math.round((s.passed / s.total) * 100)
      console.log(`  ${s.field.padEnd(14)} ${s.passed}/${s.total}  (${pct}%)`)
    }
    console.log('')
    expect(stats.length).toBeGreaterThan(0)
  })
})
