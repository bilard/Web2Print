import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseNicollProduct } from './nicoll'

const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/live/nicoll-kenadrain.html')
const URL = 'https://www.nicoll.fr/fr/caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain'

describe('parseNicollProduct — Kenadrain fixture live', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8')
  const result = parseNicollProduct(html, URL)

  it('extracts the product H1 (not the RGPD banner)', () => {
    expect(result.title).toMatch(/caniveau|kenadrain/i)
    expect(result.title).not.toMatch(/vie privée|cookies?/i)
  })

  it('extracts description (chapo or meta)', () => {
    expect(result.description.length).toBeGreaterThan(30)
    expect(result.description).toMatch(/caniveau/i)
  })

  it('extracts at least 4 technical specs from Descriptif technique', () => {
    expect(result.specifications.length).toBeGreaterThanOrEqual(4)
  })

  it('extracts known specs: Largeur intérieure, Classe de résistance', () => {
    const names = result.specifications.map(s => s.name.toLowerCase())
    expect(names.some(n => n.includes('largeur'))).toBe(true)
    expect(names.some(n => n.includes('classe'))).toBe(true)
    const largeur = result.specifications.find(s => s.name.toLowerCase().includes('largeur'))
    expect(largeur?.value).toMatch(/100\s*mm/i)
  })

  it('attaches a group to every spec', () => {
    for (const s of result.specifications) {
      expect(s.group).toBeTruthy()
    }
  })

  it('extracts at least 3 variants from data-striping table', () => {
    expect(result.variants.length).toBeGreaterThanOrEqual(3)
    const refs = result.variants.map(v => v.reference)
    expect(refs).toContain('DR100CH')
  })

  it('variant labels are populated', () => {
    for (const v of result.variants) {
      expect(v.reference.length).toBeGreaterThanOrEqual(3)
      expect(v.label.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('extracts at least 5 PDF documents with clean titles', () => {
    expect(result.documents.length).toBeGreaterThanOrEqual(5)
    for (const d of result.documents) {
      expect(d).toContain('##')
      const [title, url] = d.split('##')
      expect(title.length).toBeGreaterThanOrEqual(3)
      expect(url).toMatch(/\.pdf/i)
    }
  })

  it('every document URL is unique', () => {
    const urls = result.documents.map(d => d.split('##')[1])
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('extracts at least 1 product image', () => {
    expect(result.images.length).toBeGreaterThanOrEqual(1)
  })
})
