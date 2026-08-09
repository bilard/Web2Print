import { describe, it, expect, beforeEach } from 'vitest'
import { useLocaleStore } from '@/stores/locale.store'
import { validateWorkflow } from './validateWorkflow'
import type { Workflow, NodeSpec } from '../types'

// Ces tests assertent sur le TEXTE des messages, qui est désormais traduit. La
// langue est un état GLOBAL (dérivée de `navigator.language` sous jsdom, donc
// « en ») : sans l'épingler, les assertions françaises échouent pour une raison
// qui n'a rien à voir avec la validation. Cf. la règle du chantier i18n : un test
// ne doit jamais dépendre de la locale ambiante.
beforeEach(() => useLocaleStore.setState({ locale: 'fr' }))

const spec = (over: Partial<NodeSpec>): NodeSpec => ({
  type: 't', category: 'import', labelKey: 'node.upload.label', icon: (() => null) as unknown as NodeSpec['icon'],
  inputs: [], outputs: [], configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async () => ({}), ...over,
})

const REG: Record<string, NodeSpec> = {
  upload: spec({ type: 'upload', labelKey: 'node.upload.label' }),
  compare: spec({
    type: 'compare', labelKey: 'node.upload.label',
    inputs: [{ name: 'products', type: 'sheet', required: true }, { name: 'harvest', type: 'any' }],
    configSchema: [{ name: 'sites', kind: 'textarea', label: 'Sites concurrents', required: true }],
  }),
  export: spec({ type: 'export', labelKey: 'node.upload.label', inputs: [{ name: 'sheet', type: 'sheet', required: true }] }),
  // Producteurs de feuille : de quoi câbler une entrée orpheline — ou refuser de choisir.
  source: spec({ type: 'source', labelKey: 'node.upload.label', outputs: [{ name: 'sheet', type: 'sheet' }] }),
  source2: spec({ type: 'source2', labelKey: 'node.upload.label', outputs: [{ name: 'sheet', type: 'sheet' }] }),
  'text-enrich': spec({
    type: 'text-enrich', labelKey: 'node.upload.label',
    inputs: [{ name: 'sheet', type: 'sheet' }],
    configSchema: [{ name: 'projectId', kind: 'text', label: 'Projet PIM' }],
  }),
}
const getSpec = (t: string) => REG[t]

const wf = (over: Partial<Workflow>): Workflow => ({
  id: 'w', schemaVersion: 1 as Workflow['schemaVersion'], name: 'W', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes: [], edges: [], ...over,
})

const node = (id: string, type: string, config: unknown = {}) => ({ id, type, position: { x: 0, y: 0 }, config })
const edge = (s: string, sh: string, t: string, th: string) => ({ id: `${s}-${t}`, source: s, sourceHandle: sh, target: t, targetHandle: th })

