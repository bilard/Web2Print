// src/features/scraping/core/__tests__/parseAdvantages.test.ts
import { describe, it, expect } from 'vitest'
import { parseAdvantagesFromMarkdown, parseAdvantagesFromHtml, mergeGroupsIntoAdvantages, mergeAdvantagesAdditive } from '../parsers/parseAdvantages'

const MD_FLAT = `## Points forts

- Robuste et très durable
- Compacte et légère
- Batterie longue durée
`

const MD_GROUPED = `## Avantages performance

- Couple maxi 250 Nm
- 3 vitesses variables

## Avantages confort

- Poignée ergonomique
- LED intégrée au boîtier
`

describe('parseAdvantagesFromMarkdown', () => {
  it('extrait une liste plate sans groupes', () => {
    const advs = parseAdvantagesFromMarkdown(MD_FLAT)
    expect(advs).toHaveLength(3)
    expect(advs[0]).toEqual({ text: 'Robuste et très durable' })
  })

  it('extrait avec groupes quand sections multiples', () => {
    const advs = parseAdvantagesFromMarkdown(MD_GROUPED)
    expect(advs).toHaveLength(4)
    expect(advs.find(a => a.text.includes('Couple maxi'))).toMatchObject({ group: expect.stringContaining('performance') })
    expect(advs.find(a => a.text.includes('Poignée'))).toMatchObject({ group: expect.stringContaining('confort') })
  })

  it('renvoie tableau vide si pas d\'avantages', () => {
    expect(parseAdvantagesFromMarkdown('# Produit\n\nDescription seulement')).toEqual([])
  })

  it('Milwaukee : "## caractéristiques" seul + bullets longs → traité comme features', () => {
    // Ambiguïté FR : "Caractéristiques" peut être specs (Dyson) OU features (Milwaukee).
    // Heuristique : si ≥ 3 bullets longs (≥ 30 chars) sans pattern "name: value",
    // c'est une section de features.
    const md = `# Perceuse Milwaukee M18 FPD3

## caractéristiques

*   Rendement supérieur avec un couple puissant de 158 Nm
*   Design compact avec 175 mm de long pour accéder facilement aux espaces étroits
*   AUTOSTOP™, un mécanisme de sécurité breveté permettant un arrêt immédiat
*   Nouveau mandrin métal 13 mm offrant une meilleure prise des mors
*   LED pour une meilleure visibilité dans des situations de faible éclairage
`
    const advs = parseAdvantagesFromMarkdown(md)
    expect(advs.length).toBeGreaterThanOrEqual(5)
    expect(advs.some(a => a.text.includes('158 Nm'))).toBe(true)
    expect(advs.some(a => a.text.includes('AUTOSTOP'))).toBe(true)
    expect(advs.some(a => a.text.includes('mandrin'))).toBe(true)
  })

  it('Dyson : "## Caractéristiques" + paires nom/valeur → reste section specs (pas de features)', () => {
    // Cas inverse : section "Caractéristiques" avec paires courtes "name: value"
    // → c'est des specs, pas des features → ne doit PAS extraire d'advantages.
    const md = `# Aspirateur

## Avantages produits

- Filtration HEPA renforcée

## Caractéristiques

- Puissance: 1500 W
- Capacité: 2 L
- Poids: 5 kg
`
    const advs = parseAdvantagesFromMarkdown(md)
    // Seule la section Avantages doit produire des items
    expect(advs.some(a => a.text.includes('HEPA'))).toBe(true)
    expect(advs.some(a => a.text.includes('Puissance'))).toBe(false)
    expect(advs.some(a => a.text.includes('Capacité'))).toBe(false)
  })
})

describe('mergeGroupsIntoAdvantages', () => {
  it('ajoute les groupes sans supprimer d\'items existants', () => {
    const existing = [{ text: 'Robuste' }, { text: 'Compacte' }]
    const md = [{ text: 'Robuste', group: 'Performance' }, { text: 'Légère', group: 'Confort' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(3)
    expect(merged.find(a => a.text === 'Robuste')).toMatchObject({ group: 'Performance' })
    expect(merged.find(a => a.text === 'Compacte')).toBeDefined()
    expect(merged.find(a => a.text === 'Légère')).toMatchObject({ group: 'Confort' })
  })

  it('ne duplique pas un item déjà présent', () => {
    const existing = [{ text: 'Robuste' }]
    const md = [{ text: 'Robuste', group: 'Performance' }]
    const merged = mergeGroupsIntoAdvantages(existing, md)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ text: 'Robuste', group: 'Performance' })
  })
})

