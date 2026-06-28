import { describe, it, expect } from 'vitest'
import { normalizeBasename, leadingId, buildDriveIndex, matchCell } from './driveImageMatch'

describe('driveImageMatch', () => {
  it('normalise le nom de base (préfixe dossier + extension retirés)', () => {
    expect(normalizeBasename('img/246674928_tables-de-jardin-alto-792.jpg'))
      .toBe('246674928_tables-de-jardin-alto-792')
    expect(normalizeBasename('246674928_tables-de-jardin-alto-792.png'))
      .toBe('246674928_tables-de-jardin-alto-792')
  })

  it('extrait l\'ID numérique de tête', () => {
    expect(leadingId('img/246674928_tables.jpg')).toBe('246674928')
    expect(leadingId('sans-id.png')).toBeNull()
  })

  it('matche la cellule jpg préfixée au fichier Drive png (cas réel)', () => {
    const index = buildDriveIndex([
      { id: 'F1', name: '246674928_tables-de-jardin-alto-792.png', webViewLink: 'https://drive.google.com/file/d/F1/view' },
      { id: 'F2', name: '516359605_chaises-et-fauteuils-de-jardin-nova-s.png', webViewLink: 'https://drive.google.com/file/d/F2/view' },
    ])
    const hit = matchCell('img/246674928_tables-de-jardin-alto-792.jpg', index)
    expect(hit?.id).toBe('F1')
  })

  it('repli sur l\'ID numérique si le slug diffère', () => {
    const index = buildDriveIndex([
      { id: 'F9', name: '246674928_slug-different.png', webViewLink: 'https://drive.google.com/file/d/F9/view' },
    ])
    expect(matchCell('img/246674928_tables-de-jardin-alto-792.jpg', index)?.id).toBe('F9')
  })

  it('retourne null pour une valeur sans correspondance', () => {
    const index = buildDriveIndex([
      { id: 'F1', name: '111_a.png', webViewLink: 'x' },
    ])
    expect(matchCell('img/999_inconnu.jpg', index)).toBeNull()
    expect(matchCell(null, index)).toBeNull()
    expect(matchCell(42, index)).toBeNull()
  })
})
