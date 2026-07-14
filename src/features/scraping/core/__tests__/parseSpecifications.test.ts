// src/features/scraping/core/__tests__/parseSpecifications.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSpecsFromMarkdown,
  extractSpecsFromHtml,
  extractCharacteristicsBlobs,
  parseCharacteristicsBlob,
  truncateBeforeNonProductSections,
  isSaneSpecPair,
} from '../parsers/parseSpecifications'

const MD_TABLE = `## Caractéristiques techniques

| Caractéristique | Valeur |
|---|---|
| Tension | 18 V |
| Couple maxi | 60 Nm |
| Poids | 1.5 kg |
`

const MD_GROUPED = `## Moteur

| Tension | 18 V |
| Puissance | 500 W |

## Batterie

| Capacité | 4 Ah |
| Type | Li-Ion |
`

const MD_INLINE = `## Spécifications

Tension : 18 V
Couple maxi : 60 Nm
Poids : 1.5 kg
`

describe('parseSpecsFromMarkdown', () => {
  it('parse une table simple', () => {
    const specs = parseSpecsFromMarkdown(MD_TABLE)
    expect(specs).toHaveLength(3)
    expect(specs[0]).toEqual({
      name: 'Tension',
      value: '18 V',
      group: expect.stringContaining('Caractéristiques'),
    })
  })

  it('respecte les groupes quand sections multiples', () => {
    const specs = parseSpecsFromMarkdown(MD_GROUPED)
    const tensionSpec = specs.find(s => s.name === 'Tension')
    const capSpec = specs.find(s => s.name === 'Capacité')
    expect(tensionSpec?.group).toMatch(/Moteur/i)
    expect(capSpec?.group).toMatch(/Batterie/i)
  })

  it('parse des paires inline (Clé : valeur)', () => {
    const specs = parseSpecsFromMarkdown(MD_INLINE)
    expect(specs).toHaveLength(3)
    expect(specs.find(s => s.name === 'Tension')?.value).toBe('18 V')
  })

  it('renvoie tableau vide si pas de specs', () => {
    expect(parseSpecsFromMarkdown('# Produit\n\nDescription')).toEqual([])
  })

  it('rejette les lignes d\'en-tête de table dupliquées (Valeur, *Valeur*, Caractéristique)', () => {
    const md = `## Caractéristiques techniques

| Caractéristique | Valeur |
|---|---|
| [Fiche technique Accessoires] | *Valeur* |
| Tension | 18 V |
| Property | _Valeur_ |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ name: 'Tension', value: '18 V' })
    // Les en-têtes parasites doivent être absents
    expect(specs.find(s => /^\*?valeur\*?$/i.test(s.value))).toBeUndefined()
    expect(specs.find(s => /^\[.+\]$/.test(s.name))).toBeUndefined()
  })
})

describe('extractSpecsFromHtml', () => {
  it('extrait depuis un <table> orphelin avec ≥2 lignes de specs', () => {
    const html = `<table>
      <tr><th>Tension</th><td>18 V</td></tr>
      <tr><th>Couple maxi</th><td>60 Nm</td></tr>
    </table>`
    const md = extractSpecsFromHtml(html)
    expect(md).not.toBeNull()
    expect(md).toContain('Tension')
    expect(md).toContain('18 V')
    expect(md).toContain('Couple maxi')
  })

  it('renvoie null si pas de table exploitable', () => {
    expect(extractSpecsFromHtml('<div>nothing here</div>')).toBeNull()
  })

  it('extrait depuis JSON-LD additionalProperty', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Perceuse 18V',
      additionalProperty: [
        { name: 'Tension', value: '18', unitText: 'V' },
        { name: 'Poids', value: '1.5', unitText: 'kg' },
      ],
    })}</script>`
    const md = extractSpecsFromHtml(html)
    expect(md).toContain('Tension')
    expect(md).toContain('18 V')
    expect(md).toContain('Poids')
  })
})

