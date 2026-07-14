import { describe, it, expect } from 'vitest'
import { parseIcecatGtin } from '../parsers/parseIcecatGtin'

// Extrait VERBATIM du HTML de trafic.com (2026-07-14, fiche Farelek
// télécommande ventilateur, réf 1084074) : le JSON-LD gtin recopie le sku
// interne (7 chiffres), le widget Icecat porte le VRAI EAN-13.
const TRAFIC_HTML = `<script>
window.addEventListener('liveload', function() {
    IcecatLive.getDatasheet(
        {'productstory':'#legostories'},
        {GTIN: '3431541125964'.split('|')[0], UserName: 'gauthierfun'},
        'fr'
    );
});
</script>`

describe('parseIcecatGtin', () => {
  it('extrait le GTIN du widget Icecat Live (fixture Trafic)', () => {
    expect(parseIcecatGtin(TRAFIC_HTML)).toBe('3431541125964')
  })
  it('valeurs multiples « a|b » : première plausible', () => {
    expect(parseIcecatGtin(`IcecatLive.getDatasheet({}, {GTIN: '4002395163625|4002395163632', UserName: 'x'}, 'de')`)).toBe('4002395163625')
  })
  it('null si absent ou invalide', () => {
    expect(parseIcecatGtin('<html><body>rien</body></html>')).toBeNull()
    expect(parseIcecatGtin(`IcecatLive.getDatasheet({}, {GTIN: '12345678901234567890', UserName: 'x'}, 'fr')`)).toBeNull()
  })
})
