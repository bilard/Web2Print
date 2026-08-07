import { describe, it, expect } from 'vitest'
import { pickDisplayColumns, taxoPathOf, trimDescription, DESCRIPTION_MAX } from './displayColumns'

const H = (...keys: string[]) => keys.map((key) => ({ key }))

describe('pickDisplayColumns', () => {
  it('reconnaît les en-têtes du catalogue F1', () => {
    const d = pickDisplayColumns(H('CODE_ARTICLE', 'DESCRIPTIF', 'PATH_PHOTO', 'FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'))
    expect(d).toEqual({
      description: 'DESCRIPTIF', image: 'PATH_PHOTO',
      taxo: ['FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'],
    })
  })

  it('ne confond pas famille et sous-famille, quel que soit l’ordre des colonnes', () => {
    expect(pickDisplayColumns(H('WEBGROUP_DESC', 'FAMILLE')).taxo).toEqual(['FAMILLE', 'WEBGROUP_DESC'])
  })

  it('n’attribue jamais deux niveaux à la même colonne', () => {
    const taxo = pickDisplayColumns(H('Famille')).taxo
    expect(taxo).toEqual(['Famille'])
  })

  it('respecte la colonne de description configurée dans le node', () => {
    const cols = H('DESCRIPTIF', 'COMMENTAIRE')
    expect(pickDisplayColumns(cols, { description: 'COMMENTAIRE' }).description).toBe('COMMENTAIRE')
    // Une configuration qui pointe dans le vide ne bloque pas le devinage.
    expect(pickDisplayColumns(cols, { description: 'ABSENTE' }).description).toBe('DESCRIPTIF')
  })

  it('cherche aussi dans le LIBELLÉ de colonne, pas seulement dans la clé', () => {
    const d = pickDisplayColumns([{ key: 'C1', label: 'Visuel produit' }, { key: 'C2', label: 'Famille' }])
    expect(d.image).toBe('C1')
    expect(d.taxo).toEqual(['C2'])
  })

  it('ne renvoie rien plutôt que d’inventer sur une feuille sans ces colonnes', () => {
    expect(pickDisplayColumns(H('REF', 'PRIX'))).toEqual({ taxo: [] })
  })
})

describe('taxonomie à quatre niveaux (catalogue F1 2026)', () => {
  it('reconnaît UNIVERS, FAMILLE, SOUS FAMILLE et PRODUCTGROUP, du plus large au plus fin', () => {
    // La feuille les donne dans un autre ordre : c'est la HIÉRARCHIE qui compte, pas la
    // position de la colonne dans le fichier.
    const taxo = pickDisplayColumns(H('ARTICLECODE', 'UNIVERS', 'FAMILLE', 'PRODUCTGROUP', 'SOUS FAMILLE')).taxo
    expect(taxo).toEqual(['UNIVERS', 'FAMILLE', 'SOUS FAMILLE', 'PRODUCTGROUP'])
  })

  it('ne capte pas « SOUS FAMILLE » comme famille quand FAMILLE est absente', () => {
    expect(pickDisplayColumns(H('SOUS FAMILLE', 'PRODUCTGROUP')).taxo).toEqual(['SOUS FAMILLE', 'PRODUCTGROUP'])
  })

  it('garde l’ancienne feuille inchangée (non-régression)', () => {
    expect(pickDisplayColumns(H('FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP')).taxo)
      .toEqual(['FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'])
  })
})

describe('ordre déduit des DONNÉES', () => {
  // Un dictionnaire ne peut pas savoir si « PRODUCTGROUP » est au-dessus ou au-dessous de
  // « SOUS FAMILLE » : cela dépend de l'ERP. Les données, elles, le disent — un niveau
  // large a moins de valeurs distinctes que le niveau qu'il contient.
  const rows = [
    { U: 'Jardin', F: 'Tonte', G: 'Courroie A', S: 'Courroies' },
    { U: 'Jardin', F: 'Tonte', G: 'Courroie B', S: 'Courroies' },
    { U: 'Jardin', F: 'Taille', G: 'Lame X', S: 'Lames' },
    { U: 'Jardin', F: 'Taille', G: 'Lame Y', S: 'Lames' },
  ]
  const cols = [{ key: 'U', label: 'UNIVERS' }, { key: 'F', label: 'FAMILLE' }, { key: 'G', label: 'PRODUCTGROUP' }, { key: 'S', label: 'SOUS FAMILLE' }]

  it('classe du plus large au plus fin d’après le nombre de valeurs distinctes', () => {
    expect(pickDisplayColumns(cols, {}, rows).taxo).toEqual(['U', 'F', 'S', 'G'])
  })

  it('écarte un niveau vide sur toute la feuille plutôt que de couper les chemins', () => {
    const withEmpty = rows.map((r) => ({ ...r, U: '' }))
    expect(pickDisplayColumns(cols, {}, withEmpty).taxo).toEqual(['F', 'S', 'G'])
  })

  it('écarte un niveau de tête renseigné sur une MINORITÉ de lignes', () => {
    // `taxoPathOf` s'arrête au premier niveau vide : garder une colonne à moitié remplie
    // enverrait l'autre moitié du catalogue en « non classé ».
    const sparse = rows.map((r, i) => ({ ...r, U: i === 0 ? 'Jardin' : '' }))
    expect(pickDisplayColumns(cols, {}, sparse).taxo).toEqual(['F', 'S', 'G'])
  })
})