describe('extractCharacteristicsBlobs', () => {
  it('extrait un blob "Caractéristiques ... Voir moins"', () => {
    const md = 'Texte avant Caractéristiques Tension : 18 V Couple : 60 Nm Voir moins texte après'
    const blobs = extractCharacteristicsBlobs(md)
    expect(blobs).toHaveLength(1)
    expect(blobs[0]).toContain('Tension : 18 V')
  })

  it('renvoie tableau vide si aucun blob', () => {
    expect(extractCharacteristicsBlobs('Texte sans le pattern')).toEqual([])
  })
})

describe('parseCharacteristicsBlob', () => {
  // Le regex repère la frontière de la prochaine clé via une majuscule initiale,
  // donc les valeurs doivent rester en lowercase pour ne pas être tronquées.
  it('parse un blob inline en paires', () => {
    const result = parseCharacteristicsBlob('Couleur : rouge Matière : plastique Poids : 1.5kg')
    expect(result['Couleur']).toBe('rouge')
    expect(result['Matière']).toBe('plastique')
    expect(result['Poids']).toBe('1.5kg')
  })

  it('filtre les clés contenant "tarif" ou "prix"', () => {
    const result = parseCharacteristicsBlob('Couleur : rouge Prix : 200€')
    expect(result['Couleur']).toBe('rouge')
    expect(result['Prix']).toBeUndefined()
  })
})

// ─── Format 5 : bullet inline (Rubix-style) ──────────────────────────────────

