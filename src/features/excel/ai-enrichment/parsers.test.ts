import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseSpecsFromMarkdown,
  parseVariantsFromMarkdown,
  parseAdvantagesFromMarkdown,
  parseImagesFromMarkdown,
  extractPrimaryImagesFromHtml,
  isValidVariantRef,
  cleanMarkdownCell,
} from './useProductEnrichment'

const __dirname = dirname(fileURLToPath(import.meta.url))
const loadFixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', `${name}.fixture.md`), 'utf8')

// ─── Milwaukee : protéger contre la perte des groupes de specs ────────────
// Régression historique : tous les groupes (CARACTÉRISTIQUES / PUISSANCE /
// DIMENSIONS / PERÇAGE / BATTERIE / INFORMATIONS) doivent être conservés.
describe('Milwaukee — specs groupées', () => {
  const md = loadFixture('milwaukee')
  const specs = parseSpecsFromMarkdown(md)

  it('extrait ≥ 15 specs', () => {
    expect(specs.length).toBeGreaterThanOrEqual(15)
  })

  it('conserve au moins 4 groupes distincts', () => {
    const groups = new Set(specs.map((s) => s.group).filter(Boolean))
    expect(groups.size).toBeGreaterThanOrEqual(4)
  })

  it('inclut les groupes Puissance, Dimensions, Perçage, Batterie', () => {
    const groups = new Set(specs.map((s) => s.group?.toLowerCase()).filter(Boolean))
    const asLower = [...groups].join(' | ')
    expect(asLower).toMatch(/puissance/)
    expect(asLower).toMatch(/dimensions/)
    expect(asLower).toMatch(/per[cç]age/)
    expect(asLower).toMatch(/batterie/)
  })

  it('parse les 3 images produit (pas de filtrage excessif)', () => {
    const imgs = parseImagesFromMarkdown(md)
    expect(imgs.length).toBeGreaterThanOrEqual(3)
    expect(imgs.every((u) => /milwaukeetool\.fr/.test(u))).toBe(true)
  })
})

// ─── Nicoll : sections dupliquées + advantages groupés plain-text ─────────
describe('Nicoll — dédoublonnage et groupes plain-text', () => {
  const md = loadFixture('nicoll')

  it('déduplique les variants quand la table est présente deux fois', () => {
    const variants = parseVariantsFromMarkdown(md)
    const refs = variants.map((v) => v.reference)
    const unique = new Set(refs)
    expect(refs.length).toBe(unique.size)
    expect(refs.length).toBeLessThanOrEqual(3)
  })

  it('détecte les marqueurs plain-text **Performances** / **Installation** comme groupes', () => {
    const advantages = parseAdvantagesFromMarkdown(md)
    const groups = new Set(advantages.map((a) => a.group?.toLowerCase()).filter(Boolean))
    const asLower = [...groups].join(' | ')
    expect(asLower).toMatch(/performances?/)
    expect(asLower).toMatch(/installation/)
  })
})

// ─── Grundfos : rejet des tables de disclaimer + cellules markdown ────────
describe('Grundfos — tables parasites et artefacts', () => {
  const md = loadFixture('grundfos')

  it('rejette les refs issues de la table cookies (__cf_bm, BIGipServer, test_cookie)', () => {
    const variants = parseVariantsFromMarkdown(md)
    const refs = variants.map((v) => v.reference)
    expect(refs.some((r) => /cf_bm|BIGip|test_cookie/i.test(r))).toBe(false)
  })

  it('extrait les 3 vraies variantes (93074203-205)', () => {
    const variants = parseVariantsFromMarkdown(md)
    const refs = variants.map((v) => v.reference).filter((r) => /^9307/.test(r))
    expect(refs.length).toBe(3)
  })

  it('ne contient pas d\'artefacts markdown [...](url) dans les valeurs de specs', () => {
    const specs = parseSpecsFromMarkdown(md)
    for (const s of specs) {
      expect(s.value).not.toMatch(/\]\s*\(https?:/)
      expect(s.name).not.toMatch(/\]\s*\(https?:/)
    }
  })
})

