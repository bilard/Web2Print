import { describe, it, expect, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth.store'
import { useLocaleStore } from '@/stores/locale.store'
import { nodeRegistry } from './index'
import './builtin'

/**
 * Vérifie les messages de run TELS QU'UN RUN LES PRODUIT, pas tels que le
 * catalogue les stocke.
 *
 * Pourquoi ce test existe : à l'écran, un `directed-search` sans entrée
 * affichait « · error » suivi de RIEN. Les catalogues étaient bons, le test de
 * parité vert, le test de câblage vert — et l'utilisateur voyait une erreur
 * muette. Un message vide est le pire des rendus : il ne dit ni ce qui a
 * échoué, ni dans quelle langue.
 */
const ctx = (): never => ({
  signal: new AbortController().signal,
  log: vi.fn(),
  setProgress: vi.fn(),
  workflowId: 'wf_test',
} as never)

describe('messages de run — rendu réel', () => {
  for (const locale of ['fr', 'en'] as const) {
    it(`directed-search sans entrée échoue avec un message NON VIDE en ${locale}`, async () => {
      useLocaleStore.setState({ locale })
      useAuthStore.setState({ user: { uid: 'u1' } } as never)

      const spec = nodeRegistry.get('directed-search')
      expect(spec, 'node directed-search introuvable').toBeDefined()

      await expect(
        spec!.run(ctx(), spec!.defaultConfig as never, {} as never),
      ).rejects.toThrow(/\S/) // au moins un caractère visible
    })
  }

  it('rend le message dans la langue du run', async () => {
    const spec = nodeRegistry.get('directed-search')!
    useAuthStore.setState({ user: { uid: 'u1' } } as never)

    useLocaleStore.setState({ locale: 'fr' })
    const fr = await spec.run(ctx(), spec.defaultConfig as never, {} as never).catch((e: Error) => e.message)
    useLocaleStore.setState({ locale: 'en' })
    const en = await spec.run(ctx(), spec.defaultConfig as never, {} as never).catch((e: Error) => e.message)

    expect(fr).toBe('Recherche dirigée : aucune donnée produit en entrée.')
    expect(en).toBe('Directed search: no product data on the input.')
  })
})
