// src/features/scraping/core/__tests__/parseSpecifications.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSpecsFromMarkdown,
  extractSpecsFromHtml,
  extractCharacteristicsBlobs,
  parseCharacteristicsBlob,
  truncateBeforeNonProductSections,
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
