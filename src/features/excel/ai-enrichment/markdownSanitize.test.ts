import { describe, it, expect } from 'vitest'
import { sanitizeJinaMarkdown, looksLikeBotChallenge } from './markdownSanitize'

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

  it('strips top navigation written as plain text concatenated (POST scrape via innerText)', () => {
    // Cas réel : `injectPageScript` dans Jina POST utilise innerText pour
    // extraire les nav top RS, ce qui colle les libellés sans espaces ni
    // structure markdown : "Nos servicesLe blog RSSecteurs industrielsAide & Contact"
    const md = `# Produit

Nos servicesLe blog RSSecteurs industrielsAide & Contact

Real description that should survive.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('Nos services')
    expect(out).not.toContain('Le blog')
    expect(out).not.toContain('Secteurs industriels')
    expect(out).not.toContain('Aide & Contact')
    expect(out).toContain('Real description that should survive.')
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

  it('supprime la section ## Avis (Bazaarvoice inline Dyson)', () => {
    const md = `# Produit

## Description complète

Robot intelligent.

## Avis

### Description sommaire de la notation

Sélectionnez une ligne ci-dessous pour filtrer les avis.

### Note générale

3.4

606 avis

### Filtrer les avis

Afficher plus de filtres

### Avis régionaux

1 to 8 sur 606 avis.

## Caractéristiques

*   Temps de charge

3 hrs
`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('Robot intelligent')
    expect(out).toContain('## Caractéristiques')
    expect(out).toContain('Temps de charge')
    expect(out).not.toContain('Sélectionnez une ligne')
    expect(out).not.toContain('Filtrer les avis')
    expect(out).not.toContain('Avis régionaux')
    expect(out).not.toContain('606 avis')
    expect(out).not.toContain('Note générale')
  })

  it("transforme `[Heading]Text` en `**Heading**\\n\\nText` (Dyson data-label inline)", () => {
    const md = `# Produit

## Description complète

[Détection des taches avec IA avancée.¹]Robot intelligent : Identification des taches par IA et caméra HD

[Nettoie sans relâche]Aspiration Dyson Puissante : 4 fois plus d'aspiration sur les tapis³
`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('**Détection des taches avec IA avancée.¹**')
    expect(out).toContain('Robot intelligent : Identification')
    expect(out).not.toContain('[Détection des taches')
    expect(out).toContain('**Nettoie sans relâche**')
    expect(out).toContain('Aspiration Dyson Puissante')
  })

  it('ne touche PAS les liens markdown valides `[text](url)`', () => {
    const md = `# Produit

Voir le [guide d'utilisation](https://example.com/guide) pour plus d'infos.

![Image alt](https://example.com/img.jpg)
`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('[guide d\'utilisation](https://example.com/guide)')
    expect(out).toContain('![Image alt](https://example.com/img.jpg)')
  })

  it('supprime également ## Avis alimentés par Bazaarvoice', () => {
    const md = `# Produit

## Description complète

Vraiment bien.

## Avis alimentés par Bazaarvoice

### Note globale

3.4 stars out of 5 from 602 Avis

> Aspirateur robot laveur intelligent.

## Foire aux questions

Comment ça marche ?
`
    const out = sanitizeJinaMarkdown(md)
    expect(out).toContain('Vraiment bien')
    expect(out).toContain('Foire aux questions')
    expect(out).not.toContain('Bazaarvoice')
    expect(out).not.toContain('602 Avis')
    expect(out).not.toContain('Note globale')
  })

  it('strips Tealium / GTM / Facebook Pixel tracking URLs (universal)', () => {
    const md = `# Produit

//tags.tiqcdn.com/utag/kingfisher/screwfix-fr/prod/utag.js
https://www.googletagmanager.com/gtm.js?id=GTM-XXXX
//connect.facebook.net/en_US/fbevents.js

Description réelle du produit ici.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('tags.tiqcdn.com')
    expect(out).not.toContain('googletagmanager')
    expect(out).not.toContain('connect.facebook.net')
    expect(out).toContain('Description réelle du produit ici.')
  })

  it('strips JSON-LD blocks (schema.org)', () => {
    const md = `# Produit

{ "@context": "https://schema.org", "@type": "Product", "name": "Test" }

Description réelle.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('@context')
    expect(out).not.toContain('schema.org')
    expect(out).toContain('Description réelle.')
  })

  it('detects DataDome bot challenge page (Rubix-style)', () => {
    const challenge = `We want to make sure it is actually you we are dealing with and not a robot.

The visual verification might not be accessible to you. We recommend you to use the audio verification instead. Important: after clicking play, you will hear 6 digits.

Why is this verification required? Something about the behaviour of the browser has caught our attention.

There are various possible explanations for this:`
    expect(looksLikeBotChallenge(challenge)).toBe(true)
  })

  it('detects French CAPTCHA challenge page', () => {
    const challenge = `Nous voulons nous assurer qu'il s'agit bien de vous et non d'un robot.

Cette vérification est requise car votre navigateur a un comportement inhabituel.

Veuillez compléter le captcha pour continuer.`
    expect(looksLikeBotChallenge(challenge)).toBe(true)
  })

  it('detects DataDome bullet variant (no "robot/captcha" wording)', () => {
    // Variant observé sur Rubix : seul "various possible explanations" + bullets
    const challenge = `There are various possible explanations for this:
* you are browsing and clicking at a speed much faster than expected of a human being
* something is preventing Javascript from working on your computer
* there is a robot on the same network (IP 34.34.225.178) as you`
    expect(looksLikeBotChallenge(challenge)).toBe(true)
  })

  it('detects "you have been blocked" generic message', () => {
    const md = `# rubix.com

# You have been blocked

Some text here about the block.`
    expect(looksLikeBotChallenge(md)).toBe(true)
  })

  it('does NOT trigger on a real product page mentioning captcha in passing', () => {
    const realProduct = `# Perceuse-Visseuse 18V

Outil professionnel sans fil avec batterie lithium-ion 5 Ah. Idéal pour les
travaux de bricolage et de construction. Inclut un mandrin métallique et
deux vitesses mécaniques.

Le site utilise un captcha pour la création de compte.`
    expect(looksLikeBotChallenge(realProduct)).toBe(false)
  })

  it('returns false for empty or short markdown', () => {
    expect(looksLikeBotChallenge('')).toBe(false)
    expect(looksLikeBotChallenge('hello')).toBe(false)
  })

  it('strips inline analytics function calls (gtag, fbq, ga)', () => {
    const md = `# Produit

gtag('config', 'GA_TRACKING_ID');
fbq('track', 'PageView');
window.dataLayer = window.dataLayer || [];

Vraie description.`
    const out = sanitizeJinaMarkdown(md)
    expect(out).not.toContain('gtag(')
    expect(out).not.toContain('fbq(')
    expect(out).not.toContain('window.dataLayer')
    expect(out).toContain('Vraie description.')
  })
})
