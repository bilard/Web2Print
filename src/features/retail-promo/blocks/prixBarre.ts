import { Group, Rect, Textbox, Shadow } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

// La règle masque uniquement le texte barré (WAS) — le NOW reste toujours affiché.
// Portée : child-level (prixWas.data.conditionalRules).
// applyConditionalRulesForRow parcourt collectObjectsDeep → le child voit ses règles.
const wasRule: ConditionalRule = {
  id: 'prix-barre-was-hide',
  field: 'promo_oldPrice',
  operator: 'isEmpty',
  action: { type: 'hide' },
}

const rules: ConditionalRule[] = [wasRule]

const def: PromoBlockDef = {
  id: 'prix-barre',
  label: 'Prix barré + prix actuel',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    // Carte prix : pavé navy arrondi + ombre portée.
    const card = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: Math.min(20, h * 0.12),
      ry: Math.min(20, h * 0.12),
      fill: palette.primary,
      shadow: new Shadow({ color: 'rgba(15,23,42,0.28)', blur: 22, offsetX: 0, offsetY: 10 }),
    })

    // Kicker « PRIX PROMO » (accent, lettré).
    const kicker = new Textbox('PRIX PROMO', {
      left: x,
      top: y + h * 0.08,
      width: w,
      fontSize: h * 0.1,
      fontWeight: '700',
      textAlign: 'center',
      charSpacing: 300,
      fill: '#a5b4fc',
      fontFamily,
      scaleX: 1,
    })

    // Ancien prix barré, discret.
    const prixWas = new Textbox('00,00 €', {
      left: x,
      top: y + h * 0.32,
      width: w,
      fontSize: h * 0.13,
      textAlign: 'center',
      fill: 'rgba(255,255,255,0.55)',
      fontFamily,
      scaleX: 1,
      linethrough: true,
    })
    // Échantillon court au build (token {{}} insécable déborderait la box) ;
    // la fusion résout via data.templateText.
    prixWas.data = { templateText: '{{promo_priceWas}}', conditionalRules: [wasRule] }

    // Prix choc, police d'affichage condensée Oswald.
    const prixNow = new Textbox('00,00 €', {
      left: x,
      top: y + h * 0.5,
      width: w,
      fontSize: h * 0.34,
      fontWeight: '700',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily: 'Oswald',
      lineHeight: 1.0,
      scaleX: 1,
    })
    prixNow.data = { templateText: '{{promo_priceNow}}' }

    const g = new Group([card, kicker, prixWas, prixNow], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_prix-barre_${Date.now()}`,
      type: 'promo-block',
      blockId: 'prix-barre',
    }
    return g
  },
}

registerPromoBlock(def)