describe('parseSpecsFromMarkdown — Format 5 bullet inline', () => {
  const MD_BULLET_INLINE = `## Spécifications

• Capacité de la batterie : 4 Ah
• Puissance de frappe : 1,9 J
• Diamètre de perçage optimal dans le béton : 4 - 12 mm
• Couronne TCT max. : 54 mm
• Vitesse à vide : 0 - 1100 tr/min
• Fréquence de frappe : 0 - 4000 cps/min
• Dimensions (L x l x H) : 358 x 84 x 259 mm
• Niveau sonore (puissance) : 99 dB(A)
`

  it('parse les bullets typographiques `• Nom : Valeur` (Rubix)', () => {
    const specs = parseSpecsFromMarkdown(MD_BULLET_INLINE)
    expect(specs.length).toBeGreaterThanOrEqual(7)
    expect(specs.find((s) => s.name === 'Capacité de la batterie')?.value).toBe('4 Ah')
    expect(specs.find((s) => s.name === 'Puissance de frappe')?.value).toBe('1,9 J')
    expect(specs.find((s) => s.name === 'Vitesse à vide')?.value).toBe('0 - 1100 tr/min')
    expect(specs.find((s) => s.name === 'Niveau sonore (puissance)')?.value).toBe('99 dB(A)')
  })

  it('accepte les variantes de bullets (·, ▪, ●, ◦, ▶)', () => {
    const md = `## Caractéristiques

· Tension : 18 V
▪ Poids : 3,5 kg
● Capacité : 4 Ah
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Poids')?.value).toBe('3,5 kg')
    expect(specs.find((s) => s.name === 'Capacité')?.value).toBe('4 Ah')
  })

  it("ne capture PAS les bullets hors section spec (description marketing)", () => {
    const md = `## Description

• Découvrez notre produit
• Optimisé pour les professionnels

## Spécifications

• Tension : 18 V
`
    const specs = parseSpecsFromMarkdown(md)
    // Les 2 premiers bullets ne sont pas en spec section → ne doivent pas être capturés
    expect(specs.find((s) => s.name === 'Découvrez notre produit')).toBeUndefined()
    expect(specs.find((s) => s.value === 'Optimisé pour les professionnels')).toBeUndefined()
    // Mais le bullet en spec section doit l'être
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
  })

  it("rejette les bullets dont le nom commence par un article (faux positifs prose)", () => {
    const md = `## Spécifications

• La tension du moteur : variable
• Une fonctionnalité unique : disponible
`
    const specs = parseSpecsFromMarkdown(md)
    // looksLikeSpecName rejette les noms commençant par article
    expect(specs.find((s) => /^La tension/.test(s.name))).toBeUndefined()
    expect(specs.find((s) => /^Une fonctionnalité/.test(s.name))).toBeUndefined()
  })

  it('détecte une section spec avec heading bold sans #', () => {
    const md = `**Spécifications :**

• Tension : 18 V
• Poids : 3,5 kg
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Poids')?.value).toBe('3,5 kg')
  })

  it('détecte une section spec avec heading plain text "Spécifications :"', () => {
    const md = `Spécifications :

• Capacité de la batterie : 4 Ah
• Puissance de frappe : 1,9 J
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Capacité de la batterie')?.value).toBe('4 Ah')
    expect(specs.find((s) => s.name === 'Puissance de frappe')?.value).toBe('1,9 J')
  })

  it('détecte la section "Normes :" et capture les codes (EN60745, 2014/30/UE)', () => {
    const md = `Normes :

Le perfo-burineur DHR202RMJ est conforme aux directives :
• 2014/30/UE : Compatibilité électromagnétique
• EN60745-1+A11 : Exigences générales pour les outils électroportatifs
• EN60745-2-6 : Exigences particulières pour les marteaux perforateurs
• EN50581 : Documentation pour la conformité RoHS
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === '2014/30/UE')?.value).toBe('Compatibilité électromagnétique')
    expect(specs.find((s) => s.name === 'EN60745-1+A11')?.value).toContain('Exigences générales')
    expect(specs.find((s) => s.name === 'EN60745-2-6')?.value).toContain('marteaux perforateurs')
    expect(specs.find((s) => s.name === 'EN50581')?.value).toContain('RoHS')
  })

  it('détecte la section "Directives européennes :" en plain text', () => {
    const md = `Directives européennes :

• 2011/65/UE : Directive RoHS
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === '2011/65/UE')?.value).toBe('Directive RoHS')
  })
})

// ─── Swap auto pour tables inversées (Rubix, Würth) ──────────────────────────

describe('parseSpecsFromMarkdown — heuristique anti-inversion', () => {
  it('swap value/name quand le site rend value à GAUCHE et label à DROITE', () => {
    // Rubix-style : la table HTML met les VALEURS dans la 1ère colonne et les
    // NOMS dans la 2ème — le parser table capture `| 18 V | Tension |` mais le
    // bon ordre est `name=Tension, value=18 V`.
    const md = `## Spécifications

| 18 V | Tension |
| 3,5 kg | Poids |
| 4 Ah | Capacité de la batterie |
| 20 mm | Capacité de perçage béton |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Poids')?.value).toBe('3,5 kg')
    expect(specs.find((s) => s.name === 'Capacité de la batterie')?.value).toBe('4 Ah')
    expect(specs.find((s) => s.name === 'Capacité de perçage béton')?.value).toBe('20 mm')
  })

  it('ne swap PAS quand l\'ordre est correct', () => {
    const md = `## Spécifications

| Tension | 18 V |
| Poids | 3,5 kg |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Poids')?.value).toBe('3,5 kg')
    // Ne doit PAS contenir l'inverse
    expect(specs.find((s) => s.name === '18 V')).toBeUndefined()
  })

  it('swap pour les valeurs Oui/Non', () => {
    const md = `## Spécifications

| Oui | Sans fil |
| Non | Filaire |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Sans fil')?.value).toBe('Oui')
  })

  it("ne swap PAS quand les deux côtés sont alphabétiques (cas ambigu)", () => {
    // Pas de swap : les deux sont des labels, le parser garde l'ordre original
    const md = `## Spécifications

| Type | Lithium-Ion |
| Couleur | Bleu |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Type')?.value).toBe('Lithium-Ion')
    expect(specs.find((s) => s.name === 'Couleur')?.value).toBe('Bleu')
  })
})

// ─── Cascade Format 4 (Rubix-like alternating) ───────────────────────────────

describe('parseSpecsFromMarkdown — cascade shift (Rubix INFORMATIONS TECHNIQUES)', () => {
  it('ne crée PAS de cascade shift quand un name suit un autre name', () => {
    // Source : "Attributs" header puis lignes alternées value-name (Rubix-style)
    const md = `## Spécifications

Attributs
Tension
18 V
Poids
3,5 kg
Capacité de perçage béton
20 mm
Sans fil
Oui
`
    const specs = parseSpecsFromMarkdown(md)
    // "Attributs" doit être REJETÉ comme placeholder header (pas de pair avec Tension)
    expect(specs.find((s) => s.name === 'Attributs')).toBeUndefined()
    // Et Tension doit être correctement appairé avec 18 V
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Poids')?.value).toBe('3,5 kg')
    expect(specs.find((s) => s.name === 'Capacité de perçage béton')?.value).toBe('20 mm')
    expect(specs.find((s) => s.name === 'Sans fil')?.value).toBe('Oui')
  })

  it('rejette les specs purement numériques + value pure unité (€ HT junk)', () => {
    const md = `## Spécifications

Tension
18 V
414,20
€ HT
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    // 414,20 = € HT est rejeté (name purement numérique + value pure unité)
    expect(specs.find((s) => s.name === '414,20')).toBeUndefined()
  })

  it('rejette le placeholder "Attributs" même seul', () => {
    const md = `## Spécifications

| Attributs | Valeur |
| Tension | 18 V |
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Attributs')).toBeUndefined()
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
  })
})

describe('truncateBeforeNonProductSections', () => {
  it('tronque avant la section "Documents"', () => {
    const md = '# Produit\n\nContenu produit\n\n## Documents\n\nDoc1.pdf'
    const result = truncateBeforeNonProductSections(md)
    expect(result).toContain('Contenu produit')
    expect(result).not.toContain('Documents')
    expect(result).not.toContain('Doc1.pdf')
  })

  it('tronque avant "Produits associés"', () => {
    const md = '# Produit\n\n## Spécifications\n\nTension : 18V\n\n## Produits associés\n\nAutre'
    const result = truncateBeforeNonProductSections(md)
    expect(result).toContain('Tension')
    expect(result).not.toContain('Produits associés')
  })

  it('renvoie le markdown complet si aucune section à tronquer', () => {
    const md = '# Produit\n\n## Spécifications\n\nTension : 18V'
    expect(truncateBeforeNonProductSections(md)).toBe(md)
  })
})

describe('Format 6 — bullets à colonnes multi-espaces (PAM CMS / Makita)', () => {
  const MAKITA_MD = `# DDA351RTJ - Perceuse visseuse d'angle LXT®

## Spécifications techniques

*    Énergie  18 V  
*    Composant batterie  Li-ion   
*    Vitesse à vide max  0 - 1800 min⁻¹  
*    Capacité du mandrin  1,5 - 10 mm  
*    Niveau de vibration, perçage dans métal  ≤ 2,5 m/s² Décrit les vibrations de la machine. La vibration est dirigée vers l'opérateur.  
*    Poids net du produit  1,1 kg  
`
  it('extrait les paires nom/valeur séparées par ≥ 2 espaces', () => {
    const specs = parseSpecsFromMarkdown(MAKITA_MD)
    expect(specs.find((s) => s.name === 'Énergie')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Composant batterie')?.value).toBe('Li-ion')
    expect(specs.find((s) => s.name === 'Capacité du mandrin')?.value).toBe('1,5 - 10 mm')
    expect(specs.find((s) => s.name === 'Poids net du produit')?.value).toBe('1,1 kg')
  })

  it('tronque la prose explicative collée à la valeur', () => {
    const specs = parseSpecsFromMarkdown(MAKITA_MD)
    expect(specs.find((s) => s.name.startsWith('Niveau de vibration'))?.value).toBe('≤ 2,5 m/s²')
  })

  it('ignore les sections bannière cookies (Strictement nécessaire, Statistique…)', () => {
    const md = `## Spécifications

Tension : 18 V

### Strictement nécessaire

*    Finalité  Prend en charge les fonctions techniques du site.  
*    Expiration  un an  

### Statistique

*    Fournisseur  .makita.fr  
`
    const specs = parseSpecsFromMarkdown(md)
    expect(specs.find((s) => s.name === 'Tension')?.value).toBe('18 V')
    expect(specs.find((s) => s.name === 'Finalité')).toBeUndefined()
    expect(specs.find((s) => s.name === 'Fournisseur')).toBeUndefined()
  })
})

// Extrait RÉEL Castorama (2026-07-11) : bullets markdown `*   Nom : Valeur`
// capturés par Format 3 — le marqueur de liste restait dans le nom
// (« *   Surface intérieure »).
describe('parseSpecsFromMarkdown — bullets markdown « Nom : Valeur » (Castorama)', () => {
  it('nettoie le marqueur de liste en tête de nom', () => {
    const md = `# Abri

### Informations sur le produit

*   Surface intérieure : 4,04 m²
*   Garantie : 10 ans
`
    const specs = parseSpecsFromMarkdown(md)
    const names = specs.map((s) => s.name)
    expect(names).toContain('Surface intérieure')
    expect(names).toContain('Garantie')
    expect(names.every((n) => !n.startsWith('*'))).toBe(true)
  })
})

// Paires RÉELLES issues d'une fiche Démo express sur trafic.com (Magento +
// Amasty, 2026-07-13) : le footer (store locator, newsletter, moyens de
// paiement, adresses, mentions légales) traversait l'extraction LLM et
// atterrissait dans le tableau « Caractéristiques » de la fiche.
describe('isSaneSpecPair — footer/contact/commerce (fixture Trafic)', () => {
  const JUNK: Array<[string, string]> = [
    ['Code postal ou ville', 'Rayon de recherche , km'],
    ['France', 'paiements par Maestro, VISA, MASTERCARD et espèces.'],
    ['Luxembourg', 'paiements par Maestro, VISA, MASTERCARD et espèces'],
    ['Service de Médiation pour le Consommateur', 'Boulevard du Roi Albert II 8'],
    ['Fax', '02 808 71 29'],
    ['TRAFINTER (FR) FR08383139458', '(Rue Jean Jaures, n°225, 59243 Quarouble, France)'],
    ['Inscrivez-vous pour recevoir nos infos', "M'abonner"],
    ['Accès rapide', 'Trafic'],
    ['a proximité', 'Nos magasins'],
    ['6220 Heppignies', 'Via ce formulaire :'],
    ['1000 Bruxelles', 'Tél. : 02 702 52 20'],
    ['SOGESMA S.A.', 'Rue de Capilône, n°6'],
  ]
  it.each(JUNK)('tue « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(false)
  })

  // Garde-fou : les vraies specs (dont celles de la même fiche) passent toujours.
  const GOOD: Array<[string, string]> = [
    ['Couleur', 'Noir'],
    ['Alimentation', '5V / 1A via USB-C'],
    ['Poids', '20.5 kg'],
    ['Volume maximum', '3800'],
    ['Matériau de la paroi', 'PVC'],
    ['Vitesse à vide', '0 - 1 000 000 tr/min'],
    ['Capacité de perçage béton', '32 mm'],
    ['Norme', 'EN 60745'],
  ]
  it.each(GOOD)('garde « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(true)
  })
})

// Fixture RÉELLE trafic.com (Magento + Amasty, 2026-07-13) : le scrape POST
// « tout déplié » (X-Engine: browser + injectPageScript) ouvre l'overlay de
// recherche, le store locator et les accordéons footer/CGV. Le markdown qui en
// sort contient des headings hors-produit (« ASSURANCES », « **14. Code de
// conduite et traitement des plaintes** ») qui ouvraient le spec-mode
// (isUpperCaseShort) et faisaient apparier les lignes suivantes (Format 4)
// en fausses specs : « ventilateurs == climatiseurs », adresses de Bruxelles…
describe('parseSpecsFromMarkdown — sections hors-produit (fixture Trafic « tout déplié »)', () => {
  const MD = `# Ventilateur Sans Hélice Noir

## Caractéristiques techniques

| Puissance | 5 W |
| Couleur | Noir |
| Alimentation | 5V / 1A via USB-C |

## ASSURANCES

Search

Submit Close

ventilateurs

climatiseurs

piscines tubulaires

ventilateur

parasol

spas gonflables

jacuzzi

parasols

tables de jardin

Produits recommandés

Trouver sur carte

Veuillez fournir un code postal ou autoriser le navigateur à partager votre position.

**14. Code de conduite et traitement des plaintes**

Boulevard du Roi Albert II 8

1000 Bruxelles

Rue de Capilône, n°6

6220 Heppignies
`

  it('garde les vraies specs de la fiche', () => {
    const specs = parseSpecsFromMarkdown(MD)
    const names = specs.map((s) => s.name)
    expect(names).toContain('Puissance')
    expect(names).toContain('Couleur')
    expect(names).toContain('Alimentation')
  })

  it('n’apparie RIEN sous un heading hors-produit (recherche, magasins, CGV)', () => {
    const specs = parseSpecsFromMarkdown(MD)
    const all = specs.map((s) => `${s.name}=${s.value}`).join(' | ')
    expect(all).not.toMatch(/ventilateurs=|piscines tubulaires|Trouver sur carte|Submit|Boulevard du Roi Albert|Rue de Capilône|Bruxelles|Heppignies|Produits recommandés/i)
  })

  it('aucun groupe hors-produit ne subsiste (ASSURANCES, CGV numérotée)', () => {
    const specs = parseSpecsFromMarkdown(MD)
    const groups = new Set(specs.map((s) => s.group ?? ''))
    expect([...groups].join(' ')).not.toMatch(/assurances|code de conduite/i)
  })
})

// Paires réelles des captures utilisateur (fiche Trafic polluée) qui passaient
// encore isSaneSpecPair après le durcissement footer du 2026-07-13.
describe('isSaneSpecPair — overlay recherche / store locator / adresses en NOM', () => {
  const JUNK: Array<[string, string]> = [
    ['Search', 'Submit Close'],
    ['Trouver sur carte', 'Veuillez fournir un code postal ou autoriser le navigateur à partager votre position.'],
    ['tables de jardin', 'Produits recommandés'],
    ['Boulevard du Roi Albert II 8', '1000 Bruxelles'],
    ['Rue de Capilône, n°6', '6220 Heppignies'],
    ['Retrait gratuit en magasin', 'Livraison à domicile (19.99€)'],
    ['Restez informé(e) sur le stock', 'Me tenir informé(e)'],
  ]
  it.each(JUNK)('tue « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(false)
  })

  // Les vraies specs — dont des cas proches des patterns tués — passent toujours.
  const GOOD: Array<[string, string]> = [
    ['Puissance', '5 W'],
    ['Alimentation', '5V / 1A via USB-C'],
    ['Éclairage', 'Lumière d’ambiance LED intégrée'],
    ['Dimensions', '124 × 90 × 300 mm'],
    ['Niveau sonore', '50 dB'],
  ]
  it.each(GOOD)('garde « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(true)
  })
})

// Le balayage DOM (accordéons larges [class*="accordion"], tables orphelines,
// dl) ne doit JAMAIS lire dans les régions structurelles hors-produit :
// header/nav/footer/overlay de recherche/store locator. Signal par STRUCTURE
// (élément/role/token de classe), jamais par site.
describe('extractSpecsFromHtml — régions hors-produit exclues', () => {
  const HTML = `
    <header><div class="accordion-content"><ul>
      <li>ventilateurs : climatiseurs</li>
    </ul></div></header>
    <div id="search_autocomplete"><ul><li>piscines tubulaires : parasols</li></ul></div>
    <main><div class="product-specs"><table>
      <tr><td>Puissance</td><td>5 W</td></tr>
      <tr><td>Couleur</td><td>Noir</td></tr>
    </table></div></main>
    <footer><div class="accordion-content">
      <table>
        <tr><td>Boulevard du Roi Albert II 8</td><td>1000 Bruxelles</td></tr>
        <tr><td>Rue de Capilône, n°6</td><td>6220 Heppignies</td></tr>
      </table>
    </div></footer>`

  it('garde les specs de la zone produit, ignore header/footer/recherche', () => {
    const md = extractSpecsFromHtml(HTML)
    expect(md).not.toBeNull()
    expect(md).toContain('Puissance')
    expect(md).toContain('Couleur')
    expect(md).not.toContain('Bruxelles')
    expect(md).not.toContain('Heppignies')
    expect(md).not.toContain('climatiseurs')
    expect(md).not.toContain('piscines tubulaires')
  })

  it('garde-fou : sans région bruitée, comportement inchangé', () => {
    const md = extractSpecsFromHtml('<table><tr><th>Tension</th><td>18 V</td></tr><tr><th>Couple maxi</th><td>60 Nm</td></tr></table>')
    expect(md).toContain('Tension')
    expect(md).toContain('Couple maxi')
  })
})

// Paires réelles screwfix.fr (2026-07-13) : les AVIS CLIENTS (titre + commentaire)
// passaient en « specs » — « achat tondeuse a gazon == Délai très court trè bon
// rapport qualité/prix », « Super == Très bonne tondeuse », « Tondeuse == Moteur
// puissant !!! ». Signal par vocabulaire d'OPINION (jamais par site).
describe('isSaneSpecPair — avis clients en paires (fixture Screwfix)', () => {
  const JUNK: Array<[string, string]> = [
    ['achat tondeuse a gazon', 'Délai très court trè bon rapport qualité/prix'],
    ['Super', 'Très bonne tondeuse'],
    ['Tondeuse', 'Moteur puissant !!!'],
    ['Génial', 'Je recommande ce produit'],
  ]
  it.each(JUNK)('tue « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(false)
  })
  // Les vraies specs de la MÊME fiche passent (y compris avec adjectifs).
  const GOOD: Array<[string, string]> = [
    ['Largeur de coupe', '53 cm'],
    ['Cylindrée (cm³ / cc)', '224 cc'],
    ['Huile moteur recommandée', 'Huile SAE 10W30 ou SAE 10W40 requise'],
    ['Niveau de bruit (Db)', '84,1 dBA'],
    ['Type de traction', 'Autotractée'],
    ['Garantie du fabricant', 'Garantie fabricant de 10 ans (enregistrement requis)'],
  ]
  it.each(GOOD)('garde « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(true)
  })
})

// Paires réelles trafic.com (2026-07-14, fiche 221919 via Démo express) : le bloc
// COMMANDE/COMPTE CLIENT du checkout passait en « specs » — « Commander en tant
// que nouveau client == La création d'un compte possède de nombreux avantages : »,
// « gratuit == en magasin », « Commander en utilisant votre compte == Adresse
// email ». Signal par vocabulaire de COMPTE/CHECKOUT (jamais par site).
describe('isSaneSpecPair — bloc commande/compte client (fixture Trafic 221919)', () => {
  const JUNK: Array<[string, string]> = [
    ['Commander en tant que nouveau client', "La création d'un compte possède de nombreux avantages :"],
    ['Commander en utilisant votre compte', 'Adresse email'],
    ['gratuit', 'en magasin'],
    ['Se connecter', 'Mot de passe'],
    ['Create an account', 'Sign in'],
    // Clauses CGV numérotées + footer (même fiche 221919) :
    ['9.1 Piles et accumulateurs', 'Identifiant unique (IDU) pour la filière piles et accumulateurs COREPILE: FR001981_066STI'],
    ['18.2 Aire géographique', 'La vente en ligne des produits et services présentés dans le site est réservée aux acheteurs qui résident en Belgique'],
    ['Trafic', 'Service clients'],
  ]
  it.each(JUNK)('tue « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(false)
  })
  // Les vraies specs de la MÊME fiche passent.
  const GOOD: Array<[string, string]> = [
    ['Couleur', 'Noir'],
    ['Puissance', '5 W'],
    ['Alimentation', '5V / 1A via USB-C'],
    ['Utilisation', 'Sans fil (rechargeable)'],
    ['Référence Trafic', '221919'],
    ['Commande', 'Électronique'],
  ]
  it.each(GOOD)('garde « %s == %s »', (n, v) => {
    expect(isSaneSpecPair(n, v)).toBe(true)
  })
})
