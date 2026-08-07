import { describe, it, expect } from 'vitest'
import { buildSourceExtras } from './sourceExtras'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const col = (key: string, label: string, fieldType: ExcelColumn['fieldType'] = 'text'): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width: 120,
})

const columns = [
  col('CODE_ARTICLE', 'Référence article'),
  col('GENCOD', 'EAN'),
  col('LIBELLE', 'Désignation'),
  col('DESCRIPTIF', 'Descriptif produit'),
  col('PHOTO', 'Visuel produit'),
]

const rows: ExcelRow[] = [
  {
    _id: '1', CODE_ARTICLE: 'ABC-123', GENCOD: '4049582395377', LIBELLE: 'Courroie',
    DESCRIPTIF: 'Courroie renforcée', PHOTO: 'https://f1/a.jpg, https://f1/a2.jpg',
  },
  { _id: '2', CODE_ARTICLE: 'XYZ-9', GENCOD: '3701234567890', LIBELLE: 'Filtre', DESCRIPTIF: 'Filtre à air', PHOTO: '' },
]

describe('buildSourceExtras', () => {
  it('reconnaît les colonnes de description et de visuels sans configuration', () => {
    const idx = buildSourceExtras(columns, rows)
    expect(idx.descriptionKey).toBe('DESCRIPTIF')
    expect(idx.imageKeys).toEqual(['PHOTO'])
    expect(idx.size).toBe(2)
  })

  it('reconnaît la colonne de lien produit et n’en retient que les adresses absolues', () => {
    const withUrl = [...columns, col('LIEN_PRODUIT', 'Lien produit')]
    const urlRows: ExcelRow[] = [
      { ...rows[0], LIEN_PRODUIT: 'https://f1.example/p/abc-123' },
      // Une cellule qui ne porte pas une adresse absolue ne doit produire AUCUN lien :
      // un href relatif pointerait vers l'app elle-même.
      { ...rows[1], LIEN_PRODUIT: '/produits/xyz-9' },
    ]
    const idx = buildSourceExtras(withUrl, urlRows)
    expect(idx.urlKey).toBe('LIEN_PRODUIT')
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).url).toBe('https://f1.example/p/abc-123')
    expect(idx.lookup({ id: 'p', name: '', ref: 'XYZ-9' }).url).toBeNull()
  })

  it('joint par EAN, puis par référence, en tolérant la casse et les séparateurs', () => {
    const idx = buildSourceExtras(columns, rows)
    expect(idx.lookup({ id: 'p', name: '', ean: '4049582395377' }).description).toBe('Courroie renforcée')
    expect(idx.lookup({ id: 'p', name: '', ref: 'abc123' }).description).toBe('Courroie renforcée')
    expect(idx.lookup({ id: 'p', name: '', ref: 'INCONNU' }).description).toBeNull()
  })

  it('éclate une cellule multi-visuels en URLs distinctes', () => {
    const idx = buildSourceExtras(columns, rows)
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).images).toEqual(['https://f1/a.jpg', 'https://f1/a2.jpg'])
    expect(idx.lookup({ id: 'p', name: '', ref: 'XYZ-9' }).images).toEqual([])
  })

  it('reconstruit l’URL des visuels stockés en NOM DE FICHIER, via le préfixe', () => {
    // Base sans autre colonne d'images, pour isoler le comportement du préfixe.
    const cols = [col('CODE_ARTICLE', 'Référence article'), col('PATH_PHOTO', 'Photo')]
    const rs: ExcelRow[] = [{ _id: '1', CODE_ARTICLE: 'ABC-123', PATH_PHOTO: '2400956001.jpg' }]
    const idx = buildSourceExtras(cols, rs, { imagePrefix: 'https://www.f1distribution.com/www/fichiers/articles/hr/' })
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).images)
      .toEqual(['https://www.f1distribution.com/www/fichiers/articles/hr/2400956001.jpg'])
  })

  it('n’applique pas le préfixe aux cellules déjà absolues, et gère les barres en double', () => {
    const cols = [col('CODE_ARTICLE', 'Référence article'), col('PATH_PHOTO', 'Photo')]
    const rs: ExcelRow[] = [{ _id: '1', CODE_ARTICLE: 'ABC-123', PATH_PHOTO: 'https://cdn.x/a.jpg, /b.jpg' }]
    const idx = buildSourceExtras(cols, rs, { imagePrefix: 'https://host/img/' })
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).images)
      .toEqual(['https://cdn.x/a.jpg', 'https://host/img/b.jpg'])
  })

  it('détecte une colonne de visuels au CONTENU même sans préfixe configuré', () => {
    const cols = [col('CODE_ARTICLE', 'Référence article'), col('VISU', 'Fichier')]
    const rs: ExcelRow[] = [{ _id: '1', CODE_ARTICLE: 'ABC-123', VISU: '2400956001.jpg' }]
    const idx = buildSourceExtras(cols, rs)
    expect(idx.imageKeys).toEqual(['VISU'])
    // Sans préfixe, rien n'est affichable : mieux vaut aucune image qu'une URL fausse.
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).images).toEqual([])
  })

  it('reconnaît les niveaux de taxonomie, sans confondre famille et sous-famille', () => {
    const cols = [...columns, col('FAMILLE', 'Famille'), col('WEBGROUP_DESC', 'Sous famille'), col('PRODUCTGROUP', 'Product group')]
    const rs: ExcelRow[] = [{
      ...rows[0], FAMILLE: 'Motoculture', WEBGROUP_DESC: 'Tondeuses', PRODUCTGROUP: 'Courroies',
    }]
    const idx = buildSourceExtras(cols, rs)
    // Un emplacement par niveau du dictionnaire, `null` pour ceux que la base ne porte
    // pas — ici l'UNIVERS, apparu dans le catalogue F1 et absent de cette feuille.
    expect(idx.taxoKeys).toEqual([null, 'FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'])
    expect(idx.lookup({ id: 'p', name: '', ref: 'ABC-123' }).path).toEqual(['Motoculture', 'Tondeuses', 'Courroies'])
  })

  it('arrête le chemin au premier niveau vide (pas de nœud fantôme)', () => {
    const cols = [...columns, col('FAMILLE', 'Famille'), col('WEBGROUP_DESC', 'Sous famille'), col('PRODUCTGROUP', 'Product group')]
    const rs: ExcelRow[] = [{ ...rows[0], FAMILLE: 'Motoculture', WEBGROUP_DESC: '', PRODUCTGROUP: 'Courroies' }]
    expect(buildSourceExtras(cols, rs).lookup({ id: 'p', name: '', ref: 'ABC-123' }).path).toEqual(['Motoculture'])
  })

  it('signale l’absence de clé de jointure au lieu d’indexer du vide', () => {
    const idx = buildSourceExtras([col('LIBELLE', 'Désignation')], [{ _id: '1', LIBELLE: 'X' }])
    expect(idx.size).toBe(0)
    expect(idx.lookup({ id: 'p', name: 'X', ref: 'ABC-123' }).description).toBeNull()
  })
})
