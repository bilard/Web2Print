import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseGrundfosProduct } from './grundfos'

const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/live/grundfos-alpha1-go-specs.html')
const URL =
  'https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186'

describe('parseGrundfosProduct — ALPHA1 GO fixture live', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8')
  const result = parseGrundfosProduct(html, URL)

  it('extracts the product title (ALPHA1 GO)', () => {
    expect(result.title).toMatch(/ALPHA1\s+GO/i)
  })

  it('extracts the product number (93074186)', () => {
    expect(result.productNumber).toBe('93074186')
  })

  it('extracts description', () => {
    expect(result.description.length).toBeGreaterThan(40)
    expect(result.description).toMatch(/ALPHA1|circulateur|pompe/i)
  })

  it('extracts at least 5 specs from table-specifications', () => {
    expect(result.specifications.length).toBeGreaterThanOrEqual(5)
  })

  it('extracts known specs via title attr (Tension, Pression, Entraxe)', () => {
    const names = result.specifications.map(s => s.name.toLowerCase())
    expect(names.some(n => n.includes('tension'))).toBe(true)
    expect(names.some(n => n.includes('pression'))).toBe(true)
    expect(names.some(n => n.includes('entraxe'))).toBe(true)
  })

  it('correct values (220-240 V, 10 bar)', () => {
    const tension = result.specifications.find(s => s.name.toLowerCase().includes('tension'))
    expect(tension?.value).toMatch(/220-240\s*V/i)
    const pression = result.specifications.find(s => s.name.toLowerCase().includes('pression'))
    expect(pression?.value).toMatch(/10\s*bar/i)
  })

  it('attaches a group to every spec', () => {
    for (const s of result.specifications) {
      expect(s.group).toBeTruthy()
    }
  })

  it('hero image falls back to api.grundfos.com/gpi/imaging when og:image empty', () => {
    expect(result.heroImage).toMatch(/^https?:\/\//)
    expect(result.heroImage).toMatch(/93074186/)
  })

  it('extracts at least 1 variant (self as reference)', () => {
    expect(result.variants.length).toBeGreaterThanOrEqual(1)
    expect(result.variants[0].reference).toBe('93074186')
  })

  it('extracts at least 1 PDF document with clean title', () => {
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
