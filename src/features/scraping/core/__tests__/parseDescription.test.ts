import { describe, it, expect } from 'vitest'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'

const SAMPLE_MD_1 = `# Perceuse 18V

Perceuse-visseuse compacte 18V avec batterie Li-Ion intégrée. Idéale pour les
professionnels du bâtiment.

## Caractéristiques techniques

| Tension | 18 V |
| Couple maxi | 60 Nm |
`

const SAMPLE_MD_2 = `# Visseuse à chocs

## Description

Visseuse à chocs 18V haute performance. Couple impressionnant de 250 Nm.

## Avantages

- Robuste
- Compacte
`

const SAMPLE_NO_DESC = `# Produit X

## Spécifications

| Poids | 1.5 kg |
`

describe('parseDescriptionFromMarkdown', () => {
  it('extrait le paragraphe sous le H1 quand pas de section dédiée', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_1)
    expect(desc).toContain('Perceuse-visseuse compacte 18V')
    expect(desc).not.toContain('Caractéristiques')
  })

  it('extrait la section "## Description" si présente', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_2)
    expect(desc).toContain('haute performance')
    expect(desc).not.toContain('Robuste')
  })

  it('renvoie au moins le titre H1 si pas de description prose', () => {
    // La fonction utilise le H1 comme description minimale en dernier recours
    // quand aucune prose n'est trouvée (ni section dédiée, ni paragraphe après le titre)
    const desc = parseDescriptionFromMarkdown(SAMPLE_NO_DESC)
    expect(desc).toBe('Produit X')
    expect(desc).not.toContain('Spécifications')
    expect(desc).not.toContain('Poids')
  })

  it('exclut la section ## Caractéristiques des sections descriptives (specs Dyson)', () => {
    // Dyson : ## Caractéristiques contient des specs (nom + valeur sur 2 lignes)
    // La section NE doit PAS être collectée comme description.
    // ## Description complète doit être la source.
    const md = `# Aspirateur robot Dyson Spot+Scrub Ai

## Caractéristiques

*   Temps de charge

3 hrs

*   Durée de fonctionnement

200 min

*   Filtre

La double filtration hygiénique capture les poussières microscopiques aussi petites que 0,1 micron.

## Description complète

Révèle les taches et les poussières dissimulées grâce à un faisceau lumineux.

Inspecte visuellement les surfaces et identifie plus de 190 objets.
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('Révèle les taches')
    expect(desc).not.toContain('Temps de charge')
    expect(desc).not.toContain('Durée de fonctionnement')
    expect(desc).not.toContain('3 hrs')
  })

  it('filtre le texte UI de section avis Bazaarvoice (garbageContent)', () => {
    const md = `# Produit

Sélectionnez une ligne ci-dessous pour filtrer les avis.

Révèle les taches et les poussières dissimulées grâce à un faisceau lumineux.

Inspecte visuellement les surfaces et identifie plus de 190 objets.
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).not.toContain('Sélectionnez une ligne')
    expect(desc).toContain('Révèle les taches')
  })

  it('ignore les bandeaux cookies (retourne le titre H1 en dernier recours)', () => {
    // Le contenu cookie est filtré par isGarbageContent → aucune prose trouvée
    // La fonction revient sur le H1 comme description minimale
    const md = '# Produit\n\nWe use cookies. Accept all cookies. Manage preferences.\n\n## Specs\n'
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toBe('Produit')
    expect(desc).not.toContain('cookies')
    expect(desc).not.toContain('Specs')
  })

  it('Phase 0bis : H3 en gras (titre produit) suivi d\'un long paragraphe', () => {
    // Pattern fréquent quand NEXT_DATA_SPECS n'est pas exploitable :
    // `### **Tondeuse à gazon Makita LXT...**` immédiatement suivi du paragraphe
    // descriptif. Le parser doit ignorer le H3 (titre) et capturer le paragraphe.
    const md = `# DLM432Z | Makita LXT, Batterie | RS

Code commande RS:252-2566 Référence fabricant:DLM432Z Marque:Makita

### **Tondeuse à gazon Makita LXT, diamètre de coupe de 43 cm - DLM432Z**

Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace de l'herbe, alliant performances et caractéristiques conviviales. Il est parfait pour l'entretien des jardins jusqu'à 575m².

### **Caractéristiques et avantages**

• La fonction de démarrage progressif réduit la surtension initiale
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('tondeuse à gazon alimentée par batterie')
    expect(desc).toContain('575m²')
    expect(desc).not.toContain('Code commande')
    expect(desc).not.toContain('DLM432Z') // pas le titre H3
    expect(desc).not.toContain('démarrage progressif') // pas le bullet de la section suivante
  })

  it('parse NEXT_DATA_SPECS tronqué via regex fallback (JSON incomplet)', () => {
    // Cas réel : le scrape POST tronque le JSON à 30 000 chars donc JSON.parse
    // échoue. Le fallback regex doit quand même extraire les Paragraph.
    const truncated = `# H1

NEXT_DATA_SPECS: {"pageProps":{"articleResult":{"data":{"article":{"descriptiveContent":{"unique":{"content":[{"name":"01Heading","type":"Heading","value":["<B>Tondeuse Makita LXT</B>"]},{"name":"01Paragraph","type":"Paragraph","value":["Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace de l'herbe."]},{"name":"02Heading","type":"Heading","value":["<B>Quelle est la durée ?</B>"]},{"name":"02Paragraph","type":"Paragraph","value":["Les batteries offrent une autonomie."]}]}},"image":{"main":"https://media`
    // ↑ pas de fermeture d'accolades, JSON.parse va échouer
    const desc = parseDescriptionFromMarkdown(truncated)
    expect(desc).toContain('tondeuse à gazon alimentée par batterie')
    // Le 2e Paragraph est sous un FAQ Heading → doit être exclu
    expect(desc).not.toContain('autonomie')
  })

  it('parse NEXT_DATA_SPECS de RS Components en priorité (source structurée)', () => {
    // Cas réel : le scrape POST de RS Components injecte le blob __NEXT_DATA__
    // dans le markdown sous forme `NEXT_DATA_SPECS: {...}`. Ce blob contient
    // descriptiveContent.unique.content[] avec Heading + Paragraph séquentiels.
    // La Phase 0 doit extraire les Paragraph et ignorer les FAQ Headings.
    const md = `# Produit junk

NEXT_DATA_SPECS: {"pageProps":{"articleResult":{"data":{"article":{"descriptiveContent":{"unique":{"content":[{"name":"01Heading","type":"Heading","value":["<B>Tondeuse Makita LXT - DLM432Z</B>"]},{"name":"01Paragraph","type":"Paragraph","value":["Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace de l'herbe."]},{"name":"02Heading","type":"Heading","value":["<B>Caractéristiques et avantages</B>"]},{"name":"02List","type":"List","value":["• Démarrage progressif"]},{"name":"03Heading","type":"Heading","value":["<B>Quelle est la durée de vie ?</B>"]},{"name":"03Paragraph","type":"Paragraph","value":["Les batteries offrent une autonomie importante."]}]}}}}}}}

Code commande RS:252-2566 Référence fabricant:DLM432Z
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('tondeuse à gazon alimentée par batterie')
    // Le 2e heading FAQ doit stopper l'extraction → pas de "autonomie importante"
    expect(desc).not.toContain('autonomie importante')
    expect(desc).not.toContain('Code commande')
    expect(desc).not.toContain('<B>') // HTML strippé
  })

  it('ignore la ligne métadonnées (Code commande / Référence / Marque) en Phase 1', () => {
    // Cas réel : RS Components affiche en haut de fiche une ligne unique
    // "Code commande RS:… Référence fabricant:… Marque:…" entre le H1 et le
    // contenu produit. La vraie description marketing arrive plus bas, sous
    // un H3 qui contient le nom du produit (donc ne matche pas descSectionRe).
    // Sans le rejet métadonnées, Phase 1 capture cette ligne junk et bloque
    // Phase 3, qui est pourtant le seul moyen de récupérer la prose.
    const md = `# Makita LXT, Batterie

Code commande RS:252-2566 Référence fabricant:DLM432Z Marque:Makita

### **Tondeuse à gazon Makita LXT, diamètre de coupe de 43 cm - DLM432Z**

Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace de l'herbe, alliant performances et caractéristiques conviviales. Il est parfait pour l'entretien des jardins jusqu'à 575m². La tondeuse à gazon haute performance utilise deux batteries lithium-ion de 18 V pour alimenter un robuste moteur à courant continu de 36 V.

### **Caractéristiques et avantages**

• La fonction de démarrage progressif réduit la surtension initiale
• Poignée ergonomique caoutchoutée pour un meilleur confort
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('tondeuse à gazon alimentée par batterie')
    expect(desc).not.toContain('Code commande')
    expect(desc).not.toContain('DLM432Z') // pas le titre H3, juste la prose
  })
})

// Extrait RÉEL d'une fiche Castorama rendue par Jina (2026-07-11) : les lignes
// widgets (note d'avis, bandeau promo) dépassent 40 chars et empoisonnaient la
// description (cas Démo express — abris de jardin).
const SAMPLE_CASTORAMA = `# Abri de jardin OAKLAND 757 en résine - KETER - gris et noir - Surface hors tout 5,12 m²

Vendu et expédié par Castorama

Note avis produits: 3.44 étoiles sur 5 sur 47 avis produits

(47)

Prix d’origine 1 149,90€~~1 149,90€~~919,92€Vous économisez 229,98€

*Soldes, offre valable du 24/06/2026 au 17/07/2026, dans la limite des stocks disponibles.

!Image 28: Icone Wibilong Interroger les utilisateurs Quantité limitée à 660 pièces au 08/07/2026 pour l'ensemble des magasins participants.

Pour connaître la disponibilité des produits renseignez votre code postal

## Détails du produit

### Informations sur le produit

L’abri de jardin Okaland 757 très élégant, de la marque Keter, offre une surface de 5,12m². Très esthétique, sa structure résistante en polypropylène brossé présente un effet bois selon la technologie Duotech et est traitée anti UV.
`

describe('parseDescriptionFromMarkdown — bruit widgets e-commerce (Castorama)', () => {
  it('rejette les lignes widgets (avis, promo, dispo magasin) et garde la vraie prose', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_CASTORAMA)
    expect(desc).toContain('polypropylène brossé')
    expect(desc).not.toContain('étoiles sur 5')
    expect(desc).not.toContain('Vous économisez')
    expect(desc).not.toContain('code postal')
    expect(desc).not.toContain('Wibilong')
    expect(desc).not.toContain('Ajouter au panier')
  })
})

describe('parseDescriptionFromMarkdown — bloc avis client (Jardiland)', () => {
  it("le témoignage « 5/5 » ne devient pas la description", () => {
    const md = `# Abri Flodova

Steffan M.

5/5 5/5

Parfait, montage simple. Toiture qui pourrait être améliorée avec un autre système, les chaumières sont un peu légères sur ce produit.

L'abri de jardin Flodova est conçu en sapin du Nord naturel, un matériau réputé pour sa robustesse et sa résistance aux conditions climatiques.
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('sapin du Nord')
    expect(desc).not.toContain('montage simple')
  })
})

// Fixture réelle trafic.com (2026-07-14, fiche Farelek) : la fiche n'a qu'une
// ligne de description ; le scrape browser déplie l'onglet GARANTIE (prose CGV
// « défaut de conformité », « lettre recommandée ») qui devenait LA description
// (plus long bloc de prose), et l'UI de login Magento (« La création d'un compte
// possède de nombreux avantages : ») polluait la phase 1. Signal par vocabulaire
// juridique/compte — jamais par site.
describe('parseDescriptionFromMarkdown — prose CGV/garantie et UI compte exclues (fixture Trafic Farelek)', () => {
  const MD = `# Farelek Télécommande Ventilateur De Plafond

**Commander en tant que nouveau client**

La création d’un compte possède de nombreux avantages :

Adresse email 

Détails

FARELEK Télécommande Ventilateur de Plafond

Garantie

Le Vendeur offre une garantie de 24 mois contre tout défaut de conformité non apparent dont pourraient être affectés les produits vendus. Ce délai prend cours au moment de la délivrance du produit (date renseignée sur le bon de livraison et, à défaut, sur le ticket ou le bon d’achat) pour une utilisation exclusivement non professionnelle du produit par un consommateur (Client particulier). Toute réclamation pour défaut de conformité doit être adressée par e-mail, ou en lettre recommandée à SOGESMA S.A. dans les 2 mois calendrier suivant le jour où le consommateur a constaté le défaut ou devait pouvoir le constater, sous peine d’annulation de son droit à une telle réclamation.
`
  it('ni la garantie CGV ni le bloc compte ne deviennent la description', () => {
    const desc = parseDescriptionFromMarkdown(MD)
    expect(desc).not.toMatch(/défaut de conformité|lettre recommandée|garantie de 24 mois|création d’un compte/i)
  })
})

describe('parseDescriptionFromMarkdown — préservation du gras de la source', () => {
  it('conserve le **gras** markdown dans le paragraphe descriptif', () => {
    const md = `# Ventilateur sans hélice Lifetime Air

**Le ventilateur de table sans hélice Lifetime Air** allie design moderne, sécurité
et performance silencieuse. Grâce à sa conception **sans pales**, il diffuse un flux
d'air uniforme tout en restant facile à nettoyer.
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('**Le ventilateur de table sans hélice Lifetime Air**')
    expect(desc).toContain('**sans pales**')
  })

  it('convertit <strong>/<b> de la source en marqueurs gras', () => {
    const md = `# Perceuse XR

Cette perceuse <strong>18 V</strong> offre un couple de <b>60 Nm</b> pour tous vos
travaux de perçage et de vissage sur bois, métal et matériaux composites divers.
`
    const desc = parseDescriptionFromMarkdown(md)
    expect(desc).toContain('**18 V**')
    expect(desc).toContain('**60 Nm**')
  })

  it('texte sans gras : aucun marqueur ** ajouté', () => {
    const desc = parseDescriptionFromMarkdown(SAMPLE_MD_1)
    expect(desc).not.toContain('**')
    expect(desc).toContain('Perceuse-visseuse compacte 18V')
  })
})

import { parseRichDescriptionFromMarkdown } from '../parsers/parseDescription'

describe('parseRichDescriptionFromMarkdown — structure de la source préservée', () => {
  const MD = `# Ventilateur sans hélice noir

## Le ventilateur de table sans hélice Lifetime Air allie design moderne, sécurité et performance silencieuse.

Grâce à sa conception **sans pales**, il diffuse un flux d'air uniforme tout en étant facile à nettoyer et adapté aux familles.

**Caractéristiques principales :**

- Marque : Lifetime Air
- Couleur : Noir
- Puissance : 5 W

## Spécifications techniques

| Tension | 5 V |
`
  it('préserve titres (##), sous-titre gras, puces et paragraphe ; coupe aux specs', () => {
    const rich = parseRichDescriptionFromMarkdown(MD)
    expect(rich).toContain('## Le ventilateur de table sans hélice Lifetime Air')
    expect(rich).toContain('**sans pales**')
    expect(rich).toContain('## Caractéristiques principales :')
    expect(rich).toContain('- Marque : Lifetime Air')
    expect(rich).toContain('- Couleur : Noir')
    // Coupé avant les specs
    expect(rich).not.toContain('Spécifications')
    expect(rich).not.toContain('Tension')
  })

  it('convertit <strong> label en sous-titre (ancré sur la prose du moteur PIM)', () => {
    const rich = parseRichDescriptionFromMarkdown(
      '# Produit\n\nCe produit compact et robuste est idéal pour un usage nomade au quotidien.\n\n<strong>Points forts :</strong>\n\n- Léger et compact pour un transport facile\n- Autonomie prolongée\n',
    )
    expect(rich).toContain('## Points forts :')
    expect(rich).toContain('- Léger et compact pour un transport facile')
  })

  it('vide si pas de contenu exploitable', () => {
    expect(parseRichDescriptionFromMarkdown('# Titre seul\n')).toBe('')
  })

  it('PAS de repli glouton : sans prose localisable par le moteur PIM → vide (le rendu retombe sur le plat)', () => {
    // Uniquement un titre + puces, aucun paragraphe → le moteur PIM ne renvoie
    // rien d'exploitable → on renonce à la version structurée (jamais de footer
    // ramassé à l'aveugle).
    expect(parseRichDescriptionFromMarkdown('# Produit\n\n**Points forts :**\n\n- Léger\n- Compact\n')).toBe('')
  })
})

describe('parseRichDescriptionFromMarkdown — bloc login/compte Magento exclu', () => {
  const MD = `# Ventilateur sans hélice noir

## Commander en tant que nouveau client

- Voir le statut de la commande et de l'expédition
- Suivi de la commande
- Commandez plus rapidement

## Commander en utilisant votre compte

Adresse email

Connexion

SKU 1168214

Rafraîchissez votre espace en toute discrétion avec ce ventilateur sans pales silencieux et design, utilisable sans fil.

## Caractéristiques principales :

- Couleur : Noir
- Puissance : 5 W
`
  it('exclut l\'UI compte/commande, garde la vraie description + caractéristiques', () => {
    const rich = parseRichDescriptionFromMarkdown(MD)
    // Boilerplate login exclu
    expect(rich).not.toMatch(/nouveau client|statut de la commande|suivi de la commande|utilisant votre compte|adresse email|^connexion/im)
    expect(rich).not.toContain('Commandez plus rapidement')
    // Vraie description + caractéristiques gardées
    expect(rich).toContain('Rafraîchissez votre espace en toute discrétion')
    expect(rich).toContain('## Caractéristiques principales :')
    expect(rich).toContain('- Couleur : Noir')
  })
})

describe('parseRichDescriptionFromMarkdown — footer société/newsletter écarté (Trafic)', () => {
  const MD = `# Ventilateur sans hélice noir

Plus d'information| Référence Trafic | 1168214 |

- Faites confiance
- Profitez
- Vivez

M'abonner

TRAFINTER (FR) FR08383139458

(Rue Jean Jaures, n°225, 59243 Quarouble, France)

SOGESMA S.A. BE 0866517727

Rafraîchissez votre espace en toute discrétion avec ce ventilateur sans pales silencieux et design, utilisable sans fil et doté d'un éclairage d'ambiance.

## Caractéristiques principales :

- Couleur : Noir
- Puissance : 5 W
`
  it('exclut footer/newsletter/mentions légales, garde la vraie description', () => {
    const rich = parseRichDescriptionFromMarkdown(MD)
    expect(rich).toContain('Rafraîchissez votre espace en toute discrétion')
    expect(rich).toContain('## Caractéristiques principales :')
    expect(rich).not.toMatch(/M['’]abonner|TRAFINTER|SOGESMA|FR08383139458|Faites confiance|Plus d'information/i)
  })
})

describe('parseRichDescriptionFromMarkdown — UI livraison/stock écartée (Trafic)', () => {
  const MD = `# Ventilateur sans hélice noir

Rafraîchissez votre espace en toute discrétion avec ce ventilateur sans pales silencieux et design, utilisable sans fil et doté d'un éclairage d'ambiance.

19 99

En rupture en ligne

Livré à domicile en 2 à 5 jours ouvrés

Livré en magasin en 2 à 5 jours ouvrés

Vérifier le stock du magasin

Restez informé(e) sur le stock

Me tenir informé(e)

Livraison à domicile (19.99€)

## Caractéristiques principales :

- Couleur : Noir
- Puissance : 5 W
`
  it('garde la vraie description, écarte livraison/stock/disponibilité', () => {
    const rich = parseRichDescriptionFromMarkdown(MD)
    expect(rich).toContain('Rafraîchissez votre espace en toute discrétion')
    expect(rich).toContain('## Caractéristiques principales :')
    expect(rich).not.toMatch(/rupture en ligne|livr[eé] à domicile|livr[eé] en magasin|vérifier le stock|tenir informé|livraison à domicile/i)
  })
})
