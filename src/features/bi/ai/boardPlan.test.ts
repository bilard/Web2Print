// ⚠⚠ Ce que ces tests protègent : un tableau généré qui répond à côté de la question. Un
// modèle qui invente un nom de mesure ne doit JAMAIS voir sa tuile repliée sur « la première
// mesure venue » — l'écran afficherait alors des chiffres justes sur le mauvais sujet.
import { describe, it, expect } from 'vitest'
import { planToBoard, type BoardPlan } from './boardPlan'
import type { DataSource } from '../registry/types'

const source: DataSource = {
  id: 'watch.summary', labelKey: 'bi.source.watchSummary', engine: 'client',
  dimensions: [
    { id: 'domain', labelKey: 'bi.dim.competitor', kind: 'text', get: (r) => r.domain },
  ],
  measures: [
    { id: 'watch.matched', labelKey: 'bi.measure.watchMatched', format: 'int', aggregable: true,
      compute: () => 0 },
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true, compute: () => 0 },
  ],
}

const plan = (tiles: BoardPlan['tiles']): BoardPlan => ({ name: 'Veille', tiles })
const id = (i: number) => `t${i}`

describe('plan → tableau de bord', () => {
  it('écarte une tuile dont la mesure n’existe pas, et le DIT', () => {
    const r = planToBoard(plan([
      { kind: 'kpi', title: 'Total', measure: 'watch.inventé' },
      { kind: 'kpi', title: 'Appariés', measure: 'watch.matched' },
    ]), source, 'watch.summary', id)
    expect(r.tiles).toHaveLength(1)
    expect(r.tiles[0].title).toBe('Appariés')
    expect(r.rejected[0]).toContain('watch.inventé')
  })

  it('écarte un graphe dont la dimension n’existe pas', () => {
    const r = planToBoard(plan([
      { kind: 'bar', title: 'Par famille', measure: 'count', dimension: 'famille' },
    ]), source, 'watch.summary', id)
    expect(r.tiles).toHaveLength(0)
    expect(r.rejected[0]).toContain('famille')
  })

  it('n’attache JAMAIS de dimension à un indicateur', () => {
    // Une dimension sur un KPI afficherait la première ligne d'un regroupement — un chiffre
    // faux, présenté comme un total.
    const r = planToBoard(plan([
      { kind: 'kpi', title: 'Total', measure: 'count', dimension: 'domain' },
    ]), source, 'watch.summary', id)
    expect(r.tiles[0].query.dimensions).toEqual([])
  })

  it('trie un graphe sur ce qu’il MESURE, et respecte le plafond demandé', () => {
    const r = planToBoard(plan([
      { kind: 'bar', title: 'Top', measure: 'count', dimension: 'domain', limit: 10 },
    ]), source, 'watch.summary', id)
    expect(r.tiles[0].query.sort).toEqual([{ by: 'count', dir: 'desc' }])
    expect(r.tiles[0].query.limit).toBe(10)
  })

  it('range les tuiles sans jamais en superposer deux', () => {
    const r = planToBoard(plan([
      { kind: 'kpi', title: 'A', measure: 'count' },
      { kind: 'kpi', title: 'B', measure: 'count' },
      { kind: 'kpi', title: 'C', measure: 'count' },
      { kind: 'kpi', title: 'D', measure: 'count' },
      { kind: 'bar', title: 'E', measure: 'count', dimension: 'domain' },
      { kind: 'bar', title: 'F', measure: 'count', dimension: 'domain' },
    ]), source, 'watch.summary', id)
    // Quatre indicateurs de 3 colonnes tiennent sur une ligne ; les barres passent dessous.
    expect(r.layout.slice(0, 4).map((l) => l.x)).toEqual([0, 3, 6, 9])
    expect(r.layout.slice(0, 4).every((l) => l.y === 0)).toBe(true)
    expect(r.layout[4].y).toBeGreaterThan(0)
    const boxes = r.layout.map((l) => `${l.x},${l.y}`)
    expect(new Set(boxes).size).toBe(boxes.length)
  })

  it('donne un nom au tableau même si le modèle l’a laissé vide', () => {
    const r = planToBoard({ name: '   ', tiles: [{ kind: 'kpi', title: '', measure: 'count' }] },
      source, 'watch.summary', id)
    expect(r.name).toBe('Sans titre')
    // Une tuile sans titre porte au moins le nom de sa mesure : un cadre anonyme ne se lit pas.
    expect(r.tiles[0].title).toBe('count')
  })
})
