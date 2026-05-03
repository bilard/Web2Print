import { describe, it, expect } from 'vitest'
import { isJunkImageUrl } from './useProductEnrichment'

describe('isJunkImageUrl', () => {
  describe('Nicoll Drupal megamenu (path = /menu-push/, style = push_menu_*)', () => {
    // Les 12 URLs effectivement renvoyées comme « images trouvées » sur la
    // page caniveau Kenadrain — toutes issues du mégamenu Drupal, pas du
    // produit. Avant ce fix, elles passaient le filtre car ni le segment
    // `menu-push` ni le style `push_menu_mobile` n'étaient reconnus.
    const NICOLL_MEGAMENU_URLS = [
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/Nicoll_RF_banner_push_420_294%282%29.jpg.webp?itok=yeBC4kVj',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/Push%20PRO%203.jpg.webp?itok=ZNu3cjth',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/Push-Clapet.jpg.webp?itok=JcXTvG-T',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/Push-techtan.jpg.webp?itok=cGX_J8bt',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/menu-service-calculateur-zypho.jpg.webp?itok=4ahN78Dg',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push-assainissement.jpg.webp?itok=eFLCSxMV',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push-chutunic-evo.jpg.webp?itok=Rm8xnmai',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push-menu-coudix.jpg.webp?itok=ca7fzBbD',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push-tarif-2026.jpg.webp?itok=Pte-BGxV',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push-zypho-slim50.jpg.webp?itok=dfjnz7FJ',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push_menu_chantier_hotel-mama-shelter.jpg.webp?itok=kwv2b_q0',
      'https://www.nicoll.fr/sites/default/files/styles/push_menu_mobile/public/menu-push/push_menu_maisons_individuelles_2.jpg.webp?itok=k3cPHt8Z',
    ]

    it.each(NICOLL_MEGAMENU_URLS)('rejette %s', (url) => {
      expect(isJunkImageUrl(url)).toBe(true)
    })
  })

  describe('Nicoll real product images (path = /products/, style = product_*)', () => {
    // Les vraies images du caniveau Kenadrain — doivent passer.
    // `product_doc_carousel_mobile` est volontairement EXCLU : ce style Drupal
    // sert aux miniatures de documents PDF associés au produit, pas aux photos
    // produit — déjà rejeté à juste titre par le keyword `doc` du regex.
    const NICOLL_PRODUCT_URLS = [
      'https://www.nicoll.fr/sites/default/files/products/34955.jpg',
      'https://www.nicoll.fr/sites/default/files/styles/product_images_carousel_tablet/public/products/34955.jpg.webp?itok=fPdvbHgU',
      'https://www.nicoll.fr/sites/default/files/styles/variation_product_carousel_mobile/public/products/34955.jpg.webp?itok=wzmeIPwp',
      'https://www.nicoll.fr/sites/default/files/styles/product_images_small_carousel_mobile/public/products/34955.jpg.webp?itok=aa_Wgv3U',
    ]

    it.each(NICOLL_PRODUCT_URLS)('garde %s', (url) => {
      expect(isJunkImageUrl(url)).toBe(false)
    })
  })

  describe('Logos et pictos (déjà filtrés)', () => {
    it.each([
      'https://www.nicoll.fr/themes/custom/nicoll/logo.svg',
      'https://www.nicoll.fr/themes/custom/nicoll/images/global/logo-print.png',
      'https://www.nicoll.fr/sites/default/files/quality/picto/footer-icn-livraison.svg',
      'https://www.nicoll.fr/sites/default/files/domaine_app/picto/icn-domaine-amenagements.svg',
    ])('rejette %s', (url) => {
      expect(isJunkImageUrl(url)).toBe(true)
    })
  })

  describe('Bannières marketing FR (French Days, Jardiversaire, etc.)', () => {
    // Patterns observés sur Jardiland, Leroy Merlin, Castorama, etc.
    it.each([
      'https://www.jardiland.com/sites/files/banners/french-days-2026.jpg',
      'https://www.jardiland.com/promotions/french-days/banner.png',
      'https://www.jardiland.com/sites/files/jardiversaire-anniversaire-2026.jpg',
      'https://www.jardiland.com/sites/files/banners/offre-printemps-wolf.png',
      'https://www.jardiland.com/sites/files/jeu-concours-banner.jpg',
      'https://www.jardiland.com/sites/files/votez-pour-nous-magasin.jpg',
      'https://example.com/images/black-friday-2026.jpg',
      'https://example.com/promotions/soldes-banner.jpg',
      'https://example.com/sites/files/operation-commerciale-banner.jpg',
    ])('rejette bannière %s', (url) => {
      expect(isJunkImageUrl(url)).toBe(true)
    })
  })

  describe('Vraies images produit (doivent passer)', () => {
    // Patterns typiques de CDN produit qui DOIVENT être conservés.
    it.each([
      'https://www.jardiland.com/sites/default/files/products/ryobi-ry18lmx25a-tondeuse.jpg',
      'https://media.jardiland.com/catalog/products/12345/ryobi-tondeuse-front.jpg',
      'https://cdn.example.com/products/ryobi/ry18lmx25a/main.jpg',
    ])('garde %s', (url) => {
      expect(isJunkImageUrl(url)).toBe(false)
    })
  })
})
