// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { extractProductScope, productScopeText } from '../parsers/productScope'
import { parseAdvantagesFromHtml } from '../parsers/parseAdvantages'

// Structure fidèle à trafic.com (Magento 2, fixture 2026-07-14) : la zone
// produit vit dans .product-info-main + .product.info.detailed ; le login,
// les « 4 promesses », la newsletter et les mentions vivent AUTOUR.
const MAGENTO_HTML = `<!doctype html><html><body>
<div class="header">
  <div class="login-popup">
    <strong>Commander en tant que nouveau client</strong>
    <p>La création d’un compte possède de nombreux avantages : voir le statut de la commande et de l’expédition, suivi de la commande, commandez plus rapidement — créez votre compte dès maintenant pour profiter de tous ces services.</p>
  </div>
</div>
<main>
  <div class="product-info-main">
    <h1>Farelek Télécommande Ventilateur De Plafond</h1>
    <div class="price">50,69 €</div>
    <p>FARELEK Télécommande Ventilateur de Plafond, compatible avec la plupart des ventilateurs de plafond de la marque, portée de 20 mètres.</p>
  </div>
  <div class="product info detailed">
    <h2>Caractéristiques du produit</h2>
    <ul>
      <li>Portée de 20 mètres pour un pilotage à distance confortable</li>
      <li>Compatible avec les ventilateurs de plafond Farelek 3 vitesses</li>
    </ul>
    <table><tr><td>Référence Trafic</td><td>1084074</td></tr></table>
  </div>
</main>
<div class="footer-content">
  <h3>Nos 4 promesses:</h3>
  <ul>
    <li>Laissez-vous séduire par un choix impressionnant, des offres et des collections exclusives</li>
    <li>Faites confiance à une qualité testée et validée</li>
  </ul>
  <p>Inscrivez-vous pour recevoir nos infos. Vous pouvez vous désinscrire à tout moment en vous rendant sur votre compte.</p>
  <p>TRAFINTER (FR) FR08383139458 — Rue Jean Jaures, n°225, 59243 Quarouble, France. Payez vite et en toute sécurité avec Mollie.</p>
</div>
</body></html>`

describe('extractProductScope — liste blanche zone produit', () => {
  it('Magento : capture product-info-main + onglets, EXCLUT login et footer', () => {
    const scope = extractProductScope(MAGENTO_HTML)
    expect(scope).toBeTruthy()
    expect(scope).toContain('Farelek Télécommande Ventilateur De Plafond')
    expect(scope).toContain('Portée de 20 mètres')
    expect(scope).toContain('Référence Trafic')
    expect(scope).not.toContain('Laissez-vous séduire')
    expect(scope).not.toContain('Commander en tant que')
    expect(scope).not.toContain('Mollie')
  })

  it('microdata schema.org/Product : capture le conteneur itemtype', () => {
    const html = `<html><body>
      <header><p>Livraison offerte dès 49€ — inscrivez-vous à la newsletter pour nos offres</p></header>
      <div itemtype="https://schema.org/Product" itemscope>
        <h1>Perceuse XYZ 18V</h1><span>129,00 €</span>
        <p>Perceuse-visseuse sans fil 18V avec mandrin auto-serrant 13 mm et moteur brushless pour les travaux intensifs du quotidien.</p>
        <ul><li>Moteur brushless longue durée pour les usages intensifs</li></ul>
      </div>
      <footer><p>Conditions générales de vente — droit de rétractation</p></footer>
    </body></html>`
    const scope = extractProductScope(html)
    expect(scope).toBeTruthy()
    expect(scope).toContain('brushless')
    expect(scope).not.toContain('rétractation')
    expect(scope).not.toContain('newsletter')
  })

  it('repli heuristique : ancêtre commun H1 + prix (aucun sélecteur canonique)', () => {
    const filler = '<p>' + 'lorem ipsum dolor sit amet consectetur '.repeat(40) + '</p>'
    const html = `<html><body>
      <div class="top-bar"><p>Bienvenue sur notre boutique en ligne, profitez de nos services exclusifs toute l'année</p>${filler}</div>
      <div class="zone">
        <div class="bloc">
          <h1>Ventilateur Tour 3 Vitesses Blanc</h1>
          <span class="p">19,99 €</span>
          <p>Tour de ventilation en plastique pour la maison, trois vitesses, oscillation automatique et minuterie intégrée pour toutes les pièces.</p>
        </div>
      </div>
      <div class="bottom">${filler}${filler}</div>
    </body></html>`
    const scope = extractProductScope(html)
    expect(scope).toBeTruthy()
    expect(scope).toContain('Tour de ventilation')
    expect(scope).not.toContain('Bienvenue sur notre boutique')
  })

  it('page sans produit (article, accueil) → null, comportement inchangé', () => {
    const html = `<html><body><div class="post"><h2>Nos conseils jardin</h2>
      <p>${'Un long article éditorial sans prix ni produit. '.repeat(30)}</p></div></body></html>`
    expect(extractProductScope(html)).toBeNull()
  })

  it('parseAdvantagesFromHtml(scope) : les VRAIS points forts, zéro footer', () => {
    const scope = extractProductScope(MAGENTO_HTML)!
    const advs = parseAdvantagesFromHtml(scope).map((a) => a.text)
    expect(advs.join(' | ')).toContain('Portée de 20 mètres')
    expect(advs.join(' | ')).not.toMatch(/Laissez-vous|Mollie|compte/i)
  })

  it('productScopeText : texte lisible avec headings/puces, sans balises', () => {
    const scope = extractProductScope(MAGENTO_HTML)!
    const text = productScopeText(scope)
    expect(text).toContain('## Caractéristiques du produit')
    expect(text).toContain('* Portée de 20 mètres')
    expect(text).not.toContain('<')
  })
})
