import { describe, it, expect } from 'vitest'
import { buildResultPanels } from './classifyResult'
import { buildDashboard } from './buildDashboard'
import type { Workflow } from '../types'

const sheet = {
  name: 'Comparaison',
  columns: [
    { key: 'produit', label: 'Produit' },
    { key: 'prix_a', label: 'Prix A' },
    { key: 'prix_b', label: 'Prix B' },
  ],
  rows: [
    { produit: 'Tondeuse', prix_a: '409', prix_b: '399,9' },
    { produit: 'Sécateur', prix_a: '30.99', prix_b: '29' },
  ],
}

function wf(nodes: { id: string; type: string }[], edges: { source: string; target: string }[]): Workflow {
  return {
    id: 'w1', schemaVersion: 1, name: 'Veille', description: '', ownerId: 'u',
    createdAt: 0, updatedAt: 0,
    nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 }, config: {} })),
    edges: edges.map((e, i) => ({ id: `e${i}`, source: e.source, sourceHandle: 'out', target: e.target, targetHandle: 'in' })),
  }
}

describe('buildResultPanels', () => {
  it('terminal = export (puits) → remonte la sheet amont en dashboard, puis le document', () => {
    const w = wf(
      [{ id: 'cmp', type: 'compare-prices' }, { id: 'exp', type: 'gsheets-export' }],
      [{ source: 'cmp', target: 'exp' }],
    )
    const outputs = {
      cmp: { sheet },
      exp: { result: { url: 'https://docs.google.com/x', filename: 'veille.gsheet' } },
    }
    const panels = buildResultPanels(w, outputs)
    expect(panels.map((p) => p.kind)).toEqual(['dashboard', 'document'])
    expect(panels[0].nodeId).toBe('cmp')
    expect(panels[1].nodeId).toBe('exp')
  })

  it('sheet texte pur → table (pas dashboard)', () => {
    const w = wf([{ id: 'n', type: 'x' }], [])
    const panels = buildResultPanels(w, { n: { sheet: { columns: [{ key: 'a' }], rows: [{ a: 'x' }, { a: 'y' }] } } })
    expect(panels).toHaveLength(1)
    expect(panels[0].kind).toBe('table')
  })

  it('galerie d’assets détectée', () => {
    const w = wf([{ id: 'g', type: 'gen' }], [])
    const panels = buildResultPanels(w, { g: { assets: [{ url: 'blob:1', type: 'image' }] } })
    expect(panels[0].kind).toBe('gallery')
  })
})

describe('buildDashboard', () => {
  it('KPI + graphe : X catégoriel, séries numériques', () => {
    const dash = buildDashboard(sheet)
    expect(dash.kpis[0]).toEqual({ label: 'Lignes', value: '2' })
    expect(dash.kpis.length).toBe(3) // Lignes + Prix A + Prix B
    expect(dash.charts).toHaveLength(1)
    expect(dash.charts[0].labels).toEqual(['Tondeuse', 'Sécateur'])
    expect(dash.charts[0].datasets[0].data).toEqual([409, 30.99])
    expect(dash.charts[0].datasets[1].data).toEqual([399.9, 29])
  })

  it('sheet sans colonne numérique → aucun graphe', () => {
    const dash = buildDashboard({ columns: [{ key: 'nom', label: 'Nom' }], rows: [{ nom: 'a' }, { nom: 'b' }] })
    expect(dash.charts).toHaveLength(0)
    expect(dash.kpis).toEqual([{ label: 'Lignes', value: '2' }])
  })

  it('EAN exclu des séries et des KPI (identifiant, pas une valeur)', () => {
    const withEan = {
      columns: [
        { key: 'ean', label: 'EAN' },
        { key: 'produit', label: 'Produit' },
        { key: 'prix_source', label: 'Prix source' },
      ],
      rows: [
        { ean: '4892210171948', produit: 'Tondeuse', prix_source: '409' },
        { ean: '5098017261215', produit: 'Sécateur', prix_source: '30.99' },
      ],
    }
    const dash = buildDashboard(withEan)
    // KPI : Lignes + Prix source uniquement (PAS d'EAN à 5e12).
    expect(dash.kpis.map((k) => k.label)).toEqual(['Lignes', 'Prix source (moy.)'])
    // Graphe : X = produit, série = prix uniquement (pas l'EAN).
    expect(dash.charts[0].labels).toEqual(['Tondeuse', 'Sécateur'])
    expect(dash.charts[0].datasets.map((d) => d.label)).toEqual(['Prix source'])
  })
})
