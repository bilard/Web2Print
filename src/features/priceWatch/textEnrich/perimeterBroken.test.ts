import { describe, it, expect } from 'vitest'
import { perimeterBroken } from './perimeterBroken'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

const p = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'x', name: 'Abdeckung', ...over,
} as SourceProduct)

const rev = (over: Partial<TextRevision> = {}): TextRevision => ({ productId: 'x', at: 0, ...over })

// Les deux fiches vues en production le 2026-08-10, écrites AVANT la garde.
const SRC = '"Original STIHL Ersatzteil passend für z.B.: STIHL Trennschleifer: TS 410, TS 420, '
  + 'TS 500I Zur genauen Bestimmung des Ersatzteils, verwenden Sie bitte die Original-'
  + 'Ersatzteilzeichnungen des entsprechenden Herstellers! ( 0000-036-0200, 0000 036 0200 )"'

describe('perimeterBroken', () => {
  it('reconnaît une liste ABRÉGÉE par une ellipse', () => {
    expect(perimeterBroken(p(), rev({
      byColumn: { TEXT_VENTE: {
        before: 'Compatible MB 545.0 T, MB 650.0 KS, MB 650.0 T, MB 655.0 G, MB 655.0 VM.',
        after: 'Compatible avec les tondeuses VIKING : MB 545.0 T, MB 650.0 KS…',
      } },
    }))).toBe(true)
  })

  it('reconnaît des références PERDUES sur la réécriture de l’écran', () => {
    expect(perimeterBroken(p(), rev({
      descriptionSource: SRC,
      description: 'Bague d’origine STIHL, compatible avec les tronçonneuses à disque STIHL '
        + 'TS 410, TS 420 et TS 500I. Pour une identification précise, utilisez les schémas.',
    }))).toBe(true)
  })

  it('laisse tranquille une réécriture ISOPÉRIMÈTRE', () => {
    expect(perimeterBroken(p(), rev({
      descriptionSource: SRC,
      description: 'Pièce d’origine STIHL pour tronçonneuses à disque STIHL TS 410, TS 420 et '
        + 'TS 500I. Utilisez les schémas de pièces détachées d’origine du fabricant et '
        + 'respectez les consignes de montage. Références : 0000-036-0200, 0000 036 0200.',
    }))).toBe(false)
  })

  // ⚠ Sinon une synthèse volontaire retournerait en file à CHAQUE passage, pour toujours.
  it('laisse tranquille une SYNTHÈSE assumée, bien plus courte', () => {
    expect(perimeterBroken(p(), rev({
      byColumn: { DESCRIPTION: { before: SRC, after: 'Bague STIHL 0000-036-0200' } },
    }))).toBe(false)
  })

  it('ne dit rien sans révision', () => {
    expect(perimeterBroken(p())).toBe(false)
  })
})
