import { describe, expect, it } from 'vitest'
import { drawCropMarks, type MarkCanvas } from './cropMarks'

function fake(): { pdf: MarkCanvas; lines: number[][] } {
  const lines: number[][] = []
  return { lines, pdf: { setDrawColor: () => {}, setLineWidth: () => {}, line: (...a: number[]) => { lines.push(a) } } as MarkCanvas }
}

describe('drawCropMarks', () => {
  it('trace 8 traits (2 par coin) dans la marge de fond perdu', () => {
    const { pdf, lines } = fake()
    drawCropMarks(pdf, 210, 297, 3)
    expect(lines).toHaveLength(8)
    // Trait horizontal du coin haut-gauche : de x=0 à x=bleed-gap (2), à y=bleed (3).
    expect(lines).toContainEqual([0, 3, 2, 3])
    // Trait vertical du coin bas-droit : x = bleed+w (213), de y = bleed+h+gap (301) à y = pageH (303).
    expect(lines).toContainEqual([213, 301, 213, 303])
  })
  it('fond perdu nul ou trop petit → aucun trait', () => {
    const { pdf, lines } = fake()
    drawCropMarks(pdf, 210, 297, 0)
    drawCropMarks(pdf, 210, 297, 0.5)
    expect(lines).toHaveLength(0)
  })
})
