// src/features/export/declineLayout.test.ts
import { describe, it, expect } from 'vitest'
import { projectObjectsToFormat, scaleMergeGeometry } from './declineLayout'

describe('scaleMergeGeometry', () => {
  it('supprime les ancrages positionnels et met à l’échelle les zones', () => {
    const out = scaleMergeGeometry(
      { mergeBaseTop: 100, mergeBaseHeight: 40, fitZone: { width: 200, height: 50, maxLines: 2 }, autoFitWidth: 80, templateText: '{{x}}' },
      2,
    ) as Record<string, unknown>
    expect(out.mergeBaseTop).toBeUndefined()
    expect(out.mergeBaseHeight).toBeUndefined()
    expect(out.fitZone).toEqual({ width: 400, height: 100, maxLines: 2 })
    expect(out.autoFitWidth).toBe(160)
    expect(out.templateText).toBe('{{x}}') // champs non concernés préservés
  })

  it('renvoie la valeur d’origine si aucun champ de fusion', () => {
    const data = { role: 'photo', id: 'a' }
    expect(scaleMergeGeometry(data, 3)).toBe(data)
    expect(scaleMergeGeometry(undefined, 2)).toBeUndefined()
  })

  it('appliqué par projectObjectsToFormat (cover) : ancrage purgé, zone scalée', () => {
    const [o] = projectObjectsToFormat(
      [{ left: 0, top: 0, data: { mergeBaseTop: 10, fitZone: { width: 100, height: 20 } } }],
      1000, 1000, 2000, 2000, 'cover',
    )
    const d = o.data as Record<string, unknown>
    expect(d.mergeBaseTop).toBeUndefined()
    expect((d.fitZone as { width: number }).width).toBe(200) // cover s=2
  })
})

describe('projectObjectsToFormat', () => {
  it('scale « contain » + centrage vertical sur un cadre plus haut (carré → story)', () => {
    // Source 1000×1000, cible 1000×2000 → s = 1, bande haute/basse de 500.
    const [o] = projectObjectsToFormat(
      [{ left: 100, top: 100, scaleX: 1, scaleY: 1 }],
      1000,
      1000,
      1000,
      2000,
    )
    expect(o.scaleX).toBe(1)
    expect(o.left).toBe(100) // pas d'offset horizontal
    expect(o.top).toBe(600) // 100*1 + (2000-1000)/2
  })

  it('réduit et centre horizontalement quand la cible est plus large (carré → bannière)', () => {
    // Source 1000×1000, cible 1500×500 → s = 0.5, largeur projetée 500, offsetX 500.
    const [o] = projectObjectsToFormat(
      [{ left: 200, top: 200, scaleX: 2, scaleY: 2 }],
      1000,
      1000,
      1500,
      500,
    )
    expect(o.scaleX).toBe(1) // 2 * 0.5
    expect(o.scaleY).toBe(1)
    expect(o.left).toBe(600) // 200*0.5 + (1500-500)/2
    expect(o.top).toBe(100) // 200*0.5 + (500-500)/2
  })

  it('mode « cover » : remplit le cadre plus haut (overscale + recadrage), composition préservée', () => {
    // Source 1000×1000, cible 1000×2000 → cover s = max(1, 2) = 2.
    // largeur projetée 2000 (déborde de 1000 → offsetX = (1000-2000)/2 = -500),
    // hauteur projetée 2000 = cible (offsetY = 0).
    const [o] = projectObjectsToFormat(
      [{ left: 100, top: 100, scaleX: 1, scaleY: 1 }],
      1000,
      1000,
      1000,
      2000,
      'cover',
    )
    expect(o.scaleX).toBe(2)
    expect(o.scaleY).toBe(2)
    expect(o.left).toBe(-300) // 100*2 + (1000-2000)/2
    expect(o.top).toBe(200) // 100*2 + (2000-2000)/2
  })

  it('mode « cover » identique à « contain » quand le ratio est conservé (mise à l’échelle uniforme)', () => {
    // Même ratio 1:1, source 1000×1000 → cible 500×500 : s = 0.5 dans les deux modes.
    const [cover] = projectObjectsToFormat([{ left: 100, top: 100, scaleX: 1, scaleY: 1 }], 1000, 1000, 500, 500, 'cover')
    const [contain] = projectObjectsToFormat([{ left: 100, top: 100, scaleX: 1, scaleY: 1 }], 1000, 1000, 500, 500, 'contain')
    expect(cover.scaleX).toBe(0.5)
    expect(cover.left).toBe(contain.left)
    expect(cover.top).toBe(contain.top)
  })

  it('préserve les autres champs et ne mute pas la source', () => {
    const src = [{ left: 0, top: 0, fill: '#abc', data: { id: 'x' } }]
    const [o] = projectObjectsToFormat(src, 800, 600, 400, 300)
    expect(o.fill).toBe('#abc')
    expect(o.data).toEqual({ id: 'x' })
    expect(src[0].left).toBe(0) // source intacte
  })

  it('dimensions source invalides → copie sans transformer', () => {
    const out = projectObjectsToFormat([{ left: 10, top: 10 }], 0, 0, 100, 100)
    expect(out[0].left).toBe(10)
  })
})
