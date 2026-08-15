// ⚠⚠ Ce que ces tests protègent : un menu MUET. Le sélecteur s'ancre dans un bandeau haut
// de 48 px ; posé dans un conteneur à `overflow` caché, son panneau est tranché net et le
// clic ne montre rien — relevé en prod, sur les deux sélecteurs du bandeau à la fois.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BiPicker } from './BiPicker'

const options = [
  { id: 'a', label: 'Veille — synthèse par concurrent' },
  { id: 'b', label: 'Veille — catalogue source' },
]

describe('BiPicker', () => {
  it('ouvre son panneau au clic, et le referme au second', () => {
    render(<BiPicker label="Source" value="a" options={options} onChange={vi.fn()} />)
    const button = screen.getByRole('button')
    expect(screen.queryByText('Veille — catalogue source')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByText('Veille — catalogue source')).toBeTruthy()
    fireEvent.click(button)
    expect(screen.queryByText('Veille — catalogue source')).toBeNull()
  })

  it('rapporte le choix, et referme', () => {
    const onChange = vi.fn()
    render(<BiPicker label="Source" value="a" options={options} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Veille — catalogue source'))
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByText('Veille — catalogue source')).toBeNull()
  })

  it('⚠⚠ son panneau n’est JAMAIS enfermé dans un conteneur qui le rogne', () => {
    // Le panneau est `absolute` : le moindre `overflow` caché sur un ancêtre le tranche.
    // Le seul défilement admis est celui de la LISTE elle-même, à l'intérieur du panneau.
    const { container } = render(
      <BiPicker label="Source" value="a" options={options} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const panel = container.querySelector('.absolute')!
    for (let el = panel.parentElement; el && el !== container; el = el.parentElement) {
      expect(el.className).not.toMatch(/overflow-(hidden|x-auto|y-hidden|auto)/)
    }
  })
})
