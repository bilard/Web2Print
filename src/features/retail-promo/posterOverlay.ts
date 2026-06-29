import { Textbox, Shadow } from 'fabric'
import type { Canvas } from 'fabric'
import { syncToStore } from '@/features/editor/useAddObject'
import type { ConditionalRule } from '@/features/merge/conditionalRules'

// Ombre forte = lisibilité du texte par-dessus l'affiche NB2 (fond travaillé).
const leg = () => new Shadow({ color: 'rgba(0,0,0,0.65)', blur: 10, offsetX: 0, offsetY: 2 })

/**
 * Pose UNIQUEMENT les données éditables (nom / prix / -X%) en texte net sur des
 * zones fixes par-dessus une affiche entièrement designée par NB2 (le décor,
 * la pastille et le cartouche sont dans l'image de fond). Aucun rectangle dessiné.
 */
export function instantiatePosterOverlay(canvas: Canvas, W: number, H: number): void {
  const ts = Date.now()

  const name = new Textbox('{{promo_name}}', {
    left: W * 0.08, top: H * 0.05, width: W * 0.84,
    fontSize: H * 0.05, fontWeight: '700', textAlign: 'center',
    fill: '#ffffff', fontFamily: 'Montserrat', lineHeight: 1.05, shadow: leg(), scaleX: 1,
  })
  name.set('data', { id: `ov_name_${ts}`, type: 'promo-overlay', templateText: '{{promo_name}}' })

  const discRules: ConditionalRule[] = [
    { id: 'ov-disc-hide', field: 'promo_remiseLabel', operator: 'isEmpty', action: { type: 'hide' } },
  ]
  const disc = new Textbox('-00%', {
    left: W * 0.6, top: H * 0.12, width: W * 0.34,
    fontSize: H * 0.075, fontWeight: '700', textAlign: 'center',
    fill: '#ffffff', fontFamily: 'Oswald', shadow: leg(), scaleX: 1,
  })
  disc.set('data', { id: `ov_disc_${ts}`, type: 'promo-overlay', templateText: '{{promo_remiseLabel}}', conditionalRules: discRules })

  const wasRules: ConditionalRule[] = [
    { id: 'ov-was-hide', field: 'promo_oldPrice', operator: 'isEmpty', action: { type: 'hide' } },
  ]
  const was = new Textbox('00,00 €', {
    left: W * 0.1, top: H * 0.79, width: W * 0.8,
    fontSize: H * 0.032, textAlign: 'center',
    fill: 'rgba(255,255,255,0.85)', fontFamily: 'Montserrat', linethrough: true, shadow: leg(), scaleX: 1,
  })
  was.set('data', { id: `ov_was_${ts}`, type: 'promo-overlay', templateText: '{{promo_priceWas}}', conditionalRules: wasRules })

  const now = new Textbox('00,00 €', {
    left: W * 0.1, top: H * 0.83, width: W * 0.8,
    fontSize: H * 0.09, fontWeight: '700', textAlign: 'center',
    fill: '#ffffff', fontFamily: 'Oswald', lineHeight: 1.0, shadow: leg(), scaleX: 1,
  })
  now.set('data', { id: `ov_now_${ts}`, type: 'promo-overlay', templateText: '{{promo_priceNow}}' })

  for (const o of [name, disc, was, now]) {
    o.set({ originX: 'left', originY: 'top' })
    canvas.add(o)
  }
  canvas.requestRenderAll()
  syncToStore(canvas)
}