// ─── Helpers purs ─────────────────────────────────────────────────────────
describe('isValidVariantRef', () => {
  it('rejette les chaînes trop courtes, trop longues, sans chiffre', () => {
    expect(isValidVariantRef('')).toBe(false)
    expect(isValidVariantRef('AB')).toBe(false)
    expect(isValidVariantRef('__cf_bm')).toBe(false)
    expect(isValidVariantRef('SERVERID')).toBe(false)
    expect(isValidVariantRef('a'.repeat(50))).toBe(false)
  })

  it('accepte les refs SKU classiques', () => {
    expect(isValidVariantRef('93074203')).toBe(true)
    expect(isValidVariantRef('RE87100')).toBe(true)
    expect(isValidVariantRef('4933471068')).toBe(true)
    expect(isValidVariantRef('M18-FPD3')).toBe(true)
  })
})

describe('cleanMarkdownCell', () => {
  it('strip les liens markdown vers des URLs', () => {
    expect(cleanMarkdownCell('[Grundfos](https://example.com "title")')).toBe('')
  })

  it('conserve le texte visible des liens markdown classiques', () => {
    expect(cleanMarkdownCell('[Label visible](non-url-target)')).toBe('Label visible')
  })

  it('strip les images markdown', () => {
    expect(cleanMarkdownCell('![alt](image.jpg)')).toBe('alt')
  })

  it('strip les checkboxes [x] / []', () => {
    expect(cleanMarkdownCell('[x] Fonctionnement')).toBe('Fonctionnement')
    expect(cleanMarkdownCell('[] Option')).toBe('Option')
  })

  it('strip le gras **...**', () => {
    expect(cleanMarkdownCell('**Valeur**')).toBe('Valeur')
  })
})

describe('extractPrimaryImagesFromHtml', () => {
  it('retourne [] pour HTML null', () => {
    expect(extractPrimaryImagesFromHtml(null, 'https://example.com')).toEqual([])
  })

  it('extrait og:image depuis les meta tags', () => {
    const html = '<html><head><meta property="og:image" content="https://cdn.example.com/hero.jpg"></head></html>'
    const out = extractPrimaryImagesFromHtml(html, 'https://example.com')
    expect(out).toContain('https://cdn.example.com/hero.jpg')
  })

  it('extrait twitter:image (attr dans les deux ordres)', () => {
    const html1 = '<meta name="twitter:image" content="https://a.com/1.jpg">'
    const html2 = '<meta content="https://b.com/2.jpg" property="twitter:image:src">'
    expect(extractPrimaryImagesFromHtml(html1, 'https://x.com')).toContain('https://a.com/1.jpg')
    expect(extractPrimaryImagesFromHtml(html2, 'https://x.com')).toContain('https://b.com/2.jpg')
  })

  it('extrait link rel=image_src', () => {
    const html = '<link rel="image_src" href="https://cdn.example.com/hero.jpg">'
    expect(extractPrimaryImagesFromHtml(html, 'https://x.com')).toContain('https://cdn.example.com/hero.jpg')
  })

  it('extrait JSON-LD Product.image (string, array, object)', () => {
    const ldString = '<script type="application/ld+json">{"@type":"Product","image":"https://a.com/s.jpg"}</script>'
    const ldArray = '<script type="application/ld+json">{"@type":"Product","image":["https://a.com/1.jpg","https://a.com/2.jpg"]}</script>'
    const ldObject = '<script type="application/ld+json">{"@type":"Product","image":{"url":"https://a.com/o.jpg"}}</script>'
    expect(extractPrimaryImagesFromHtml(ldString, 'https://x.com')).toContain('https://a.com/s.jpg')
    const arr = extractPrimaryImagesFromHtml(ldArray, 'https://x.com')
    expect(arr).toContain('https://a.com/1.jpg')
    expect(arr).toContain('https://a.com/2.jpg')
    expect(extractPrimaryImagesFromHtml(ldObject, 'https://x.com')).toContain('https://a.com/o.jpg')
  })

  it('rejette data: et blob:', () => {
    const html = '<meta property="og:image" content="data:image/png;base64,abc"><meta property="twitter:image" content="blob:https://a.com/x">'
    expect(extractPrimaryImagesFromHtml(html, 'https://x.com')).toEqual([])
  })

  it('déduplique les URLs répétées', () => {
    const html = '<meta property="og:image" content="https://a.com/1.jpg"><meta name="twitter:image" content="https://a.com/1.jpg">'
    const out = extractPrimaryImagesFromHtml(html, 'https://x.com')
    expect(out.length).toBe(1)
  })
})
