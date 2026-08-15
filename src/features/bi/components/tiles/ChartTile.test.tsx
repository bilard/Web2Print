// ⚠⚠ Ce que ce test protège : un graphe qui a l'air cliquable et ne l'est pas.
//
// chart.js ne renseigne ses éléments ACTIFS qu'au `mousemove`. Au doigt — ou sur tout clic
// qui n'a pas été précédé d'un survol — la liste arrive VIDE et le filtrage croisé restait
// muet, sans que rien ne le signale. Le repli interroge alors le graphe lui-même.
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ChartTile } from './ChartTile'
import type { AggregateResult } from '../../engine/aggregate'

// react-chartjs-2 ne rend rien en jsdom : on capture les options passées au graphe, qui
// portent le `onClick` à éprouver.
const captured: { options?: Record<string, unknown> } = {}
vi.mock('react-chartjs-2', () => {
  const Stub = (p: { options: Record<string, unknown> }) => { captured.options = p.options; return null }
  return { Bar: Stub, Line: Stub, Pie: Stub, Doughnut: Stub }
})

const result: AggregateResult = {
  columns: [
    { key: 'domain', labelKey: 'bi.dim.competitor', role: 'dimension' },
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ],
  rows: [{ domain: 'alpha.fr', count: 3 }, { domain: 'beta.fr', count: 1 }],
}

/** Graphe minimal : il ne sait qu'une chose, quel élément se trouve sous le pointeur. */
const chartStub = (index: number | null) => ({
  getElementsAtEventForMode: () => (index === null ? [] : [{ index }]),
})

describe('ChartTile — le clic rapporte ce qui a été cliqué', () => {
  it('interroge le graphe quand aucun élément n’est ACTIF (clic sans survol, écran tactile)', () => {
    const onPick = vi.fn()
    render(<ChartTile result={result} kind="bar" onPick={onPick} />)
    const onClick = captured.options?.onClick as (e: unknown, els: unknown[], c: unknown) => void
    onClick({ native: new MouseEvent('click') }, [], chartStub(1))
    expect(onPick).toHaveBeenCalledWith('domain', 'beta.fr')
  })

  it('ne rapporte RIEN quand le clic tombe hors de toute valeur', () => {
    // ⚠ Un clic dans le vide ne doit pas poser un filtre au hasard : sans cette garde, la
    // page entière se restreindrait sur une valeur que personne n'a désignée.
    const onPick = vi.fn()
    render(<ChartTile result={result} kind="bar" onPick={onPick} />)
    const onClick = captured.options?.onClick as (e: unknown, els: unknown[], c: unknown) => void
    onClick({ native: new MouseEvent('click') }, [], chartStub(null))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('privilégie l’élément actif quand chart.js en fournit un', () => {
    const onPick = vi.fn()
    render(<ChartTile result={result} kind="bar" onPick={onPick} />)
    const onClick = captured.options?.onClick as (e: unknown, els: unknown[], c: unknown) => void
    onClick({ native: new MouseEvent('click') }, [{ index: 0 }], chartStub(1))
    expect(onPick).toHaveBeenCalledWith('domain', 'alpha.fr')
  })
})
