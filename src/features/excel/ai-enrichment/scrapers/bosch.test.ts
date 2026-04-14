import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseBoschProduct } from './bosch'

const FIXTURE_PATH = resolve(__dirname, '../__fixtures__/live/bosch-gsr-18v.html')
const URL = 'https://www.bosch-professional.com/be/fr/products/gsr-18v-110-c-06019G0108'

describe('parseBoschProduct — GSR 18V-110 C fixture live', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8')
  const result = parseBoschProduct(html, URL)

  it('extracts the H1 marketing title', () => {
    expect(result.title).toMatch(/GSR 18V-110 C/i)
    expect(result.title).toMatch(/perceuse/i)
  })

  it('extracts meta description', () => {
    expect(result.description.length).toBeGreaterThan(40)
    expect(result.description).toMatch(/Bluetooth|Couple|moteur/i)
  })

  it('extracts USP advantages (≥ 3)', () => {
    expect(result.advantages.length).toBeGreaterThanOrEqual(3)
    expect(result.advantages.some(a => /110 Nm/i.test(a))).toBe(true)
    expect(result.advantages.some(a => /Bluetooth/i.test(a))).toBe(true)
  })

  it('extracts at least 5 technical specs from table__body-row', () => {
    expect(result.specifications.length).toBeGreaterThanOrEqual(5)
  })

  it('extracts known specs: Couple, Tension, Poids', () => {
    const names = result.specifications.map(s => s.name.toLowerCase())
    expect(names.some(n => n.includes('couple'))).toBe(true)
    expect(names.some(n => n.includes('tension'))).toBe(true)
    expect(names.some(n => n.includes('poids'))).toBe(true)
  })

  it('extracts correct spec values (47/85/110 Nm, 18,0 V, 1,8 kg)', () => {
    const couple = result.specifications.find(s => s.name.toLowerCase().includes('couple'))
    expect(couple?.value).toMatch(/47\/85\/110/)
    const tension = result.specifications.find(s => s.name.toLowerCase().includes('tension'))
    expect(tension?.value).toMatch(/18[.,]0\s*V/i)
    const poids = result.specifications.find(s => s.name.toLowerCase().includes('poids'))
    expect(poids?.value).toMatch(/1[.,]8\s*kg/i)
  })

  it('attaches a group to every spec', () => {
    for (const s of result.specifications) {
      expect(s.group).toBeTruthy()
      expect((s.group ?? '').length).toBeGreaterThan(0)
    }
  })

  it('extracts hero image (og:image)', () => {
    expect(result.heroImage).toMatch(/^https?:\/\//)
    expect(result.heroImage).toMatch(/GSR|gsr/)
  })

  it('extracts at least 3 PDF documents with clean titles', () => {
    expect(result.documents.length).toBeGreaterThanOrEqual(3)
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
})
