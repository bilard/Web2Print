// ⚠⚠ Ce que ce test protège : la chaîne ENTIÈRE du filtrage croisé — cliquer une barre,
// poser le filtre, et voir TOUTES les tuiles se recalculer.
//
// Le défaut qui a motivé ce fichier ne se voyait pas : les graphes se réduisaient à un
// concurrent pendant que les quatre indicateurs affichaient encore le total général. Un
// chiffre non filtré à côté de chiffres filtrés, sur le même écran, sans rien qui le dise —
// c'est la pire forme d'erreur, celle qui a l'air juste.
//
// La recette au navigateur ne peut PLUS servir de garde-fou ici : elle pilote un onglet
// masqué, où `requestAnimationFrame` ne bat pas (cf. `chartVisibility.ts`) et où les
// chiffres animés se figent à mi-course. Ce test est donc la seule preuve fiable.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BiBoard } from './BiBoard'
import { resetWatchDataForTest } from '../hooks/useWatchData'
import type { Dashboard, Tile } from '../types'

/** Mode TV éteint : ces tests portent sur la grille, pas sur l'écran mural. */
const TV_OFF = { on: false, enter: vi.fn(), exit: vi.fn() }

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

// ⚠ Onglet masqué : `AnimatedNumber` pose alors sa valeur SANS animer. C'est exactement le
// comportement qu'on veut ici — sans quoi le test lirait une valeur d'interpolation.
Object.defineProperty(document, 'hidden', { configurable: true, value: true })

// Trois concurrents : 1 000 + 300 + 20 = 1 320 appariés au total, dont 1 000 pour alpha.fr
// — les deux chiffres que les tests confrontent.

vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'u1' }))
vi.mock('../store/dashboardsStore', () => ({ saveDashboard: vi.fn().mockResolvedValue(undefined) }))
// ⚠ Les valeurs de retour sont des CONSTANTES : `useCatalogReport` est lu dans les
// dépendances d'un effet qui publie les lignes. Un objet recréé à chaque rendu relancerait
// l'effet sans fin — le hook réel, lui, tient son rapport dans un état.
vi.mock('@/features/priceWatch/useCatalogReport', () => {
  // ⚠ Fixture RECONSTRUITE ici : la factory est hissée au-dessus des constantes du fichier.
  const s = (domain: string, matched: number, cheaper: number, indexed: number) => ({
    siteId: domain, domain, matched, cheaper, ruptures: 0, avgGapPct: null, medGapPct: -5,
    audit: { indexed, pctPrice: 100, pctListPrice: 0, pctStock: 0, pctName: 100, pctImage: 0, pctRef: 100 },
  })
  const byCompetitor = [s('alpha.fr', 1000, 400, 5000), s('beta.fr', 300, 100, 2000), s('gamma.fr', 20, 5, 90)]
  const report = {
    runAt: 1, byCompetitor,
    sites: byCompetitor.map((x) => ({ siteId: x.siteId, domain: x.domain })),
    products: [], totalMatched: 1320, truncated: false, kpis: {},
  }
  const watches = [{ watchId: 'w1', label: 'Veille', updatedAt: 1 }]
  return { useWatchList: () => watches, useCatalogReport: () => report }
})

// Le graphe est remplacé par un bouton qui rapporte un clic : chart.js ne rend rien en
// jsdom, et ce qu'on teste ici est ce que le tableau FAIT du clic, pas son dessin.
vi.mock('./tiles/ChartTile', () => ({
  ChartTile: ({ onPick }: { onPick?: (field: string, value: string | null) => void }) => (
    <button type="button" onClick={() => onPick?.('domain', 'alpha.fr')}>clic-barre</button>
  ),
}))

const tiles: Tile[] = [
  {
    id: 'kpi', kind: 'kpi', title: 'Appariés',
    query: { source: 'watch.summary', measures: [{ id: 'watch.matched' }], dimensions: [], filters: [] },
  },
  {
    id: 'bar', kind: 'bar', title: 'Par concurrent',
    query: {
      source: 'watch.summary', measures: [{ id: 'watch.matched' }],
      dimensions: [{ id: 'domain' }], filters: [],
    },
  },
]

const layout = [
  { tileId: 'kpi', x: 0, y: 0, w: 3, h: 2 },
  { tileId: 'bar', x: 3, y: 0, w: 6, h: 4 },
]

const dashboard: Dashboard = {
  id: 'd1', name: 'Écarts', accountId: 'acme', workspaceUid: 'u1',
  tiles, layout, filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [{ id: 'p1', name: 'Écarts', tiles, layout }],
}

const board = () => (
  <BiBoard current={dashboard} page={dashboard.pages[0]} pages={dashboard.pages} items={[dashboard]}
    uid="u1" editing={false} onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()}
    onSelectPage={vi.fn()} onPageCreated={vi.fn()} tv={TV_OFF} />
)

describe('filtrage croisé — du clic au recalcul', () => {
  beforeEach(() => { resetWatchDataForTest() })

  it('l’indicateur SANS dimension suit le filtre posé par le clic', async () => {
    render(board())
    // Total des trois concurrents, avant tout filtre.
    expect(await screen.findByText('1 320')).toBeTruthy()

    await act(async () => { screen.getByText('clic-barre').click() })

    // ⚠⚠ Le cœur du test : l'indicateur tombe à la valeur du SEUL concurrent cliqué.
    // Tant qu'il affichait 1 320 à côté d'un graphe réduit à alpha.fr, l'écran mentait.
    expect(await screen.findByText('1 000')).toBeTruthy()
    expect(screen.queryByText('1 320')).toBeNull()
  })

  it('le filtre du clic se VOIT, et se retire', async () => {
    render(board())
    await act(async () => { screen.getByText('clic-barre').click() })
    // Sans cette puce, un filtre pourrait restreindre toute la page sans se montrer.
    const chip = await screen.findByText(/alpha\.fr/)
    expect(chip).toBeTruthy()

    // Re-cliquer la même valeur annule : le geste doit être réversible sans le bandeau.
    await act(async () => { screen.getByText('clic-barre').click() })
    expect(await screen.findByText('1 320')).toBeTruthy()
  })
})
