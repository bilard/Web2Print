// ⚠⚠ Ce que ces tests protègent : le zoom agrandit la BOÎTE du visuel (chart.js redessine
// alors net), il ne met pas l'image à l'échelle. Si quelqu'un remplaçait la taille en
// pourcentage par un `transform: scale()`, les graphes deviendraient flous en s'agrandissant
// et rien dans les tests ne le dirait.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TileZoomDialog } from './TileZoomDialog'
import type { TileKind } from '../types'

const open = (kind: TileKind = 'bar', onClose = vi.fn()) => {
  const view = render(
    <TileZoomDialog title="Nombre de concurrents" kind={kind} onClose={onClose}>
      <span data-testid="visual">le visuel</span>
    </TileZoomDialog>,
  )
  return { view, onClose, box: () => screen.getByTestId('visual').parentElement! }
}

describe('la fenêtre d’agrandissement', () => {
  // ⚠⚠ Le bug qui l'a rendue inutilisable : rendue EN PLACE, elle héritait du `transform`
  // que `react-grid-layout` pose sur chaque tuile, et un `position: fixed` sous un ancêtre
  // transformé se cale sur cet ancêtre — la fenêtre s'ouvrait décalée, débordant de l'écran,
  // voile inopérant et bouton de fermeture hors de portée.
  it('se monte dans `document.body`, hors de la tuile qui l’ouvre', () => {
    const { view } = open()
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
  })

  it('rend le visuel à sa taille d’origine, sans mise à l’échelle', () => {
    const { box } = open()
    expect(box().style.width).toBe('100%')
    // ⚠ Aucune transformation CSS : c'est la BOÎTE qui grandira, pas l'image.
    expect(box().style.transform).toBe('')
  })

  it('agrandit la boîte par paliers, et sait revenir', () => {
    const { box } = open()
    fireEvent.click(screen.getByLabelText('Agrandir'))
    expect(box().style.width).toBe('150%')
    expect(box().style.height).toBe('150%')
    fireEvent.click(screen.getByLabelText('Agrandir'))
    expect(box().style.width).toBe('200%')
    fireEvent.click(screen.getByLabelText('Taille d’origine'))
    expect(box().style.width).toBe('100%')
  })

  it('borne les paliers : « réduire » est mort à 100 %', () => {
    open()
    expect(screen.getByLabelText<HTMLButtonElement>('Réduire').disabled).toBe(true)
  })

  // ⚠⚠ Le nuage 3D porte SON zoom (molette) et sa rotation : deux zooms sur le même geste
  // rendraient les deux inutilisables.
  it('n’offre aucun zoom au nuage 3D, qui a le sien', () => {
    open('scatter3d')
    expect(screen.queryByLabelText('Agrandir')).toBeNull()
    expect(screen.getByTestId('visual')).toBeTruthy()
  })

  it('se ferme à Échap', () => {
    const { onClose } = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
