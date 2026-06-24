import { describe, it, expect } from 'vitest'
import { autoFitPlaceholderWidth } from './useDataMerge'

/**
 * Faux Textbox minimal : on pilote le wrapping via `lineCount` pour tester la
 * DÉCISION du helper sans dépendre de la mesure de texte (indispo en jsdom).
 */
function makeTextbox(opts: {
  width: number
  lineCount: number
  contentWidth: number
  data?: Record<string, unknown>
}) {
  const tb: Record<string, unknown> = {
    width: opts.width,
    scaleX: 1,
    scaleY: 1,
    data: opts.data ?? {},
    _textLines: Array.from({ length: opts.lineCount }),
    set(patch: Record<string, number>) {
      Object.assign(this, patch)
    },
    initDimensions() {},
    calcTextWidth() {
      return opts.contentWidth
    },
    setCoords() {},
  }
  return tb as unknown as Parameters<typeof autoFitPlaceholderWidth>[0]
}

describe('autoFitPlaceholderWidth', () => {
  it('rétrécit la largeur au contenu quand la valeur tient sur une seule ligne', () => {
    const tb = makeTextbox({ width: 300, lineCount: 1, contentWidth: 120 })
    autoFitPlaceholderWidth(tb)
    expect((tb as any).width).toBe(120)
    expect((tb as any).data.autoFitWidth).toBe(120)
    expect((tb as any).data.originalWidth).toBe(300)
  })

  it('garde le cadre fixe (pas de rétrécissement) quand la valeur se replie sur plusieurs lignes', () => {
    const tb = makeTextbox({ width: 300, lineCount: 2, contentWidth: 180 })
    autoFitPlaceholderWidth(tb)
    // largeur ramenée au cadre d'origine, jamais à la ligne wrappée la plus longue
    expect((tb as any).width).toBe(300)
    expect((tb as any).data.autoFitWidth).toBeUndefined()
  })

  it('mesure au cadre d\'origine persisté plutôt qu\'à la largeur courante (auto-guérison après rechargement)', () => {
    // Bloc déjà rétréci (width 180) mais cadre d'origine connu (300) → multi-ligne → restauré à 300
    const tb = makeTextbox({
      width: 180,
      lineCount: 2,
      contentWidth: 140,
      data: { originalWidth: 300, autoFitWidth: 180 },
    })
    autoFitPlaceholderWidth(tb)
    expect((tb as any).width).toBe(300)
    expect((tb as any).data.autoFitWidth).toBeUndefined()
  })
})