describe('taxonomie SAISIE dans le node', () => {
  const cols = H('UNIVERS', 'FAMILLE', 'PRODUCTGROUP', 'SOUS FAMILLE')

  it('fait foi, dans l’ordre saisi, sans rien deviner', () => {
    const taxo = pickDisplayColumns(cols, { taxo: 'UNIVERS > FAMILLE > PRODUCTGROUP > SOUS FAMILLE' }).taxo
    expect(taxo).toEqual(['UNIVERS', 'FAMILLE', 'PRODUCTGROUP', 'SOUS FAMILLE'])
  })

  it('accepte les séparateurs usuels et tolère casse et accents', () => {
    expect(pickDisplayColumns(cols, { taxo: 'univers | famille' }).taxo).toEqual(['UNIVERS', 'FAMILLE'])
    expect(pickDisplayColumns(cols, { taxo: 'UNIVERS, sous-famille' }).taxo).toEqual(['UNIVERS', 'SOUS FAMILLE'])
  })

  it('ignore un nom qui ne désigne aucune colonne, sans jeter les autres', () => {
    expect(pickDisplayColumns(cols, { taxo: 'ABSENTE > FAMILLE' }).taxo).toEqual(['FAMILLE'])
  })

  it('retombe sur la détection quand la saisie ne désigne RIEN', () => {
    expect(pickDisplayColumns(cols, { taxo: 'ABSENTE > INTROUVABLE' }).taxo)
      .toEqual(['UNIVERS', 'FAMILLE', 'SOUS FAMILLE', 'PRODUCTGROUP'])
  })
})

describe('taxoPathOf', () => {
  it('s’arrête au premier niveau vide', () => {
    const row = { A: 'Motoculture', B: '', C: 'Courroies' }
    expect(taxoPathOf(row, ['A', 'B', 'C'])).toEqual(['Motoculture'])
  })
  it('ignore les espaces et les cellules absentes', () => {
    expect(taxoPathOf({ A: '  Jardin  ' }, ['A', 'B'])).toEqual(['Jardin'])
  })
  it('coupe AUSSI quand c’est le niveau de tête qui manque', () => {
    // Tentant de démarrer au premier niveau renseigné — mais l'arbre indexe par libellé à
    // chaque niveau : « Tonte » deviendrait deux nœuds (racine ET enfant de « Jardin »),
    // compteurs coupés en deux. Les niveaux trop peu renseignés sont écartés en amont.
    expect(taxoPathOf({ U: '', F: 'Tonte', S: 'Courroies' }, ['U', 'F', 'S'])).toEqual([])
  })
})

describe('trimDescription', () => {
  it('tronque au-delà du plafond persistable', () => {
    const long = 'x'.repeat(DESCRIPTION_MAX + 50)
    expect(trimDescription(long)).toHaveLength(DESCRIPTION_MAX + 1)
    expect(trimDescription(long)?.endsWith('…')).toBe(true)
  })
  it('rend undefined sur une cellule vide (jamais une chaîne vide en base)', () => {
    expect(trimDescription('   ')).toBeUndefined()
    expect(trimDescription(null)).toBeUndefined()
  })
})

describe('colonne TEXT_VENTE', () => {
  it('retient le texte de vente PLUTÔT que la colonne « DESCRIPTION »', () => {
    // Cas VÉCU sur le catalogue F1 : « DESCRIPTION » recopie le libellé, « TEXT_VENTE »
    // porte l'argumentaire. Retenir la première affichait le nom deux fois de suite.
    const cols = [
      { key: 'LIBELLE', label: 'Désignation' },
      { key: 'DESCRIPTION', label: 'Description' },
      { key: 'TEXT_VENTE', label: 'Texte de vente' },
    ]
    expect(pickDisplayColumns(cols).description).toBe('TEXT_VENTE')
  })

  it('reconnaît les écritures usuelles du texte de vente', () => {
    for (const key of ['TEXT_VENTE', 'TEXTE_VENTE', 'Texte de vente', 'texteVenteWeb']) {
      expect(pickDisplayColumns([{ key }]).description).toBe(key)
    }
  })

  it('ne change RIEN sur une feuille sans texte de vente', () => {
    const cols = [{ key: 'LIBELLE' }, { key: 'DESCRIPTIF' }]
    expect(pickDisplayColumns(cols).description).toBe('DESCRIPTIF')
  })

  it('la colonne saisie dans le node prime toujours sur la détection', () => {
    const cols = [{ key: 'DESCRIPTION' }, { key: 'TEXT_VENTE' }]
    expect(pickDisplayColumns(cols, { description: 'DESCRIPTION' }).description).toBe('DESCRIPTION')
  })
})
