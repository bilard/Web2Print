// Le workflow ensemencé par la Démo express doit refléter TOUT le pipeline
// (pas seulement scrape → Excel) : chaque carte référence un node enregistré,
// chaque edge relie des ports existants et compatibles, et aucune sortie du
// scrape ne reste orpheline.
import { describe, it, expect, beforeAll } from 'vitest'
import { buildDemoWorkflow } from './demoWorkflow'
import { DEMO_TARGET_FIELDS } from './buildDemoSheet'
import { initWorkflowsRegistry } from '@/features/workflows/registry/builtin'
import { nodeRegistry } from '@/features/workflows/registry'
import { isCompatible } from '@/features/workflows/runtime/ports'
import { FIELD_TEMPLATES } from '@/features/scraping/useJina'

beforeAll(() => {
  initWorkflowsRegistry()
})

const wf = () => buildDemoWorkflow('Acme', ['https://acme.test/p1', 'https://acme.test/p2'], 'uid-1', 'demo@acme.test')

describe('buildDemoWorkflow', () => {
  it('contient toutes les cartes du pipeline démo', () => {
    const types = wf().nodes.map((n) => n.type).sort()
    expect(types).toEqual(
      ['cron', 'export-excel', 'generate-image', 'gsheets-export', 'save-dam', 'scrape-url', 'send-gmail'].sort(),
    )
  })

  it('cohérence de structure : le template de scrape du workflow couvre les champs de la feuille démo', () => {
    // Le workflow scrape en `product_full` : ses colonnes Excel/GSheet doivent
    // porter la même structure que la feuille PIM démo (Prix, Sous-titre compris).
    const scrapeKeys = FIELD_TEMPLATES.product_full.fields.map((f) => f.key)
    // `descriptionRich` est un champ DÉRIVÉ (calculé par enrichProductCore à partir
    // du markdown, pas extrait par le LLM) — il n'a pas de champ dans le template
    // de scrape LLM et est exclu de la vérification de couverture.
    const DERIVED_FIELDS = new Set(['descriptionRich'])
    for (const k of DEMO_TARGET_FIELDS) {
      if (DERIVED_FIELDS.has(k)) continue
      expect(scrapeKeys, `champ démo absent du template product_full : ${k}`).toContain(k)
    }
    expect(scrapeKeys).toContain('price')
    expect(scrapeKeys).toContain('subtitle')
  })

  it('couverture IA : carte generate-image préremplie, câblée vers le DAM', () => {
    const w = wf()
    const gen = w.nodes.find((n) => n.type === 'generate-image')!
    expect(gen).toBeDefined()
    expect(String((gen.config as Record<string, unknown>).prompt)).toContain('Acme')
    const dam = w.nodes.find((n) => n.type === 'save-dam')!
    expect(
      w.edges.some((e) => e.source === gen.id && e.sourceHandle === 'assets' && e.target === dam.id && e.targetHandle === 'assets'),
    ).toBe(true)
  })

  it('nodes connus et edges valides (ports existants et compatibles)', () => {
    const w = wf()
    const byId = new Map(w.nodes.map((n) => [n.id, n]))
    for (const n of w.nodes) {
      expect(nodeRegistry.get(n.type), `type inconnu : ${n.type}`).toBeDefined()
    }
    for (const e of w.edges) {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      expect(src, `source absente : ${e.source}`).toBeDefined()
      expect(tgt, `cible absente : ${e.target}`).toBeDefined()
      const out = nodeRegistry.get(src!.type)!.outputs.find((p) => p.name === e.sourceHandle)
      const inp = nodeRegistry.get(tgt!.type)!.inputs.find((p) => p.name === e.targetHandle)
      expect(out, `port sortant absent : ${src!.type}.${e.sourceHandle}`).toBeDefined()
      expect(inp, `port entrant absent : ${tgt!.type}.${e.targetHandle}`).toBeDefined()
      expect(
        isCompatible(out!.type, inp!.type),
        `ports incompatibles : ${src!.type}.${e.sourceHandle} → ${tgt!.type}.${e.targetHandle}`,
      ).toBe(true)
    }
  })

  it('aucune sortie du scrape orpheline : sheet ET assets sont câblés', () => {
    const w = wf()
    const scrape = w.nodes.find((n) => n.type === 'scrape-url')!
    const handles = w.edges.filter((e) => e.source === scrape.id).map((e) => e.sourceHandle).sort()
    expect(handles).toContain('sheet')
    expect(handles).toContain('assets')
  })

  it('configs préremplies : URLs, dossier DAM, Sheet et destinataire Gmail « Démo Acme »', () => {
    const w = wf()
    const cfg = (type: string) => w.nodes.find((n) => n.type === type)!.config as Record<string, unknown>
    expect(cfg('scrape-url').urls).toBe('https://acme.test/p1\nhttps://acme.test/p2')
    expect(cfg('save-dam').folderName).toBe('Démo Acme')
    expect(cfg('gsheets-export').name).toBe('Démo Acme')
    expect(cfg('send-gmail').to).toBe('demo@acme.test')
    expect(cfg('cron').enabled).toBe(false)
  })
})
