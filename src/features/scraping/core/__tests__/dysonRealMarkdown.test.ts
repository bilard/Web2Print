/**
 * Test de bout-en-bout avec le markdown RÉEL d'une page Dyson.
 * Vérifie que les parsers extraient correctement la description et les specs
 * sans pollution par la section avis Bazaarvoice.
 */
import { describe, it, expect } from 'vitest'
import { parseDescriptionFromMarkdown } from '../parsers/parseDescription'
import { parseAdvantagesFromMarkdown } from '../parsers/parseAdvantages'
import { parseSpecsFromMarkdown } from '../parsers/parseSpecifications'
import { sanitizeJinaMarkdown } from '@/features/excel/ai-enrichment/markdownSanitize'

// Reproduction MINIMALE du markdown Dyson tel qu'extrait par Jina (POST + GET merged).
// Inclut les éléments problématiques observés en réel :
//  - Section avis Bazaarvoice avec "Sélectionnez une ligne ci-dessous..."
//  - ## Caractéristiques contenant des bullets `* Nom` + valeur ligne suivante
//  - ## Description complète avec features en prose
//  - ## Points forts du produit avec bullets `[![img](url)label](anchor)`
const DYSON_MD = `# Aspirateur robot laveur Dyson Spot+Scrub™ Ai

Vos préférences ont bien été enregistrées.

3.4 stars out of 5 from 602 Avis

Sélectionnez une ligne ci-dessous pour filtrer les avis.

## Description complète

**Détection des taches avec IA avancée.¹**

*   **Robot intelligent : Identification des taches par IA et caméra HD**

Révèle les taches et les poussières dissimulées grâce à un faisceau lumineux.

Inspecte visuellement les surfaces et identifie plus de 190 objets, substances domestiques et taches dissimulées, puis adapte la puissance pour éliminer la saleté.

Grâce à la technologie LiDAR, il cartographie rapidement les pièces pour une navigation plus précise.

## Caractéristiques

*   Temps de charge

3 hrs

*   Durée de fonctionnement

200 min

*   Filtre

La double filtration hygiénique capture les poussières microscopiques aussi petites que 0,1 micron.

*   Contenance du collecteur

3 L

*   Puissance d'aspiration (mode puissant)

18 000 Pa

## Points forts du produit

*   [![Image 83: The Dyson Spot+Scrub Ai robot vacuum detects stains using Ai intelligence.](https://dyson-h.assetsadobe2.com/img1.jpg)Détecte tout type de saleté](https://www.dyson.fr/aspirateurs/robots/spot-scrub-ai/noir#detects)
*   [![Image 84: The Dyson Spot+Scrub Ai robot vacuum cleans a stubborn stain over multiple passes.](https://dyson-h.assetsadobe2.com/img2.jpg)Nettoyage intelligent et précis grâce à l'IA](https://www.dyson.fr/aspirateurs/robots/spot-scrub-ai/noir#eliminates)

## Avis

### Description sommaire de la notation

Sélectionnez une ligne ci-dessous pour filtrer les avis.

### Note générale

3.4

606 avis

### Filtrer les avis

Afficher plus de filtres

Note

Âge

Sexe

Paramètre régional

1 to 8 sur 606 avis.

1 – 8 sur 606 avis

Trier par

Régional

Avis régionaux Affichez une fenêtre contextuelle contenant des informations sur le tri par région.

### Avis régionaux
`

