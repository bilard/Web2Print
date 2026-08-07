// ORDRE d'écriture du catalogue source. Ce n'est pas un détail d'implémentation : entre
// le premier effacement et le dernier document écrit, l'explorateur « Concurrents » relit
// cette collection. Purger d'abord, c'est publier un catalogue ABSENT pendant toute la
// durée de la réécriture (plusieurs minutes sur une base F1), et le perdre pour de bon si
// le run casse au milieu — l'écran affiche alors « 0 apparié » sur un site pourtant
// intégralement collecté.
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Journal des opérations Firestore, dans l'ordre où elles sont ÉMISES. */
const ops: string[] = []
/** Documents déjà présents dans la collection, tels que les rendra `getDocs`. */
let existing: string[] = []

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id?: string) => ({ path: id ? `${col}/${id}` : col, id }),
  collection: (_db: unknown, col: string) => ({ path: col }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({
    docs: existing.map((id) => ({ id, ref: { path: id } })),
    forEach(this: { docs: unknown[] }) {},
  })),
  setDoc: vi.fn(async (ref: { id?: string }) => { ops.push(`set:${ref.id}`) }),
  deleteDoc: vi.fn(async (ref: { path: string }) => { ops.push(`del:${ref.path}`) }),
  serverTimestamp: () => 0,
}))

const { saveSourceCatalog } = await import('./reportStore')

/** Produits assez gros pour tenir en plusieurs tranches (~900 Ko chacune). */
function bigCatalog(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `Produit ${i}`, ref: `REF-${i}`, description: 'x'.repeat(400),
  }))
}

beforeEach(() => { ops.length = 0; existing = [] })

describe('écriture du catalogue source', () => {
  it('n’efface RIEN avant d’avoir publié le nouveau `_meta`', async () => {
    existing = ['_meta', 'chunk_0', 'chunk_1', 'chunk_2', 'chunk_3']
    await saveSourceCatalog('u1', 'w1', bigCatalog(3000), 0.2)

    const meta = ops.indexOf('set:_meta')
    expect(meta).toBeGreaterThanOrEqual(0)
    const firstDelete = ops.findIndex((o) => o.startsWith('del:'))
    // -1 = aucune suppression, acceptable ; sinon elle doit venir APRÈS `_meta`.
    if (firstDelete >= 0) expect(firstDelete).toBeGreaterThan(meta)
  })

  it('écrit toutes les tranches AVANT `_meta` (jamais un compte annoncé sans son contenu)', async () => {
    await saveSourceCatalog('u1', 'w1', bigCatalog(3000), 0.2)
    const meta = ops.indexOf('set:_meta')
    const chunks = ops.filter((o) => o.startsWith('set:chunk_'))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(ops.indexOf(c)).toBeLessThan(meta)
  })

  it('purge les tranches EXCÉDENTAIRES d’un catalogue rétréci, et seulement elles', async () => {
    existing = ['_meta', 'chunk_0', 'chunk_1', 'chunk_2', 'chunk_3', 'chunk_4']
    await saveSourceCatalog('u1', 'w1', [{ id: 'a', name: 'A' }], 0.2)
    const deleted = ops.filter((o) => o.startsWith('del:')).map((o) => o.slice(4))
    // Une seule tranche écrite (chunk_0) : les suivantes sont orphelines.
    expect(deleted.sort()).toEqual(['chunk_1', 'chunk_2', 'chunk_3', 'chunk_4'])
    expect(deleted).not.toContain('_meta')
    expect(deleted).not.toContain('chunk_0')
  })

  it('rend compte de son avancement, tranche par tranche', async () => {
    const seen: [number, number][] = []
    await saveSourceCatalog('u1', 'w1', bigCatalog(3000), 0.2, {
      onProgress: (done, total) => seen.push([done, total]),
    })
    expect(seen.length).toBeGreaterThan(0)
    const [lastDone, lastTotal] = seen[seen.length - 1]
    expect(lastDone).toBe(lastTotal)
  })
})
