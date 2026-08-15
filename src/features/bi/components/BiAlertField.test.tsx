// ⚠⚠ Ce que ces tests protègent : un seuil qui s'écrit mal. Un `undefined` posé sur une clé
// fait ÉCHOUER l'écriture Firestore en silence (le projet en a l'expérience), et un champ
// vidé qui laisserait un seuil à zéro ferait sonner toutes les tuiles positives.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BiAlertField } from './BiAlertField'
import type { DataSource } from '../registry/types'
import type { Tile } from '../types'

/** Source minimale : le champ nomme la mesure gardée, il lui faut le catalogue. */
const source: DataSource = {
  id: 'watch.summary', labelKey: 'bi.source.watchSummary', engine: 'client',
  dimensions: [],
  measures: [{ id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
    compute: () => 0 }],
}

const tile = (alert?: { op: 'gt' | 'lt'; value: number }): Tile => ({
  id: 't1', kind: 'kpi', title: 'Écart',
  query: { source: 'watch.summary', measures: [{ id: 'count' }], dimensions: [], filters: [] },
  ...(alert ? { options: { alert } } : {}),
})

describe('réglage du seuil', () => {
  it('pose un seuil au-dessus par défaut', () => {
    const onApply = vi.fn()
    render(<BiAlertField tile={tile()} canEdit source={source} onApply={onApply} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } })
    expect(onApply.mock.calls[0][0].options.alert).toEqual({ op: 'gt', value: 30 })
  })

  it('bascule le SENS sans perdre la valeur', () => {
    const onApply = vi.fn()
    render(<BiAlertField tile={tile({ op: 'gt', value: 30 })} canEdit source={source} onApply={onApply} />)
    fireEvent.click(screen.getByText('>'))
    expect(onApply.mock.calls[0][0].options.alert).toEqual({ op: 'lt', value: 30 })
  })

  it('RETIRE la clé quand le champ est vidé, au lieu d’y poser `undefined`', () => {
    const onApply = vi.fn()
    render(<BiAlertField tile={tile({ op: 'gt', value: 30 })} canEdit source={source} onApply={onApply} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    const options = onApply.mock.calls[0][0].options
    expect('alert' in options).toBe(false)
  })

  it('ignore une saisie illisible plutôt que de poser un seuil à zéro', () => {
    const onApply = vi.fn()
    render(<BiAlertField tile={tile()} canEdit source={source} onApply={onApply} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: 'abc' } })
    expect(onApply).not.toHaveBeenCalled()
  })

  it('reste inerte sans tuile sélectionnée ou sans droit d’édition', () => {
    const onApply = vi.fn()
    const { unmount } = render(<BiAlertField tile={null} canEdit source={source} onApply={onApply} />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true)
    unmount()
    render(<BiAlertField tile={tile()} canEdit={false} source={source} onApply={onApply} />)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true)
  })
})