describe('Dyson real markdown — end-to-end', () => {
  it('description : extrait depuis ## Description complète, exclut le texte avis', () => {
    const desc = parseDescriptionFromMarkdown(DYSON_MD)
    console.log('\n[DESC OUTPUT]', JSON.stringify(desc.slice(0, 500)))
    expect(desc).toContain('Révèle les taches')
    expect(desc).not.toContain('Sélectionnez une ligne')
    expect(desc).not.toContain('filtrer les avis')
    expect(desc).not.toContain('Temps de charge')
    expect(desc).not.toContain('3 hrs')
  })

  it('avantages : exclut les noms de specs, exclut les image-links', () => {
    const advs = parseAdvantagesFromMarkdown(DYSON_MD)
    const texts = advs.map(a => a.text)
    console.log('\n[ADVS OUTPUT]', JSON.stringify(texts, null, 2))
    expect(texts.every(t => t !== 'Temps de charge')).toBe(true)
    expect(texts.every(t => t !== 'Durée de fonctionnement')).toBe(true)
    expect(texts.every(t => !t.startsWith('!'))).toBe(true)
    expect(texts.every(t => !t.includes('](http'))).toBe(true)
  })

  it('specs : extrait les bullets Dyson * Nom + valeur ligne suivante', () => {
    const specs = parseSpecsFromMarkdown(DYSON_MD)
    const map: Record<string, string> = {}
    for (const s of specs) map[s.name] = s.value
    console.log('\n[SPECS OUTPUT]', JSON.stringify(map, null, 2))
    expect(map['Temps de charge']).toBe('3 hrs')
    expect(map['Durée de fonctionnement']).toBe('200 min')
    expect(map['Contenance du collecteur']).toBe('3 L')
    expect(map['Puissance d\'aspiration (mode puissant)']).toBe('18 000 Pa')
  })

  it('specs : exclut le contenu de la section avis Bazaarvoice', () => {
    const specs = parseSpecsFromMarkdown(DYSON_MD)
    const groups = specs.map(s => s.group ?? '')
    const names = specs.map(s => s.name)
    console.log('\n[SPECS GROUPS]', JSON.stringify([...new Set(groups)]))
    expect(groups.every(g => g !== 'Filtrer les avis' && g !== 'Note générale' && g !== 'Avis régionaux')).toBe(true)
    expect(names.every(n => n !== 'Régional' && n !== 'Paramètre régional' && n !== 'Âge' && n !== '3.4')).toBe(true)
  })

  it('avantages : collecte les bullets de ## Description complète', () => {
    const advs = parseAdvantagesFromMarkdown(DYSON_MD)
    const texts = advs.map(a => a.text)
    console.log('\n[ADVS RICH]', JSON.stringify(texts, null, 2))
    expect(texts.some(t => t.includes('Robot intelligent'))).toBe(true)
  })

  it('pipeline complet : sanitize → parsers (Dyson full structure)', () => {
    // Markdown qui reproduit la structure Dyson POST + GET merged
    const md = `# Aspirateur robot laveur Dyson Spot+Scrub™ Ai

3.4 stars out of 5 from 602 Avis

## Avis

### Description sommaire de la notation

Sélectionnez une ligne ci-dessous pour filtrer les avis.

### Note générale

3.4

606 avis

### Filtrer les avis

Note
Âge
Sexe

### Avis régionaux

1 to 8 sur 606 avis.

## Description complète

**Détection des taches avec IA avancée.¹**

*   **Robot intelligent : Identification des taches par IA et caméra HD**

Révèle les taches et les poussières dissimulées grâce à un faisceau lumineux.

Inspecte visuellement les surfaces et identifie plus de 190 objets.

*   **Évite les obstacles et s'adapte intelligemment**

Un système d'IA avancé soulève automatiquement le rouleau humide.

**Nettoie sans relâche, jusqu'à disparition des taches tenaces.**

*   **Aspiration Dyson Puissante : 4 fois plus d'aspiration sur les tapis³**

Un moteur de 18 000 Pa capture des particules microscopiques.

## Caractéristiques

*   Temps de charge

3 hrs

*   Durée de fonctionnement

200 min

*   Filtre

La double filtration hygiénique capture les poussières microscopiques aussi petites que 0,1 micron.

*   Contenance du collecteur

3 L

## Avis alimentés par Bazaarvoice

3.4 stars out of 5 from 602 Avis

> Aspirateur robot laveur intelligent.

## Foire aux questions

Comment ça marche ?
`

    // 1) sanitize doit virer les sections avis
    const sanitized = sanitizeJinaMarkdown(md)
    expect(sanitized).not.toContain('Sélectionnez une ligne')
    expect(sanitized).not.toContain('### Filtrer les avis')
    expect(sanitized).not.toContain('### Note générale')
    expect(sanitized).not.toContain('Avis régionaux')
    expect(sanitized).not.toContain('Bazaarvoice')

    // 2) Description = prose de ## Description complète
    const desc = parseDescriptionFromMarkdown(sanitized)
    console.log('\n[PIPELINE DESC]', JSON.stringify(desc.slice(0, 200)))
    expect(desc).toContain('Révèle les taches')
    expect(desc).not.toContain('606 avis')

    // 3) Specs = bullets de ## Caractéristiques
    const specs = parseSpecsFromMarkdown(sanitized)
    const specMap: Record<string, string> = {}
    for (const s of specs) specMap[s.name] = s.value
    console.log('\n[PIPELINE SPECS]', JSON.stringify(specMap, null, 2))
    expect(specMap['Temps de charge']).toBe('3 hrs')
    expect(specMap['Durée de fonctionnement']).toBe('200 min')
    expect(specMap['Contenance du collecteur']).toBe('3 L')
    expect(Object.keys(specMap).length).toBeGreaterThanOrEqual(4)

    // 4) Avantages hiérarchiques
    const advs = parseAdvantagesFromMarkdown(sanitized)
    console.log('\n[PIPELINE ADVS]', JSON.stringify(advs, null, 2))
    const robot = advs.find(a => a.text.startsWith('Robot intelligent'))
    expect(robot).toBeDefined()
    expect(robot!.group).toBe('Détection des taches avec IA avancée.¹')
    expect(robot!.text).toContain('Révèle les taches')
    const aspiration = advs.find(a => a.text.startsWith('Aspiration Dyson'))
    expect(aspiration).toBeDefined()
    expect(aspiration!.group).toContain('Nettoie sans relâche')
  })

  it('specs : ne capture JAMAIS les bullet bold comme specs (= titres de feature)', () => {
    // Cas réel Dyson : un H2 quelconque active inSpecSection (ex: "...performances"
    // matche isSpecGroup), puis on retombe dans `## Description complète` qui ne
    // l'exit pas. Les bullets bold qui suivent NE doivent PAS devenir des specs.
    const md = `# Produit

## La technologie cyclonique Dyson maintient les performances

Vide automatiquement et de manière hygiénique les débris secs.

## Description complète

*   **Connecté à l'application MyDyson™**

L'application vous donne accès à un suivi ultra connecté de votre nettoyage. Des rapports de nettoyage complets avec des cartes thermiques.

*   **Connecté à votre assistant vocal**

Connectez vos produits Dyson à Siri, Alexa et Google Home pour créer une maison intelligente qui s'harmonise avec votre style de vie.

*   **Jusqu'à 110 minutes d'autonomie⁴**

Lorsque sa batterie est faible, le robot retourne à la station d'accueil pour se recharger.

## Caractéristiques

*   Temps de charge

3 hrs

*   Durée de fonctionnement

200 min
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    console.log('\n[NO-FALSE-SPECS]', JSON.stringify(specs, null, 2))

    // Aucun titre de feature ne doit être un nom de spec
    expect(names).not.toContain('Connecté à l\'application MyDyson™')
    expect(names).not.toContain('Connecté à votre assistant vocal')
    expect(names).not.toContain('Jusqu\'à 110 minutes d\'autonomie⁴')

    // Mais les VRAIS specs doivent toujours être là
    expect(names).toContain('Temps de charge')
    expect(names).toContain('Durée de fonctionnement')
  })

  it('specs : dédup par nom pour pages avec comparaisons multi-modèles (RS Components)', () => {
    // Cas réel : pages produit RS Components qui affichent les specs de plusieurs
    // modèles dans le même tableau. On garde uniquement la 1re occurrence de chaque nom.
    const md = `# Tronçonneuse Makita

## Caractéristiques

| Marque | Makita |
| Type de produit | Tronçonneuse |
| Poids | 3.3kg |
| Batterie | 18V |
| Vitesse maximum | 24m/s |
| Niveau sonore | 103.2dBA |
| Série | LXT |
| Poids | 5.1kg |
| Batterie | 36V |
| Vitesse maximum | 20m/s |
| Niveau sonore | 103dBA |
| Poids | 5.4kg |
| Niveau sonore | 87.7dBA |
| Série | XPT |
| Poids | 3.4kg |
| Batterie | 40V |
| Série | UC024G |
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    console.log('\n[RS DEDUP]', JSON.stringify(specs.map(s => `${s.name}=${s.value}`)))

    // Chaque nom apparaît une seule fois
    const uniqueNames = new Set(names)
    expect(names.length).toBe(uniqueNames.size)

    // Premières valeurs sont gardées (= produit principal)
    expect(specs.find(s => s.name === 'Poids')?.value).toBe('3.3kg')
    expect(specs.find(s => s.name === 'Batterie')?.value).toBe('18V')
    expect(specs.find(s => s.name === 'Vitesse maximum')?.value).toBe('24m/s')
    expect(specs.find(s => s.name === 'Niveau sonore')?.value).toBe('103.2dBA')
    expect(specs.find(s => s.name === 'Série')?.value).toBe('LXT')
  })

  it('specs : rejette les bullets `• Texte` capturés par erreur', () => {
    const md = `# Produit

## Caractéristiques

| Marque | Makita |
| • Moteur sans balais pour un fonctionnement sans entretien | • Mode d'amplification du couple |
| Poids | 3.3kg |
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    expect(names).not.toEqual(expect.arrayContaining([expect.stringMatching(/^•/)]))
    expect(names).toContain('Marque')
    expect(names).toContain('Poids')
  })

  it('avantages : préserve la hiérarchie bold heading > bullet bold > prose', () => {
    const md = `# Produit

## Description complète

**Détection des taches avec IA avancée.¹**

*   **Robot intelligent : Identification des taches par IA et caméra HD**

Révèle les taches et les poussières dissimulées grâce à un faisceau lumineux.

Inspecte visuellement les surfaces et identifie plus de 190 objets.

*   **Évite les obstacles et s'adapte intelligemment**

Un système d'IA avancé soulève automatiquement le rouleau humide.

**Nettoie sans relâche, jusqu'à disparition des taches tenaces.**

*   **Aspiration Dyson Puissante : 4 fois plus d'aspiration sur les tapis³**

Un moteur de 18 000 Pa capture des particules microscopiques.

## Caractéristiques

*   Temps de charge

3 hrs
`
    const advs = parseAdvantagesFromMarkdown(md)
    console.log('\n[ADVS HIERARCHY]', JSON.stringify(advs, null, 2))

    // Premier feature de la 1re section : titre + 2 paragraphes prose attachés
    const robot = advs.find(a => a.text.startsWith('Robot intelligent'))
    expect(robot).toBeDefined()
    expect(robot!.group).toBe('Détection des taches avec IA avancée.¹')
    expect(robot!.text).toContain('Révèle les taches')
    expect(robot!.text).toContain('Inspecte visuellement')

    // 2e feature de la 1re section
    const evite = advs.find(a => a.text.startsWith("Évite les obstacles"))
    expect(evite).toBeDefined()
    expect(evite!.group).toBe('Détection des taches avec IA avancée.¹')
    expect(evite!.text).toContain('rouleau humide')

    // Feature de la 2e section : nouveau bold heading = nouveau group
    const aspiration = advs.find(a => a.text.startsWith('Aspiration Dyson'))
    expect(aspiration).toBeDefined()
    expect(aspiration!.group).toBe('Nettoie sans relâche, jusqu\'à disparition des taches tenaces.')
    expect(aspiration!.text).toContain('18 000 Pa')

    // Pas d'avantages dupliqués pour le titre seul
    expect(advs.filter(a => a.text === 'Robot intelligent : Identification des taches par IA et caméra HD').length).toBeLessThanOrEqual(1)
  })

  it('specs : Format 3 rejette les phrases prose contenant `:` (Jardiland)', () => {
    const md = `# Produit

## Caractéristiques

| Marque | Makita |
| Poids | 3.3kg |

Optimisez la croissance de vos plantes : la serre Mythos maintient une température idéale.

serre de jardin en polycarbonate : double paroi Mythos de 2,3 m².
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    expect(names).toContain('Marque')
    expect(names).toContain('Poids')
    // Phrases prose ne doivent JAMAIS devenir des specs via Format 3
    expect(names).not.toContain('Optimisez la croissance de vos plantes')
    expect(names).not.toContain('serre de jardin en polycarbonate')
  })

  it('specs : rejette les valeurs commençant par bullet markdown `- ...`', () => {
    const md = `# Produit

## Caractéristiques

| Avantages produits | - Pratiquement incassable, la |
| Poids | 3.3kg |
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    expect(names).not.toContain('Avantages produits')
    expect(names).toContain('Poids')
  })

  it('specs : rejette les noms qui sont des headings de section', () => {
    const md = `# Produit

## Caractéristiques

| Caractéristiques techniques | - Dimensions ext. hors tout |
| Description | Texte long |
| Marque | Makita |
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map(s => s.name)
    expect(names).not.toContain('Caractéristiques techniques')
    expect(names).not.toContain('Description')
    expect(names).toContain('Marque')
  })
})
