import { describe, it, expect } from 'vitest'
import { extractMarkdownHierarchy } from './engine'

function dom(html: string): Element {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html')
  return doc.body
}

describe('extractMarkdownHierarchy', () => {
  it('preserves H1/H2/H3 levels as #/##/###', () => {
    const md = extractMarkdownHierarchy(dom(`
      <article>
        <h1>Produit</h1>
        <p>Intro courte.</p>
        <h2>Caractéristiques</h2>
        <p>Détails du moteur.</p>
        <h3>Batterie</h3>
        <p>Lithium-ion 18 V.</p>
      </article>
    `))
    expect(md).toContain('# Produit')
    expect(md).toContain('## Caractéristiques')
    expect(md).toContain('### Batterie')
    expect(md).toContain('Lithium-ion 18 V.')
    // Hierarchy ordering preserved
    const i1 = md.indexOf('# Produit')
    const i2 = md.indexOf('## Caractéristiques')
    const i3 = md.indexOf('### Batterie')
    expect(i1).toBeLessThan(i2)
    expect(i2).toBeLessThan(i3)
  })

  it('renders unordered list as "- item"', () => {
    const md = extractMarkdownHierarchy(dom(`
      <ul>
        <li>Avantage 1</li>
        <li>Avantage 2</li>
        <li>Avantage 3</li>
      </ul>
    `))
    expect(md).toContain('- Avantage 1')
    expect(md).toContain('- Avantage 2')
    expect(md).toContain('- Avantage 3')
  })

  it('renders ordered list as "1. item"', () => {
    const md = extractMarkdownHierarchy(dom(`<ol><li>Étape A</li><li>Étape B</li></ol>`))
    expect(md).toMatch(/1\. Étape A/)
    expect(md).toMatch(/2\. Étape B/)
  })

  it('renders tables as "| key | value |" rows with header separator', () => {
    const md = extractMarkdownHierarchy(dom(`
      <table>
        <tr><th>Caractéristique</th><th>Valeur</th></tr>
        <tr><td>Tension</td><td>18 V</td></tr>
        <tr><td>Poids</td><td>1.2 kg</td></tr>
      </table>
    `))
    expect(md).toContain('| Caractéristique | Valeur |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| Tension | 18 V |')
    expect(md).toContain('| Poids | 1.2 kg |')
  })

  it('skips SCRIPT/STYLE/NOSCRIPT', () => {
    const md = extractMarkdownHierarchy(dom(`
      <div>
        <script>var x = 1; alert('boom')</script>
        <style>.a{color:red}</style>
        <p>Visible</p>
      </div>
    `))
    expect(md).toContain('Visible')
    expect(md).not.toContain('alert')
    expect(md).not.toContain('color:red')
  })

  it('renders <br> as line break', () => {
    const md = extractMarkdownHierarchy(dom(`<p>Ligne 1<br>Ligne 2</p>`))
    expect(md).toMatch(/Ligne 1[\s\S]*Ligne 2/)
  })

  it('preserves order across mixed blocks (h2 → ul → table → p)', () => {
    const md = extractMarkdownHierarchy(dom(`
      <section>
        <h2>Bloc A</h2>
        <ul><li>x</li><li>y</li></ul>
        <table><tr><td>k</td><td>v</td></tr></table>
        <p>Conclusion.</p>
      </section>
    `))
    const positions = ['## Bloc A', '- x', '| k | v |', 'Conclusion.'].map(s => md.indexOf(s))
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })
})
