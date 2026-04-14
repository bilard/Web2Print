import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseMilwaukeeProduct } from './milwaukee'

const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/live/milwaukee-m18-fpd3-scrolled.html')
const URL = 'https://fr.milwaukeetool.eu/fr-fr/perceuse-a-percussion-m18-fuel/m18-fpd3/'

describe('parseMilwaukeeProduct — M18 FPD3 fixture live', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8')
  const result = parseMilwaukeeProduct(html, URL)

  it('extracts the product H1', () => {
    expect(result.title).toMatch(/perceuse/i)
    expect(result.title).toMatch(/M18|FUEL/i)
  })

  it('extracts description (meta)', () => {
    expect(result.description.length).toBeGreaterThan(30)
    expect(result.description).toMatch(/158 Nm|couple|compact/i)
  })

  it('extracts ≥ 5 marketing advantages (ProductFeaturesText)', () => {
    expect(result.advantages.length).toBeGreaterThanOrEqual(5)
    expect(result.advantages.some(a => /158 Nm|REDLITHIUM|POWERSTATE|FUEL/i.test(a))).toBe(true)
  })

  it('has empty specifications (Relay API renders them client-side)', () => {
    // Limitation connue et documentée : specs non extractibles depuis le HTML
    expect(result.specifications).toEqual([])
  })

  it('extracts variants including M18 FPD3 refs', () => {
    expect(result.variants.length).toBeGreaterThanOrEqual(1)
    const refs = result.variants.map(v => v.reference)
    expect(refs.some(r => /M18\s*FPD3/i.test(r))).toBe(true)
  })

  it('hero image is a milwaukee product image (not just FB tile)', () => {
    expect(result.heroImage).toMatch(/^https?:\/\//)
    // Idéalement une image "Hero" du produit, sinon fallback og:image
    expect(result.heroImage).toMatch(/milwaukee/i)
  })

  it('extracts at least 3 milwaukee product images', () => {
    expect(result.images.length).toBeGreaterThanOrEqual(3)
    for (const u of result.images) {
      expect(u).toMatch(/^https?:\/\//)
    }
  })

  it('extracts at least 1 PDF document', () => {
    expect(result.documents.length).toBeGreaterThanOrEqual(1)
    for (const d of result.documents) {
      expect(d).toContain('##')
      const [, url] = d.split('##')
      expect(url).toMatch(/\.pdf/i)
    }
  })

  it('every document URL is unique', () => {
    const urls = result.documents.map(d => d.split('##')[1])
    expect(new Set(urls).size).toBe(urls.length)
  })
})