// Extrait RÉEL d'une fiche Castorama (Jina, 2026-07-11) : heading Kingfisher
// « Caractéristiques et avantages » — sortait de la zone features (backtracking
// sur `caract…s?` sans \b) → 0 avantage sur toutes les fiches Castorama.
const CASTORAMA_MD = `# Abri de jardin OAKLAND 757 en résine - KETER

### Caractéristiques et avantages

Pour les Soldes d’été, Castorama vous accompagne avec une sélection de produits pour aménager, rénover et entretenir votre maison et votre extérieur

*   Structure en polypropylène brossé avec un effet bois selon la technologie Duotech traité anti-UV.
*   Surface hors tout : 4,5 m²
*   Système d'aération pour garder le contenu au sec et aéré
*   Double porte cadenassable (cadenas non fourni)
*   Garantie : 10 ans

### Spécifications techniques

| Type d'article | Abri de jardin |
| --- |
| Marque | Keter |
`

describe('parseAdvantagesFromMarkdown — « Caractéristiques et avantages » (Castorama)', () => {
  it('entre dans la zone features et capture les bullets prose', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    const texts = advs.map((a) => a.text)
    expect(texts.some((t) => t.includes('polypropylène brossé'))).toBe(true)
    expect(texts.some((t) => t.includes("Système d'aération"))).toBe(true)
  })

  it('exclut la bannière commerciale et les paires « Nom : Valeur » (déjà specs)', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    const texts = advs.map((a) => a.text)
    expect(texts.some((t) => t.includes('Soldes'))).toBe(false)
    expect(texts.some((t) => t.startsWith('Surface hors tout'))).toBe(false)
    expect(texts.some((t) => t.startsWith('Garantie'))).toBe(false)
  })

  it('ne pollue pas le groupe avec « et avantages » résiduel', () => {
    const advs = parseAdvantagesFromMarkdown(CASTORAMA_MD)
    expect(advs.every((a) => a.group !== 'et avantages')).toBe(true)
  })
})

// Extrait RÉEL d'une fiche Jardiland (Jina navigateur, 2026-07-12) : points
// forts en LIGNES PLATES sans puces + bloc d'avis client (« Steffan M. »,
// « 5/5 5/5 », témoignage) + widget prix — l'avis devenait l'unique
// « avantage » et les vrais points forts étaient perdus.
const JARDILAND_MD = `# Abri de jardin bois 6,8m² Flodova

## Points forts

Robustesse exceptionnelle

Toit avec évacuation d'eau

Double porte vitrée

Steffan M.

5/5 5/5

Parfait, montage simple. Toiture qui pourrait être amélioré avec un autre système (goudron actuellement). Les chaumières sont un peu légères.…

944,10 €1 049,00 €- 10 %

Quantité

Livraison à domicile

GRATUIT à partir du dimanche 26 juillet
`

describe('parseAdvantagesFromMarkdown — points forts en lignes plates + avis client (Jardiland)', () => {
  it('capture les points forts courts sans puces', () => {
    const texts = parseAdvantagesFromMarkdown(JARDILAND_MD).map((a) => a.text)
    expect(texts).toContain('Robustesse exceptionnelle')
    expect(texts).toContain("Toit avec évacuation d'eau")
    expect(texts).toContain('Double porte vitrée')
  })

  it("exclut l'avis client et le bloc commerce post-prix", () => {
    const all = parseAdvantagesFromMarkdown(JARDILAND_MD).map((a) => a.text).join(' | ')
    expect(all).not.toContain('montage simple')
    expect(all).not.toContain('GRATUIT')
    expect(all).not.toContain('€')
  })
})

// Fixture RÉELLE (Milwaukee M18 ONEFHPX, HTML statique) : la section
// « caractéristiques » est un <h2> minuscule + <ul> replié côté rendu
// (« Voir plus ») — le HTML statique, lui, contient la liste COMPLÈTE.
// Bug d'origine : la fiche ne gardait que les 6 puces visibles du rendu.
const MILWAUKEE_HTML = `
<html><head><script>window.__REDUX_STORE = {"features":["bruit de script à ignorer"],"readMoreText":"Voir plus"}</script>
<style>.jKBbkw{color:#db011c;}</style></head><body>
<nav><ul><li><a href="/systems/m18/">M18</a></li><li>Plaquiste</li></ul></nav>
<section id="caractéristiques" data-navigation-title="caractéristiques">
<h2 class="Typographystyles__H2-sc-fh0jc-1">caractéristiques</h2>
<ul class="ProductFeaturesTextstyles__FeatureList-sc-fxqvf2-1">
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">Perfo-burineur le plus puissant de sa cat&eacute;gorie avec une force de frappe de 5.0 J (EPTA) avec un niveau de vibration r&eacute;duit de 6.9 m/s&sup2;.</li>
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">Jusqu'&agrave; 10 trous de &#8960;18 mm et de 100 mm de profondeur avec une charge de batterie <a href="/systems/m18/">M18&trade;</a> HIGH OUTPUT&trade; 5,5 Ah.</li>
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">FIXTEC&trade; permet d&#8217;intervertir entre l&#8217;emmanchement SDS-PLUS et le mandrin auto-serrant 13mm</li>
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">4 modes de fonctionnement : Per&ccedil;age, burinage, perfo-burinage et orientation du burin (variolock).</li>
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">Compatible avec le syst&egrave;me d'aspiration M18 FPDDEXL</li>
<li class="ProductFeaturesTextstyles__Feature-sc-fxqvf2-3">Syst&egrave;me de batterie r&eacute;trocompatible: fonctionne avec toutes les batteries MILWAUKEE&reg; M18&trade;</li>
</ul></div></section>
<section><h2>Spécifications</h2><table><tr><td>Capacité</td><td>32 mm</td></tr></table></section>
<footer><ul><li>Mentions légales</li><li>Politique de confidentialité</li></ul></footer>
</body></html>`

