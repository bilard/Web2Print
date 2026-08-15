// ⚠⚠ Ce que ces tests protègent : un CHIFFRE FAUX affiché pour toujours.
//
// `requestAnimationFrame` ne bat pas dans un onglet masqué. Une valeur qui change pendant
// que l'onglet est en arrière-plan restait donc figée à mi-course — relevé en prod sur le
// module BI : un KPI affichait 60 156 entre son ancien total (63 495) et sa vraie valeur
// filtrée, sans que rien ne signale l'écart. Une transition interrompue doit TOUJOURS
// atterrir sur sa cible.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AnimatedNumber } from './AnimatedNumber'

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
}

describe('AnimatedNumber', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); setHidden(false) })

  it('affiche la cible SANS animer quand l’onglet est masqué', () => {
    setHidden(false)
    const { rerender } = render(<AnimatedNumber value={100} format={(n) => String(Math.round(n))} />)
    setHidden(true)
    rerender(<AnimatedNumber value={900} format={(n) => String(Math.round(n))} />)
    // Aucune frame ne battra : la valeur doit être posée d'emblée, pas interpolée.
    expect(screen.getByText('900')).toBeTruthy()
  })

  it('atterrit sur sa cible même si les frames cessent en cours de route', () => {
    setHidden(false)
    // rAF muet : la première frame ne vient jamais — l'onglet est passé en arrière-plan
    // juste après le changement de valeur.
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as unknown as number)
    const { rerender } = render(<AnimatedNumber value={100} format={(n) => String(Math.round(n))} />)
    rerender(<AnimatedNumber value={900} format={(n) => String(Math.round(n))} />)
    expect(screen.queryByText('900')).toBeNull()
    // Le filet de sécurité (un timer, throttlé mais jamais gelé) pose la cible.
    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByText('900')).toBeTruthy()
    raf.mockRestore()
  })
})
