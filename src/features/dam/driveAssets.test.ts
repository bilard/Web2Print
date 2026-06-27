import { describe, it, expect } from 'vitest'
import { extractDriveFileId, isDriveImageRef, driveWebViewLink } from './driveAssets'

const FID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345' // 32 chars, format Drive réaliste

describe('extractDriveFileId', () => {
  it('extrait depuis un webViewLink /file/d/{id}/view', () => {
    expect(extractDriveFileId(`https://drive.google.com/file/d/${FID}/view?usp=drivesdk`)).toBe(FID)
  })
  it('extrait depuis ?id= (uc?export=view)', () => {
    expect(extractDriveFileId(`https://drive.google.com/uc?id=${FID}&export=view`)).toBe(FID)
  })
  it('extrait depuis /d/{id}', () => {
    expect(extractDriveFileId(`https://drive.google.com/open/d/${FID}`)).toBe(FID)
  })
  it('renvoie null pour une URL CDN brute', () => {
    expect(extractDriveFileId('https://cdn.exemple.com/img/produit-42.jpg')).toBeNull()
  })
  it('renvoie null pour une valeur non-string', () => {
    expect(extractDriveFileId(null as unknown as string)).toBeNull()
  })
})

describe('isDriveImageRef', () => {
  it('vrai pour un lien Drive avec fileId', () => {
    expect(isDriveImageRef(`https://drive.google.com/file/d/${FID}/view`)).toBe(true)
  })
  it('faux pour une URL CDN', () => {
    expect(isDriveImageRef('https://images.exemple.com/a.png')).toBe(false)
  })
  it('faux pour drive.google.com sans fileId valide', () => {
    expect(isDriveImageRef('https://drive.google.com/drive/my-drive')).toBe(false)
  })
})

describe('driveWebViewLink', () => {
  it('produit un lien ré-extractible (round-trip)', () => {
    const link = driveWebViewLink(FID)
    expect(link).toContain(FID)
    expect(extractDriveFileId(link)).toBe(FID)
    expect(isDriveImageRef(link)).toBe(true)
  })
})