describe('parseAdvantagesFromHtml — HTML statique (Milwaukee, liste repliée côté rendu)', () => {
  it('capture la liste complète, y compris la queue masquée par « Voir plus »', () => {
    const texts = parseAdvantagesFromHtml(MILWAUKEE_HTML).map((a) => a.text)
    expect(texts.some((t) => t.startsWith('Perfo-burineur le plus puissant'))).toBe(true)
    expect(texts).toContain("Compatible avec le système d'aspiration M18 FPDDEXL")
    expect(texts.some((t) => t.startsWith('Système de batterie rétrocompatible'))).toBe(true)
  })

  it('décode les entités et aplatit les liens <a> en texte', () => {
    const texts = parseAdvantagesFromHtml(MILWAUKEE_HTML).map((a) => a.text)
    const batterie = texts.find((t) => t.includes('HIGH OUTPUT'))
    expect(batterie).toContain('M18™ HIGH OUTPUT™ 5,5 Ah')
    expect(batterie).not.toContain('&trade;')
  })

  it('ignore nav/footer/script/table (aucun bruit hors zone features)', () => {
    const all = parseAdvantagesFromHtml(MILWAUKEE_HTML).map((a) => a.text).join(' | ')
    expect(all).not.toContain('Mentions légales')
    expect(all).not.toContain('bruit de script')
    expect(all).not.toContain('32 mm')
  })

  it('garde-fou : HTML vide ou sans zone features → liste vide', () => {
    expect(parseAdvantagesFromHtml('')).toEqual([])
    expect(parseAdvantagesFromHtml('<html><body><ul><li>Un item hors de toute section avantages qui fait plus de quinze caractères</li></ul></body></html>')).toEqual([])
  })
})

