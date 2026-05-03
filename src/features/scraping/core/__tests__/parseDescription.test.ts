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
