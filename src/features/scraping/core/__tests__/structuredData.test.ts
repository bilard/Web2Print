import { describe, it, expect } from 'vitest'
import { parseStructuredDataFromHtml } from '../structuredData'

describe('parseStructuredDataFromHtml', () => {
  it('extrait Product simple avec @type unique', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Serre Mythos","description":"Serre polycarbonate 2,3 m²","sku":"21373502","brand":{"@type":"Brand","name":"Canopia by Palram"},"image":["https://example.com/img1.jpg","https://example.com/img2.jpg"]}
      </script>
    </head><body></body></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Serre Mythos')
    expect(data?.description).toBe('Serre polycarbonate 2,3 m²')
    expect(data?.sku).toBe('21373502')
    expect(data?.brand).toBe('Canopia by Palram')
    expect(data?.images).toEqual(['https://example.com/img1.jpg','https://example.com/img2.jpg'])
  })

  it('extrait additionalProperty[] vers specs', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","additionalProperty":[
          {"@type":"PropertyValue","name":"Surface","value":"2.3","unitText":"m²"},
          {"@type":"PropertyValue","name":"Matériau","value":"Polycarbonate"}
        ]}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.specs).toEqual([
      { name: 'Surface', value: '2.3 m²' },
      { name: 'Matériau', value: 'Polycarbonate' },
    ])
  })

  it('flatten @graph array', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"Organization","name":"Jardiland"},
          {"@type":"Product","name":"Mythos","description":"desc"}
        ]}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Mythos')
    expect(data?.description).toBe('desc')
  })

  it('strip HTML dans description', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","description":"<p>Texte avec <b>HTML</b></p>"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.description).toBe('Texte avec HTML')
  })

  it('JSON malformé → null sans crash', () => {
    const html = `<html><head>
      <script type="application/ld+json">{not valid json</script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data).toBeNull()
  })

  it('multi Product → pick celui avec le plus de champs', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"Variant 1"}
      </script>
      <script type="application/ld+json">
        {"@type":"Product","name":"Variant 2","description":"d","sku":"123","brand":"B"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.name).toBe('Variant 2')
    expect(data?.sku).toBe('123')
  })

  it('aucun JSON-LD → null', () => {
    const html = `<html><head></head><body><p>Hello</p></body></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data).toBeNull()
  })

  it('image string seule → array d\'1 élément', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","image":"https://example.com/single.jpg"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.images).toEqual(['https://example.com/single.jpg'])
  })

  it('brand string sans @type → string', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","brand":"Makita"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.brand).toBe('Makita')
  })

  it('extrait gtin et mpn', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"X","gtin13":"1234567890123","mpn":"DHR202Z"}
      </script>
    </head></html>`
    const data = parseStructuredDataFromHtml(html)
    expect(data?.gtin).toBe('1234567890123')
    expect(data?.mpn).toBe('DHR202Z')
  })
})
