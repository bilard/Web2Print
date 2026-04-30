import { describe, it, expect } from 'vitest'
import { sanitizeJinaMarkdown } from './markdownSanitize'

describe('sanitizeJinaMarkdown', () => {
  it('strips top navigation links squished together (RS-style)', () => {
    const md = `# Title

[Nos services](https://x.com/services)[Le blog RS](https://x.com/blog)[Secteurs industriels](https://x.com/sectors)[Aide & Contact](https://x.com/help)

Real content here.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Nos services')
    expect(out).not.toContain('Le blog')
    expect(out).not.toContain('Aide & Contact')
    expect(out).toContain('Real content here.')
  })

  it('strips checkbox column from spec tables', () => {
    const md = `| - [x] Sélectionner tout | Attribut | Valeur |
| --- | --- | --- |
| - [x] | Marque | Makita |
| - [x] | Vitesse maximum | 3600tr/min |`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toMatch(/\[x\]/)
    expect(out).toContain('| Marque | Makita |')
    expect(out).toContain('| Vitesse maximum | 3600tr/min |')
  })

  it('drops the duplicated single-column "Sélectionner tout" table', () => {
    const md = `| Sélectionner tout |
| --- | --- |
| Marque Makita |
| Type de puissance Batterie |

| Attribut | Valeur |
| --- | --- |
| Marque | Makita |`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Marque Makita')
    expect(out).not.toContain('Type de puissance Batterie')
    expect(out).toContain('| Attribut | Valeur |')
    expect(out).toContain('| Marque | Makita |')
  })

  it('strips pricing tables (Unité | Prix par unité)', () => {
    const md = `Some content.

| Unité | Prix par unité |
| --- | --- |
| 1 + | 449,05€ |
| 10 + | 399€ |

More content.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Prix par unité')
    expect(out).not.toContain('449,05€')
    expect(out).not.toContain('1 +')
    expect(out).toContain('Some content.')
    expect(out).toContain('More content.')
  })

  it('drops "Besoin de plus?" tooltip lines', () => {
    const md = `**Besoin de plus?** Cliquez sur "Vérifier les dates" pour plus de détails

Real spec.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Besoin de plus')
    expect(out).toContain('Real spec.')
  })

  it('drops catalog listings (≥4 consecutive bullet links)', () => {
    const md = `# Product

*   [Cat A](url1)
*   [Cat B](url2)
*   [Cat C](url3)
*   [Cat D](url4)
*   [Cat E](url5)

Description text.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Cat A')
    expect(out).not.toContain('Cat E')
    expect(out).toContain('Description text.')
  })

  it('keeps short legitimate bullet lists (<4 items)', () => {
    const md = `## Avantages

*   Démarrage progressif
*   Indicateur d'herbe
*   Poignée ergonomique`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('Démarrage progressif')
    expect(out).toContain('Indicateur d\'herbe')
    expect(out).toContain('Poignée ergonomique')
  })

  it('strips Jina preamble (Title:, URL Source:, Markdown Content:)', () => {
    const md = `Title: My product

URL Source: https://x.com/p

Markdown Content:
# Product

Content.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Title:')
    expect(out).not.toContain('URL Source:')
    expect(out).not.toContain('Markdown Content:')
    expect(out).toContain('# Product')
    expect(out).toContain('Content.')
  })

  it('strips cookie banner sections', () => {
    const md = `# Product

## Your Privacy

We use cookies for analytics and personalization. Click here to accept.

# Real Content
Body text here.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('We use cookies')
    expect(out).toContain('Body text here.')
  })

  it('strips "Comparer" / "Ajouter à une liste" UI buttons', () => {
    const md = `Some content.

- [x] Comparer
Ajouter à une liste

More content.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Comparer')
    expect(out).not.toContain('Ajouter à une liste')
    expect(out).toContain('Some content.')
  })

  it('strips "Nos clients ont également consulté" footer block', () => {
    const md = `# Product

Real content.

## Nos clients ont également consulté

*   [Other Product 1](url)
*   [Other Product 2](url)
*   [Other Product 3](url)

# Footer`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Nos clients ont également')
    expect(out).not.toContain('Other Product')
    expect(out).toContain('Real content.')
  })

  it('preserves real product description and spec table', () => {
    const md = `# Product XYZ

Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace.

## Caractéristiques techniques

| Attribut | Valeur |
| --- | --- |
| Marque | Makita |
| Tension | 18 V |
| Poids | 17.5 kg |

## Avantages

*   Démarrage progressif
*   Indicateur d'herbe
*   Poignée ergonomique`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('Cette tondeuse à gazon')
    expect(out).toContain('| Marque | Makita |')
    expect(out).toContain('| Tension | 18 V |')
    expect(out).toContain('Démarrage progressif')
  })
})
