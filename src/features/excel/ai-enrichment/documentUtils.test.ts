import { describe, it, expect } from 'vitest'
import { basenameFromUrl, buildDocument, cleanDocumentName, parseDocumentsCell, coerceDocuments, displayDocumentName } from './documentUtils'

describe('basenameFromUrl', () => {
  it('extracts and decodes the last path segment', () => {
    expect(basenameFromUrl('https://x.com/files/notice-X12345-fr.pdf')).toBe('notice-X12345-fr.pdf')
    expect(basenameFromUrl('https://x.com/files/notice%20produit.pdf?v=2')).toBe('notice produit.pdf')
  })

  it('returns empty string when URL has no usable path', () => {
    expect(basenameFromUrl('https://x.com/')).toBe('')
    expect(basenameFromUrl('not-a-url')).toBe('not-a-url')
  })
})

describe('buildDocument', () => {
  it('falls back name → filename when no name given', () => {
    const d = buildDocument('https://x.com/notice.pdf')
    expect(d.name).toBe('notice.pdf')
    expect(d.filename).toBe('notice.pdf')
  })

  it('uses provided name when ≥2 chars', () => {
    const d = buildDocument('https://x.com/notice.pdf', 'Notice utilisateur')
    expect(d.name).toBe('Notice utilisateur')
    expect(d.filename).toBe('notice.pdf')
  })

  it('rejects too-short or whitespace name and falls back to filename', () => {
    expect(buildDocument('https://x.com/n.pdf', '   ').name).toBe('n.pdf')
    expect(buildDocument('https://x.com/n.pdf', 'a').name).toBe('n.pdf')
  })
})

describe('parseDocumentsCell — backward-compat', () => {
  it('parses canonical JSON form', () => {
    const cell = JSON.stringify([{ name: 'Notice', url: 'https://x.com/n.pdf', filename: 'n.pdf' }])
    expect(parseDocumentsCell(cell)).toEqual([{ name: 'Notice', url: 'https://x.com/n.pdf', filename: 'n.pdf' }])
  })

  it('parses legacy "titre##url | …" format', () => {
    const cell = 'Notice##https://x.com/n.pdf | Manuel##https://x.com/m.pdf'
    const out = parseDocumentsCell(cell)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ name: 'Notice', url: 'https://x.com/n.pdf', filename: 'n.pdf' })
    expect(out[1]).toEqual({ name: 'Manuel', url: 'https://x.com/m.pdf', filename: 'm.pdf' })
  })

  it('parses legacy URL-only list and derives filename from basename', () => {
    const cell = 'https://x.com/notice-fr.pdf | https://x.com/manuel-fr.pdf'
    const out = parseDocumentsCell(cell)
    expect(out).toHaveLength(2)
    expect(out[0].filename).toBe('notice-fr.pdf')
    expect(out[0].name).toBe('notice-fr.pdf')
  })

  it('drops invalid entries (no http URL)', () => {
    expect(parseDocumentsCell('garbage | also-no-url')).toEqual([])
  })
})

describe('coerceDocuments — LLM output normalization', () => {
  it('coerces array of URL strings', () => {
    const out = coerceDocuments(['https://x.com/n.pdf', 'https://x.com/m.pdf'])
    expect(out).toHaveLength(2)
    expect(out[0].url).toBe('https://x.com/n.pdf')
  })

  it('coerces objects with {name, value} shape (legacy useJina specs format)', () => {
    const out = coerceDocuments([{ name: 'Notice', value: 'https://x.com/n.pdf' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ name: 'Notice', url: 'https://x.com/n.pdf', filename: 'n.pdf' })
  })

  it('deduplicates by URL', () => {
    const out = coerceDocuments([
      'https://x.com/n.pdf',
      { name: 'Notice', url: 'https://x.com/n.pdf' },
    ])
    expect(out).toHaveLength(1)
  })

  it('rejects entries without valid URL', () => {
    const out = coerceDocuments([{ name: 'Notice' }, 'mailto:x@y.com'])
    expect(out).toHaveLength(0)
  })
})

describe('displayDocumentName — fallback chain', () => {
  it('uses name when present', () => {
    expect(displayDocumentName({ name: 'Notice', url: 'https://x.com/n.pdf', filename: 'n.pdf' })).toBe('Notice')
  })

  it('falls back to filename when name is empty/whitespace', () => {
    expect(displayDocumentName({ name: '', url: 'https://x.com/n.pdf', filename: 'n.pdf' })).toBe('n.pdf')
    expect(displayDocumentName({ name: '   ', url: 'https://x.com/n.pdf', filename: 'n.pdf' })).toBe('n.pdf')
  })

  it('falls back to URL basename when both name and filename are empty', () => {
    expect(displayDocumentName({ name: '', url: 'https://x.com/datasheet.pdf', filename: '' })).toBe('datasheet.pdf')
  })

  it('falls back to URL when basename is also empty', () => {
    expect(displayDocumentName({ name: '', url: 'https://x.com/', filename: '' })).toBe('https://x.com/')
  })

  it('falls back to "Document" as last resort', () => {
    expect(displayDocumentName({ name: '', url: '', filename: '' })).toBe('Document')
  })
})

describe('cleanDocumentName', () => {
  const doc = (name: string, url: string, filename = '') => ({ name, url, filename })

  it('laisse un titre parlant intact', () => {
    const d = doc('Notice de montage', 'https://x.fr/files/abc.pdf')
    expect(cleanDocumentName(d)).toBe(d)
  })

  it('remplace un libellé de LIEN par un nom tiré de l’URL', () => {
    // « Télécharger », « PDF », « Cliquez ici » : le texte de l'ancre, pas le titre du
    // document. C'est le cas courant sur les sites fabricants.
    expect(cleanDocumentName(doc('Télécharger', 'https://x.fr/fiche-technique_dda351.pdf')).name)
      .toBe('Fiche technique dda351')
    expect(cleanDocumentName(doc('PDF', 'https://x.fr/notice-montage.pdf')).name).toBe('Notice montage')
  })

  it('remonte au dossier parent quand le fichier est un hash', () => {
    // Une URL de CDN finit souvent en uuid : le segment parent porte alors le sens.
    expect(cleanDocumentName(doc('voir', 'https://cdn.x.fr/declaration-ce/9f2c1ab4d5e6f7089a1b.pdf')).name)
      .toBe('Declaration ce')
  })

  it('retombe sur le filename plutôt que de laisser un titre vide', () => {
    expect(cleanDocumentName(doc('lien', 'https://x.fr/a/9f2c1ab4d5e6f7089a1b.pdf', 'garantie.pdf')).name)
      .toBe('garantie.pdf')
  })

  it('rend le document tel quel quand rien de mieux n’est trouvable', () => {
    const d = doc('pdf', 'pas-une-url')
    expect(cleanDocumentName(d)).toBe(d)
  })
})
