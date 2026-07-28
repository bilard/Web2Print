import { test, expect } from 'vitest'
import { isCutoutUrl } from './useCatalogCutout'

test('isCutoutUrl : reconnaît un visuel DÉJÀ détouré dans une URL Firebase Storage', () => {
  // ⚠ Storage ENCODE les séparateurs : chercher « /catalogCutouts/ » ne matche
  // jamais — c'était la cause du re-détourage complet à chaque clic.
  const stored = 'https://firebasestorage.googleapis.com/v0/b/web2print-6fe5a.appspot.com/o/'
    + 'users%2Fabc123%2FcatalogCutouts%2Frow_1_1754000000000.png?alt=media&token=xyz'
  expect(isCutoutUrl(stored)).toBe(true)
  // Chemin non encodé (autre contexte) : reconnu aussi.
  expect(isCutoutUrl('https://x/users/abc/catalogCutouts/row_1.png')).toBe(true)
})

test('isCutoutUrl : un visuel source n\'est jamais pris pour un détourage', () => {
  expect(isCutoutUrl('https://drive.google.com/file/d/1AbC/view')).toBe(false)
  expect(isCutoutUrl('https://cdn.exemple.fr/produits/colle-neoprene.jpg')).toBe(false)
  expect(isCutoutUrl('')).toBe(false)
})
