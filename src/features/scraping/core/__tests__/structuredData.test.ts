import { describe, it, expect } from 'vitest'
import { parseStructuredDataFromHtml, parseMicrodataFromHtml, parseStructuredDataAny } from '../structuredData'

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

describe('parseMicrodataFromHtml', () => {
  it('extrait microdata Product complète', () => {
    const html = `<html><body>
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Perceuse Bosch GBH</h1>
        <p itemprop="description">Perceuse à percussion sans fil 18V Brushless avec 2 batteries.</p>
        <div itemprop="brand" itemscope itemtype="https://schema.org/Brand">
          <meta itemprop="name" content="Bosch"/>
        </div>
        <meta itemprop="sku" content="GBH18V-26"/>
        <img itemprop="image" src="https://example.com/img1.jpg"/>
        <img itemprop="image" src="https://example.com/img2.jpg"/>
        <div itemprop="additionalProperty" itemscope itemtype="https://schema.org/PropertyValue">
          <meta itemprop="name" content="Tension"/>
          <meta itemprop="value" content="18V"/>
        </div>
        <div itemprop="additionalProperty" itemscope itemtype="https://schema.org/PropertyValue">
          <meta itemprop="name" content="Poids"/>
          <meta itemprop="value" content="2.4kg"/>
        </div>
      </div>
    </body></html>`
    const data = parseMicrodataFromHtml(html)
    expect(data?.name).toBe('Perceuse Bosch GBH')
    expect(data?.description).toContain('Perceuse à percussion')
    expect(data?.brand).toBe('Bosch')
    expect(data?.sku).toBe('GBH18V-26')
    expect(data?.images).toHaveLength(2)
    expect(data?.specs).toHaveLength(2)
    expect(data?.specs[0]).toEqual({ name: 'Tension', value: '18V' })
  })

  it('retourne null si pas de scope Product', () => {
    const html = `<html><body><div>Just a regular page</div></body></html>`
    expect(parseMicrodataFromHtml(html)).toBeNull()
  })

  it('parseStructuredDataAny essaie JSON-LD puis microdata', () => {
    const microdataOnly = `<html><body>
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Outil</h1>
        <p itemprop="description">Description suffisamment longue pour être considérée comme valide ici.</p>
      </div>
    </body></html>`
    const data = parseStructuredDataAny(microdataOnly)
    expect(data?.name).toBe('Outil')
  })

  it('parseStructuredDataAny préfère JSON-LD si les deux sont présents', () => {
    const both = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"From JSON-LD"}
      </script>
    </head><body>
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">From microdata</h1>
      </div>
    </body></html>`
    const data = parseStructuredDataAny(both)
    expect(data?.name).toBe('From JSON-LD')
  })
})
