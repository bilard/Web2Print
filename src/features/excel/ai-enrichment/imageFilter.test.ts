import { describe, it, expect } from 'vitest'
import { classifyImage, getProductRefs } from './imageFilter'

describe('classifyImage — photos produit vs pictos/logos', () => {
  it('vue produit reconnue par la référence malgré les séparateurs différents', () => {
    const refs = getProductRefs({ title: 'Perceuse à percussion M18 FPD3-502X' })
    expect(classifyImage('https://static.milwaukeetool.eu/hi/M18_FPD3-502X--Hero_1.jpg', refs)).toBe('photo')
  })

  it('vue produit reconnue par le préfixe modèle (DDA351_ pour réf DDA351RTJ)', () => {
    const refs = getProductRefs({ title: "DDA351RTJ - Perceuse visseuse d'angle LXT®" })
    expect(classifyImage('https://fi.makitamedia.com/images/30120_JPG_zoom/DDA351_C2L0.jpg', refs)).toBe('photo')
  })

  it('logo de marque avec suffixe numérique → picto (makita_logo3.png)', () => {
    const refs = ['dda351rtj']
    expect(classifyImage('https://www.makita.fr/data/pam/public/makita_logo3.png', refs)).toBe('picto')
  })

  it('badges garantie/labels → picto', () => {
    expect(classifyImage('https://cdn.x.com/media/3_year_warranty_logo.png', [])).toBe('picto')
    expect(classifyImage('https://cdn.x.com/media/garantie-2-ans.png', [])).toBe('picto')
    expect(classifyImage('https://cdn.x.com/assets/energy-label-c.png', [])).toBe('picto')
  })

  it('image demandée en petite taille (w_100 Cloudinary, 80x80) → picto', () => {
    expect(classifyImage('https://res.cloudinary.com/makita-eu/image/upload/w_100/makita-brand', [])).toBe('picto')
    expect(classifyImage('https://cdn.x.com/img/brushless_80x80.png', [])).toBe('picto')
  })

  it('grande taille demandée ≠ picto (w_1200)', () => {
    expect(classifyImage('https://res.cloudinary.com/x/image/upload/w_1200/vue-produit-jardin', [])).toBe('photo')
  })

  it('gif et svg → picto, sauf si la référence produit est dans le nom', () => {
    expect(classifyImage('https://cdn.x.com/symbols/vitesse-variable.gif', [])).toBe('picto')
    expect(classifyImage('https://cdn.x.com/brand/one-plus-hp.svg', [])).toBe('picto')
    expect(classifyImage('https://cdn.x.com/products/dda351_view.gif', ['dda351rtj'])).toBe('photo')
  })

  it('segments path symbols/standards/features-icons → picto', () => {
    expect(classifyImage('https://cdn.tti.eu/standards/brushless-intelligent.png', [])).toBe('picto')
    expect(classifyImage('https://cdn.tti.eu/features-icons/home-index.png', [])).toBe('picto')
  })

  it('photo sans référence reconnaissable → photo par défaut (prudence)', () => {
    expect(classifyImage('https://cdn.x.com/media/8f3a2bc91d.jpg', ['m18fpd3'])).toBe('photo')
  })
})