describe('validateWorkflow', () => {
  it('signale une entrée requise non connectée + config requise vide', () => {
    const w = wf({ nodes: [node('c', 'compare', { sites: '' })], edges: [edge('c', 'x', 'c', 'x')] })
    const issues = validateWorkflow(w, getSpec)
    expect(issues.some((i) => /products.*non connect/i.test(i.message))).toBe(true)
    expect(issues.some((i) => /Sites concurrents.*non renseigné/i.test(i.message))).toBe(true)
  })

  it('ne signale rien quand tout est connecté et renseigné', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: 'k' }), node('c', 'compare', { sites: 'a.com' }), node('e', 'export')],
      edges: [edge('u', 'sheet', 'c', 'products'), edge('c', 'matrix', 'e', 'sheet')],
    })
    expect(validateWorkflow(w, getSpec)).toEqual([])
  })

  it('détecte « Upload sans fichier » (contrôle sémantique)', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: '' }), node('e', 'export')],
      edges: [edge('u', 'sheet', 'e', 'sheet')],
    })
    const issues = validateWorkflow(w, getSpec)
    expect(issues.find((i) => i.nodeId === 'u')?.message).toMatch(/fichier/i)
  })

  it('ignore les nodes orphelins quand le graphe a des liens', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: 'k' }), node('c', 'compare', { sites: '' }), node('orphan', 'export')],
      edges: [edge('u', 'sheet', 'c', 'products')],
    })
    // 'orphan' (export sans lien) n'est pas exécuté → pas signalé ; 'c' a sites vide → signalé.
    const issues = validateWorkflow(w, getSpec)
    expect(issues.some((i) => i.nodeId === 'orphan')).toBe(false)
    expect(issues.some((i) => i.nodeId === 'c')).toBe(true)
  })

  it('signale un type de node inconnu', () => {
    const w = wf({ nodes: [node('z', 'inexistant')], edges: [] })
    expect(validateWorkflow(w, getSpec)[0].message).toMatch(/inconnu/i)
  })

  describe('sites via port OU config (Sites sources)', () => {
    const REG2: Record<string, NodeSpec> = {
      ...REG,
      'source-sites': spec({ type: 'source-sites', labelKey: 'node.upload.label', outputs: [{ name: 'sites', type: 'sites' }] }),
      'harvest-competitor': spec({
        type: 'harvest-competitor', labelKey: 'node.upload.label',
        inputs: [{ name: 'sites', type: 'sites' }],
        configSchema: [{ name: 'sites', kind: 'textarea', label: 'Sites concurrents' }],
      }),
    }
    const getSpec2 = (t: string) => REG2[t]

    it('harvest sans textarea NI port branché → erreur', () => {
      const w = wf({ nodes: [node('h', 'harvest-competitor', { sites: '' })], edges: [] })
      expect(validateWorkflow(w, getSpec2).find((i) => i.nodeId === 'h')?.message).toMatch(/Sites sources/)
    })

    it('harvest avec port sites branché et textarea vide → OK', () => {
      const w = wf({
        nodes: [node('s', 'source-sites', { sites: [{ domain: 'a.fr', enabled: true }] }), node('h', 'harvest-competitor', { sites: '' })],
        edges: [edge('s', 'sites', 'h', 'sites')],
      })
      expect(validateWorkflow(w, getSpec2)).toEqual([])
    })

    it('source-sites sans aucun site actif → erreur', () => {
      const w = wf({
        nodes: [node('s', 'source-sites', { sites: [{ domain: 'a.fr', enabled: false }] }), node('h', 'harvest-competitor', { sites: 'x.fr' })],
        edges: [edge('s', 'sites', 'h', 'sites')],
      })
      expect(validateWorkflow(w, getSpec2).find((i) => i.nodeId === 's')?.message).toMatch(/actif/i)
    })
  })
})

