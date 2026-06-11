import { describe, it, expect } from 'vitest'
import { SERVER_CATALOG, validateServerGraph, layoutServerGraph, type RawGraph } from './promptToFlowServer'
import { getServerNode } from './registry'
import { SERVER_UNSUPPORTED } from './nodes/index'
import './nodes/index'

describe('SERVER_CATALOG — cohérence avec le registre serveur', () => {
  it.each(SERVER_CATALOG.map((c) => [c.type] as const))('%s est exécutable côté serveur', (type) => {
    expect(SERVER_UNSUPPORTED.has(type), `${type} est dans SERVER_UNSUPPORTED`).toBe(false)
    // cron/text-input sont gérés spécialement par l'executor ; les autres doivent être enregistrés.
    if (type !== 'cron') {
      expect(getServerNode(type), `${type} absent du registre serveur`).toBeDefined()
    }
  })
})

describe('validateServerGraph', () => {
  const raw = (over: Partial<RawGraph> = {}): RawGraph => ({
    title: 'Test',
    summary: '',
    nodes: [
      { ref: 'n1', type: 'scrape-url', config: [{ key: 'urls', value: 'https://ex.com' }] },
      { ref: 'n2', type: 'send-telegram', config: [{ key: 'text', value: 'ok {{title}}' }, { key: 'iterate', value: 'true' }] },
    ],
    edges: [{ from: 'n1', fromPort: 'sheet', to: 'n2', toPort: 'data' }],
    ...over,
  })

  it('matérialise un graphe valide (config mergée + coercition booléenne)', () => {
    const v = validateServerGraph(raw(), 1000)
    expect(v.errors).toEqual([])
    expect(v.nodes).toHaveLength(2)
    expect(v.edges).toHaveLength(1)
    const tg = v.nodes[1].config as { text?: string; iterate?: boolean; parseMode?: string }
    expect(tg.text).toBe('ok {{title}}')
    expect(tg.iterate).toBe(true)
    expect(tg.parseMode).toBe('none') // défaut conservé
  })

  it('rejette types inconnus, ports absents et types incompatibles', () => {
    const v = validateServerGraph(
      raw({
        nodes: [
          { ref: 'n1', type: 'export-pdf' },
          { ref: 'n2', type: 'scrape-url' },
          { ref: 'n3', type: 'save-pim' },
        ],
        edges: [
          { from: 'n2', fromPort: 'inexistant', to: 'n3', toPort: 'sheet' },
          { from: 'n1', fromPort: 'x', to: 'n3', toPort: 'sheet' },
        ],
      }),
      1000,
    )
    expect(v.errors.some((e) => e.includes('export-pdf'))).toBe(true)
    expect(v.errors.some((e) => e.includes('inexistant'))).toBe(true)
    // save-pim a une entrée requise non connectée → warning d'erreur listé
    expect(v.errors.some((e) => e.includes('Entrée requise'))).toBe(true)
  })

  it('layout en couches gauche→droite', () => {
    const v = validateServerGraph(raw(), 1000)
    const pos = layoutServerGraph(v.nodes, v.edges)
    expect(pos[v.nodes[0].id].x).toBe(0)
    expect(pos[v.nodes[1].id].x).toBe(320)
  })
})
