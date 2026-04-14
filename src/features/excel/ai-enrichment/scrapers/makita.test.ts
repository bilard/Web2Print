import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseMakitaProduct } from './makita'

const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/live/makita-duh752z.html')
const URL = 'https://www.makita.fr/product/duh752z.html'

describe('parseMakitaProduct — DUH752Z fixture live', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8')
  const result = parseMakitaProduct(html, URL)

  it('extracts the page title (H1 or meta)', () => {
    expect(result.title.length).toBeGreaterThanOrEqual(5)
    // Soit H1 marketing (Taille-haie LXT) soit référence DUH752Z
    expect(
      /taille.haie|duh752z|lxt/i.test(result.title),
    ).toBe(true)
  })

  it('extracts at least 10 technical specifications', () => {
    expect(result.specifications.length).toBeGreaterThanOrEqual(10)
  })

  it('contains known specs: Énergie, Composant batterie', () => {
    const names = result.specifications.map(s => s.name.toLowerCase())
    expect(names.some(n => n.includes('énergie') || n.includes('energie'))).toBe(true)
    expect(names.some(n => n.includes('composant batterie'))).toBe(true)
  })

  it('detects boolean values rendered as check icons (Tension LXT = Oui)', () => {
    const lxt = result.specifications.find(s => s.name.toLowerCase().includes('tension lxt'))
    expect(lxt?.value).toBe('Oui')
  })

  it('attaches a group to each spec (never empty)', () => {
    for (const s of result.specifications) {
      expect(s.group).toBeTruthy()
      expect((s.group ?? '').length).toBeGreaterThan(0)
    }
  })

  it('extracts at least 5 USP advantages', () => {
    expect(result.advantages.length).toBeGreaterThanOrEqual(5)
    // Valeurs spécifiques attendues
    expect(result.advantages.some(a => /BL Motor/i.test(a))).toBe(true)
    expect(result.advantages.some(a => /XPT/i.test(a))).toBe(true)
  })

  it('extracts at least 1 product image (og:image)', () => {
    expect(result.images.length).toBeGreaterThanOrEqual(1)
    expect(result.heroImage).toMatch(/^https?:\/\//)
  })

  it('extracts variantes référence DUH752* (family models)', () => {
    const refs = result.variants.map(v => v.reference)
    // Au moins DUH752Z lui-même doit être là
    expect(refs.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts at least 3 PDF documents with clean titles', () => {
    expect(result.documents.length).toBeGreaterThanOrEqual(3)
    for (const doc of result.documents) {
      expect(doc).toContain('##')
      const [title, url] = doc.split('##')
      expect(title.length).toBeGreaterThanOrEqual(3)
      expect(url).toMatch(/\.pdf/i)
    }
  })

  it('every document URL is unique', () => {
    const urls = result.documents.map(d => d.split('##')[1])
    expect(new Set(urls).size).toBe(urls.length)
  })
})
