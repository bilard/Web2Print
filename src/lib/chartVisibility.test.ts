// ⚠⚠ Ce que ce test protège : un graphe VISIBLE mais inerte. Sans la réparation, les
// éléments d'un graphe monté en arrière-plan gardent une hitbox de hauteur nulle et aucun
// clic ne filtre plus — l'écran a l'air normal, l'interactivité est morte.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Chart } from 'chart.js'
import { installChartVisibilityRepair, repairCharts } from './chartVisibility'

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })

afterEach(() => { setHidden(false); vi.restoreAllMocks() })

describe('réparation des graphes au retour de l’onglet', () => {
  it('repose la géométrie SANS animation', () => {
    const update = vi.fn()
    vi.spyOn(Chart, 'instances', 'get').mockReturnValue({ 1: { update } } as never)
    repairCharts()
    expect(update).toHaveBeenCalledWith('none')
  })

  it('un graphe démonté n’empêche pas les autres d’être réparés', () => {
    const update = vi.fn()
    vi.spyOn(Chart, 'instances', 'get').mockReturnValue({
      1: { update: () => { throw new Error('démonté') } },
      2: { update },
    } as never)
    expect(() => repairCharts()).not.toThrow()
    expect(update).toHaveBeenCalledWith('none')
  })

  it('ne répare pas quand l’onglet PART en arrière-plan', () => {
    const update = vi.fn()
    vi.spyOn(Chart, 'instances', 'get').mockReturnValue({ 1: { update } } as never)
    installChartVisibilityRepair()
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).not.toHaveBeenCalled()
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledWith('none')
  })
})