describe('cohérence ENTRE nodes (Veille tarifaire)', () => {
  const spec = (type: string, _label: string): NodeSpec => ({
    type, labelKey: 'node.upload.label',  category: 'utility', icon: (() => null) as never,
    inputs: [], outputs: [], configSchema: [], defaultConfig: {}, runtime: 'client',
    run: async () => ({}),
  })
  const SPECS: Record<string, NodeSpec> = {
    'harvest-competitor': spec('harvest-competitor', 'Moisson concurrents'),
    'compare-catalog': spec('compare-catalog', 'Comparer catalogue'),
    'source-sites': spec('source-sites', 'Sites sources'),
  }
  const getSpec = (t: string) => SPECS[t]
  const wf = (nodes: { id: string; type: string; config?: Record<string, unknown> }[], edges: [string, string, string?][]): Workflow => ({
    id: 'wfF1', schemaVersion: 1, name: 'F1', description: '', ownerId: 'u',
    createdAt: 0, updatedAt: 0,
    nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 }, config: n.config ?? {} })) as Workflow['nodes'],
    edges: edges.map(([source, target, targetHandle], i) => ({
      id: `e${i}`, source, sourceHandle: 'out', target, targetHandle: targetHandle ?? 'in',
    })),
  })

  it('DEUX suivis dans le même workflow : la moisson écrit où le comparatif ne lit pas', () => {
    // Divergence réaliste : un node renommé, l'autre oublié.
    const issues = validateWorkflow(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1 Pro', sites: 'x.fr' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1 Pro 2026', sites: 'x.fr' } },
    ], [['h', 'c']]), getSpec)
    const errs = issues.filter((i) => i.severity === 'error')
    expect(errs).toHaveLength(2)
    expect(errs[0].message).toMatch(/0 apparié/)
  })

  it('casse et espaces ne divergent PAS (stableId normalise)', () => {
    const issues = validateWorkflow(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1 Pro', sites: 'x.fr' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'f1  PRO', sites: 'x.fr' } },
    ], [['h', 'c']]), getSpec)
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('même identifiant de suivi : aucune alerte croisée', () => {
    const issues = validateWorkflow(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1 Pro', sites: 'x.fr' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1 Pro', sites: 'x.fr' } },
    ], [['h', 'c']]), getSpec)
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('un « Sites sources » branché impose SON suivi aux deux nodes', () => {
    // Les watchId locaux DIVERGENT, mais le port `sites` les aligne : pas d'erreur.
    const issues = validateWorkflow(wf([
      { id: 's', type: 'source-sites', config: { watchId: 'F1 Pro', sites: [{ domain: 'x.fr', enabled: true }] } },
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'autre' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'encore-autre' } },
    ], [['s', 'h', 'sites'], ['s', 'c', 'sites'], ['h', 'c']]), getSpec)
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('comparatif NON branché derrière la moisson : avertit qu’il lira l’index précédent', () => {
    const issues = validateWorkflow(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1', sites: 'x.fr' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1', sites: 'x.fr' } },
      { id: 's', type: 'source-sites', config: { watchId: 'F1', sites: [{ domain: 'x.fr', enabled: true }] } },
    ], [['s', 'h', 'sites'], ['s', 'c', 'sites']]), getSpec)
    const warn = issues.filter((i) => i.severity === 'warning')
    expect(warn).toHaveLength(1)
    // L'avertissement porte sur le COLLECTEUR, pas sur le comparatif : c'est lui qu'il
    // faut rebrancher, et c'est sur sa carte que se trouve la correction en un clic.
    expect(warn[0].nodeId).toBe('h')
    expect(warn[0].fix).toEqual({ kind: 'order-before-compare' })
  })

  it('⚠ UN alimenteur branché ne couvre pas les AUTRES', () => {
    // La règle ne regardait que « au moins un » : une moisson branchée dispensait la
    // recherche dirigée, qui partait donc en parallèle du comparatif et écrivait ses
    // trouvailles trop tard pour être comparées.
    const issues = validateWorkflow(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1', sites: 'x.fr' } },
      { id: 'd', type: 'directed-search', config: { watchId: 'F1', sites: 'x.fr' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1', sites: 'x.fr' } },
      { id: 's', type: 'source-sites', config: { watchId: 'F1', sites: [{ domain: 'x.fr', enabled: true }] } },
      // `d` est branché (sinon il serait orphelin, donc ignoré comme à l'exécution) mais
      // il n'atteint PAS le comparatif : c'est exactement le cas qui passait au travers.
    ], [['h', 'c'], ['s', 'd', 'sites']]), getSpec)
    const warn = issues.filter((i) => i.severity === 'warning')
    expect(warn.map((w) => w.nodeId)).toEqual(['d'])
  })

  it('comparatif seul (recalcul) : aucun avertissement', () => {
    const issues = validateWorkflow(wf([
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1', sites: 'x.fr' } },
    ], []), getSpec)
    expect(issues.filter((i) => i.severity === 'warning')).toHaveLength(0)
  })
})

describe('carte qui ne tourne pas côté serveur', () => {
  const spec = (type: string): NodeSpec => ({
    type, labelKey: 'node.upload.label', category: 'utility', icon: (() => null) as never,
    inputs: [], outputs: [], configSchema: [], defaultConfig: {}, runtime: 'client',
    run: async () => ({}),
  })
  const getSpec = (t: string) => spec(t)
  const wf = (nodes: { id: string; type: string; config?: Record<string, unknown> }[]): Workflow => ({
    id: 'w', schemaVersion: 1, name: 'w', description: '', ownerId: 'u',
    createdAt: 0, updatedAt: 0,
    nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 }, config: n.config ?? {} })) as Workflow['nodes'],
    edges: [],
  })

  it('workflow PLANIFIÉ : une carte qui CASSE le run est une erreur, corrigeable en un clic', () => {
    const issues = validateWorkflow(wf([
      { id: 'k', type: 'cron', config: { enabled: true } },
      { id: 'p', type: 'export-pdf' },
    ]), getSpec)
    const err = issues.find((i) => i.nodeId === 'p')
    expect(err?.severity).toBe('error')
    expect(err?.fix).toEqual({ kind: 'drop-node' })
  })

  it('une carte TRANSPARENTE est un avertissement : le run passe, le travail n’est pas fait', () => {
    // L'enrichissement de textes laisse passer la donnée — il ne casse plus l'aval, mais
    // un run planifié « réussi » ne doit pas laisser croire que les textes sont traités.
    const issues = validateWorkflow(wf([
      { id: 'k', type: 'cron', config: { enabled: true } },
      { id: 'e', type: 'text-enrich', config: { projectId: 'p1' } },
    ]), getSpec)
    const warn = issues.find((i) => i.nodeId === 'e')
    expect(warn?.severity).toBe('warning')
    expect(warn?.fix).toEqual({ kind: 'drop-node' })
  })

  it('sans planification : rien à signaler — le navigateur sait l’exécuter', () => {
    const issues = validateWorkflow(wf([{ id: 'e', type: 'text-enrich', config: { projectId: 'p1' } }]), getSpec)
    expect(issues.filter((i) => i.nodeId === 'e')).toHaveLength(0)
  })

  it('cron DÉSACTIVÉ : le workflow ne part plus du serveur, rien à signaler', () => {
    const issues = validateWorkflow(wf([
      { id: 'k', type: 'cron', config: { enabled: false } },
      { id: 'e', type: 'text-enrich', config: { projectId: 'p1' } },
    ]), getSpec)
    expect(issues.filter((i) => i.nodeId === 'e')).toHaveLength(0)
  })

  it('une carte VISUELLE ne déclenche rien : le serveur l’ignore proprement', () => {
    const issues = validateWorkflow(wf([
      { id: 'k', type: 'cron', config: { enabled: true } },
      { id: 'c', type: 'chart' },
    ]), getSpec)
    expect(issues.filter((i) => i.nodeId === 'c')).toHaveLength(0)
  })
})