describe('mergeAdvantagesAdditive', () => {
  const base = [{ text: 'Perfo-burineur le plus puissant de sa catégorie', group: 'caractéristiques' }]
  it('ajoute les items nouveaux, jamais les doublons (normalisation accents/ponctuation)', () => {
    const merged = mergeAdvantagesAdditive(base, [
      { text: 'PERFO-BURINEUR le plus puissant de sa catégorie !' }, // doublon normalisé
      { text: "Compatible avec le système d'aspiration M18 FPDDEXL" },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toBe(base[0]) // base intacte, ordre préservé
  })
  it('garde-fou : extra vide → base retournée telle quelle', () => {
    expect(mergeAdvantagesAdditive(base, [])).toBe(base)
  })
})

// Fixture réelle trafic.com (Démo express, 2026-07-13) : le bloc « Avantages »
// du menu COMPTE Magento (« Suivi de la commande », « Commandez plus
// rapidement ») et le widget stock (« En rupture en ligne », « Restez
// informé(e) sur le stock », « Me tenir informé(e) ») devenaient des
// « Points forts » de la fiche. Signal par vocabulaire compte/stock, pas par site.
describe('parseAdvantagesFromMarkdown — UI compte / stock (fixture Trafic)', () => {
  const MD = `**Avantages :**

*   Suivi de la commande
*   Commandez plus rapidement

## Points forts

*   Flux d'air uniforme et silencieux pour un confort optimal
*   Conception sans pales, sécurisée pour les enfants

En rupture en ligne

Restez informé(e) sur le stock

Me tenir informé(e)
`
  it('tue l’UI compte/stock, garde les vrais points forts', () => {
    const advs = parseAdvantagesFromMarkdown(MD).map((a) => a.text)
    expect(advs).toContain('Flux d\'air uniforme et silencieux pour un confort optimal')
    expect(advs).toContain('Conception sans pales, sécurisée pour les enfants')
    expect(advs.join(' | ')).not.toMatch(/suivi de la commande|commandez plus rapidement|en rupture|restez informé|me tenir informé/i)
  })
})

// Fixture réelle screwfix.fr (2026-07-13) : le bloc « Avantages : » du menu
// COMPTE ouvre la zone features, puis les SENTINELLES internes
// (JINA_EXTRACTED_*), une ligne document « 780##https://….pdf » et la liste de
// navigation des catégories devenaient des puces d'avantages. Règles
// génériques : sentinelle = borne machine (ferme la zone + jamais une puce),
// ligne document rejetée, vocabulaire compte client rejeté.
describe('parseAdvantagesFromMarkdown — sentinelles / nav / compte (fixture Screwfix)', () => {
  const MD = `Avantages :

*   Suivre l'historique des commandes

JINA_EXTRACTED_IMAGES_START
JINA_EXTRACTED_IMAGES_END
JINA_EXTRACTED_DOWNLOADS_START
780##Entreprise responsable,https://www.screwfix.fr/media/general/assets/pdf/Accessibility/Strat_gie_d_entreprise_responsable.pdf
JINA_EXTRACTED_DOWNLOADS_END

*   Outillage électroportatif
*   Batterie et chargeur
*   Scie électrique portative

## Points forts

*   Largeur de coupe XXL de 53 cm pour une tonte optimale
*   Collecteur d'herbe robuste de 65 L avec indicateur de remplissage
`
  it('ne capture NI sentinelles, NI ligne document, NI menu compte/catégories', () => {
    const advs = parseAdvantagesFromMarkdown(MD).map((a) => a.text)
    expect(advs.join(' | ')).not.toMatch(/JINA_EXTRACTED|##|historique des commandes|Outillage électroportatif|Batterie et chargeur|Scie électrique/i)
  })
  it('garde les vrais points forts', () => {
    const advs = parseAdvantagesFromMarkdown(MD).map((a) => a.text)
    expect(advs).toContain('Largeur de coupe XXL de 53 cm pour une tonte optimale')
    expect(advs).toContain("Collecteur d'herbe robuste de 65 L avec indicateur de remplissage")
  })
})

// Fixture réelle trafic.com (2026-07-14, fiche farelek-telecommande-ventilateur-de-pl,
// Magento) : la ligne d'UI de login « La création d'un compte possède de nombreux
// avantages : » OUVRAIT la zone features, et faute de heading H1/H2 pour la
// refermer, TOUT le bas de page devenait des « avantages » (promesses enseigne,
// table sérialisée, newsletter, TVA TRAFINTER, adresses, Mollie, bloc NL avec
// placeholders de template non résolus). Signal par vocabulaire compte/checkout
// et par motifs génériques (placeholder, n° TVA, table pipée) — jamais par site.
describe('parseAdvantagesFromMarkdown — UI compte Magento + footer enseigne (fixture Trafic Farelek)', () => {
  const MD = `# Farelek Télécommande Ventilateur De Plafond

**Commander en tant que nouveau client**

La création d’un compte possède de nombreux avantages :

*   Voir le statut de la commande et de l’expédition
*   Suivi de la commande
*   Commandez plus rapidement

**Commander en utilisant votre compte**

Adresse email 

Mot de passe 

Farelek Télécommande Ventilateur De Plafond

SKU 1084074

FARELEK Télécommande Ventilateur de Plafond

50 69

Détails

FARELEK Télécommande Ventilateur de Plafond

Caractéristiques

Plus d’information| Référence Trafic | 1084074 |
| --- |

Nos 4 promesses:

*   Laissez-vous séduire
*   par un choix impressionnant, des offres et des collections exclusives

*   Faites confiance
*   à une qualité testée et validée

*   Profitez
*   des meilleurs prix garantis du marché

*   Vivez
*   une expérience chaleureuse et agréable

 Doe je liever je aankopen op onze country_language__other site? 

Inscrivez-vous pour recevoir nos infos

Vous pouvez vous désinscrire à tout moment en vous rendant sur votre compte. Voyez notre politique de respect de la vie privée pour plus d'informations.

TRAFINTER (FR) FR08383139458

(Rue Jean Jaures, n°225, 59243 Quarouble, France)

Payez vite et en toute sécurité avec avec Mollie
`
  it("l'UI de login n'ouvre pas la zone features → aucun item du footer", () => {
    const advs = parseAdvantagesFromMarkdown(MD).map((a) => a.text)
    expect(advs.join(' | ')).not.toMatch(/Laissez-vous séduire|Faites confiance|prix garantis|expérience chaleureuse|Inscrivez-vous|désinscrire|TRAFINTER|Quarouble|Mollie|Doe je liever|country_|Plus d’information|Référence Trafic/i)
  })
  it('aucun heading de section nu ne devient un avantage', () => {
    const advs = parseAdvantagesFromMarkdown(MD).map((a) => a.text)
    expect(advs).not.toContain('Caractéristiques')
  })
})