describe('correction en un clic : brancher la seule source possible', () => {
  it('propose la source quand il n’y en a qu’UNE, avec le port à câbler', () => {
    const w = wf({
      // 's' est branché sur le port d'ORDONNANCEMENT : la carte tourne donc (elle n'est
      // pas orpheline), mais son entrée de données reste vide — le cas de la capture.
      nodes: [node('s', 'source'), node('c', 'compare', { sites: 'x.fr' })],
      edges: [edge('s', 'sheet', 'c', 'harvest')],
    })
    const miss = validateWorkflow(w, getSpec).find((i) => i.nodeId === 'c' && /products/.test(i.message))
    expect(miss?.fix).toEqual({
      kind: 'wire-input', sourceId: 's', sourceHandle: 'sheet', targetHandle: 'products',
      sourceLabel: 'Upload',
    })
  })

  it('ne PARIE pas quand deux cartes pourraient alimenter l’entrée', () => {
    const w = wf({
      // ⚠ 's2' doit être BRANCHÉ quelque part, sinon il est orphelin : l'exécuteur ne le
      // lance pas, il ne peut donc alimenter personne et ne compte pas comme candidat.
      nodes: [
        node('s', 'source'), node('s2', 'source2'),
        node('c', 'compare', { sites: 'x.fr' }), node('x', 'export'),
      ],
      edges: [edge('s', 'sheet', 'c', 'harvest'), edge('s2', 'sheet', 'x', 'sheet')],
    })
    const miss = validateWorkflow(w, getSpec).find((i) => i.nodeId === 'c' && /products/.test(i.message))
    // Le trou est toujours signalé — c'est la CORRECTION AUTOMATIQUE qui s'abstient.
    expect(miss).toBeDefined()
    expect(miss?.fix).toBeUndefined()
  })

  it('n’offre pas de brancher un node situé en AVAL : ce serait un cycle', () => {
    const w = wf({
      nodes: [node('c', 'compare', { sites: 'x.fr' }), node('s', 'source')],
      edges: [edge('c', 'matrix', 's', 'in')],
    })
    const miss = validateWorkflow(w, getSpec).find((i) => i.nodeId === 'c' && /products/.test(i.message))
    expect(miss?.fix).toBeUndefined()
  })
})

describe('« Enrichir les textes » : le projet PIM n’est requis que sans feuille', () => {
  it('feuille branchée : aucun manque, la feuille fournit les fiches', () => {
    const w = wf({
      nodes: [node('s', 'source'), node('e', 'text-enrich', {})],
      edges: [edge('s', 'sheet', 'e', 'sheet')],
    })
    expect(validateWorkflow(w, getSpec).filter((i) => i.nodeId === 'e')).toHaveLength(0)
  })

  it('ni feuille ni projet : le manque est réel et signalé', () => {
    const w = wf({ nodes: [node('e', 'text-enrich', {})], edges: [] })
    const issues = validateWorkflow(w, getSpec).filter((i) => i.nodeId === 'e')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('Projet PIM')
  })

  it('projet renseigné sans feuille : rien à signaler', () => {
    const w = wf({ nodes: [node('e', 'text-enrich', { projectId: 'p1' })], edges: [] })
    expect(validateWorkflow(w, getSpec).filter((i) => i.nodeId === 'e')).toHaveLength(0)
  })
})
