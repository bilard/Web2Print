// functions/src/workflow/promptToFlowServer.ts
// Prompt-to-Flow SERVEUR : génère un workflow par LLM depuis Telegram, sans
// navigateur. Le catalogue est volontairement restreint aux nodes 100 % SERVEUR
// (mêmes types/ports/clés de config que les specs client → le workflow sauvegardé
// s'ouvre normalement dans l'éditeur) : tout workflow généré ici est exécutable
// immédiatement par l'executor headless. Port du pipeline client
// (promptToFlow/generateWorkflow + validateGraph + layoutGraph), validation
// contre le catalogue au lieu du registre client.
import { getFirestore } from 'firebase-admin/firestore'
import { callLlm, parseLlmJson } from './llm'
import { topoSort } from './topo'
import type { ServerWorkflow, ServerNode, ServerEdge } from './types'

interface CatalogPort {
  name: string
  type: string
  required?: boolean
}

interface CatalogNode {
  type: string
  label: string
  desc: string
  inputs: CatalogPort[]
  outputs: CatalogPort[]
  /** Clés de config EXACTES des specs client + valeurs par défaut. */
  defaults: Record<string, unknown>
}

/** Nodes proposables au LLM — tous exécutables côté serveur (cf. test de cohérence). */
export const SERVER_CATALOG: CatalogNode[] = [
  {
    type: 'text-input', label: 'Saisie texte',
    desc: 'Source : produit un texte fixe (message, données fournies dans la demande).',
    inputs: [], outputs: [{ name: 'text', type: 'any' }],
    defaults: { text: '' },
  },
  {
    type: 'scrape-url', label: 'Scrape URL',
    desc: 'Source : scrape une ou plusieurs URLs produit (une par ligne) et produit une sheet enrichie.',
    inputs: [], outputs: [{ name: 'sheet', type: 'sheet' }],
    defaults: { urls: '', template: 'product_full', customFields: '' },
  },
  {
    type: 'web-search', label: 'Recherche web',
    desc: 'Source : recherche sur le web (Jina) et produit une sheet de résultats (title, url, snippet).',
    inputs: [{ name: 'query', type: 'any' }], outputs: [{ name: 'sheet', type: 'sheet' }],
    defaults: { query: '', maxResults: 5, readPages: 2 },
  },
  {
    type: 'enrichment', label: 'Enrichissement IA',
    desc: 'Enrichit chaque ligne de la sheet via le web + LLM (champs demandés).',
    inputs: [{ name: 'sheet', type: 'sheet', required: true }], outputs: [{ name: 'sheet', type: 'sheet' }],
    defaults: { urlColumn: 'url', fields: 'title,description,price' },
  },
  {
    type: 'price-watch', label: 'Veille prix',
    desc: "Compare les prix avec le run précédent ; n'émet « changes » que si variation ≥ seuil.",
    inputs: [{ name: 'sheet', type: 'sheet', required: true }],
    outputs: [{ name: 'changes', type: 'sheet' }, { name: 'all', type: 'sheet' }],
    defaults: { watchId: 'veille-1', keyColumn: 'url', valueColumn: 'price', thresholdPct: 0 },
  },
  {
    type: 'if-else', label: 'If / Else',
    desc: "Branche selon une expression JS sur la valeur d'entrée (utilise `value`).",
    inputs: [{ name: 'value', type: 'any' }],
    outputs: [{ name: 'then', type: 'any' }, { name: 'else', type: 'any' }],
    defaults: { expression: 'true' },
  },
  {
    type: 'save-pim', label: 'Sauvegarder dans le PIM',
    desc: 'Puits : enregistre les lignes de la sheet comme produits du projet PIM.',
    inputs: [{ name: 'sheet', type: 'sheet', required: true }], outputs: [{ name: 'result', type: 'pim-products' }],
    defaults: { projectId: '', sourceId: 'workflow-import' },
  },
  {
    type: 'gsheets-export', label: 'Export Google Sheets',
    desc: 'Puits : crée un Google Sheets dans le Drive de l’utilisateur depuis la sheet (nécessite Google connecté côté serveur).',
    inputs: [{ name: 'sheet', type: 'sheet', required: true }], outputs: [{ name: 'result', type: 'export-result' }],
    defaults: { name: 'Workflow Export', parentFolderId: '', parentFolderName: '' },
  },
  {
    type: 'send-gmail', label: 'Envoyer via Gmail',
    desc: 'Puits : envoie un email ({{Colonne}} supporté ; attachmentMode "filtered" joint le CSV des lignes reçues ; iterate=true → 1 email par ligne).',
    inputs: [{ name: 'data', type: 'any' }], outputs: [{ name: 'result', type: 'any' }],
    defaults: { clientId: '', to: '', subject: '', body: '', isHtml: false, iterate: false, attachmentMode: 'filtered', attachmentFilename: 'extract.csv' },
  },
  {
    type: 'send-telegram', label: 'Envoyer via Telegram',
    desc: 'Puits : envoie un message Telegram ({{Colonne}} supporté ; iterate=true → 1 message par ligne).',
    inputs: [{ name: 'data', type: 'any' }], outputs: [{ name: 'result', type: 'any' }],
    defaults: { botToken: '', chatId: '', text: '', parseMode: 'none', iterate: false },
  },
]

const CATALOG_BY_TYPE = new Map(SERVER_CATALOG.map((c) => [c.type, c]))

function fmtPorts(ports: CatalogPort[]): string {
  if (ports.length === 0) return '(aucun)'
  return ports.map((p) => `${p.name}:${p.type}${p.required ? '*' : ''}`).join(', ')
}

export function buildServerCatalogText(): string {
  return SERVER_CATALOG.map((c) =>
    [
      `- type: ${c.type} | ${c.label}`,
      `  desc: ${c.desc}`,
      `  in: ${fmtPorts(c.inputs)}`,
      `  out: ${fmtPorts(c.outputs)}`,
      `  config: ${Object.keys(c.defaults).join(', ') || '(aucune)'}`,
    ].join('\n'),
  ).join('\n')
}

// ── Graphe brut (sortie LLM, même forme que le client) ─────────────────────
interface RawNode {
  ref: string
  type: string
  config?: { key: string; value: string }[]
}
interface RawEdge { from: string; fromPort: string; to: string; toPort: string }
export interface RawGraph { title: string; summary: string; nodes: RawNode[]; edges: RawEdge[] }

function isRawGraph(v: unknown): v is RawGraph {
  const g = v as RawGraph
  return Boolean(g && typeof g.title === 'string' && Array.isArray(g.nodes) && Array.isArray(g.edges))
}

const portsCompatible = (src: string, tgt: string) => src === tgt || src === 'any' || tgt === 'any'

function coerce(raw: string, sample: unknown): unknown {
  if (typeof sample === 'boolean') return raw === 'true' || raw === '1'
  if (typeof sample === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? sample : n
  }
  return raw
}

export interface ValidatedServerGraph {
  title: string
  nodes: ServerNode[]
  edges: ServerEdge[]
  errors: string[]
}

/** Port de validateGraph : validation contre le catalogue serveur. */
export function validateServerGraph(raw: RawGraph, now: number): ValidatedServerGraph {
  const errors: string[] = []
  const refToId = new Map<string, string>()
  const nodes: (ServerNode & { position: { x: number; y: number } })[] = []

  raw.nodes.forEach((rn, i) => {
    const spec = CATALOG_BY_TYPE.get(rn.type)
    if (!spec) {
      errors.push(`Node inconnu ignoré : "${rn.type}" (ref ${rn.ref}).`)
      return
    }
    if (refToId.has(rn.ref)) {
      errors.push(`Ref dupliquée ignorée : "${rn.ref}".`)
      return
    }
    const id = `n_${now}_${i}`
    refToId.set(rn.ref, id)
    const config: Record<string, unknown> = structuredClone(spec.defaults)
    for (const p of rn.config ?? []) config[p.key] = coerce(p.value, spec.defaults[p.key])
    nodes.push({ id, type: rn.type, config, position: { x: 0, y: 0 } })
  })

  const edges: ServerEdge[] = []
  for (const re of raw.edges) {
    const srcId = refToId.get(re.from)
    const tgtId = refToId.get(re.to)
    const srcSpec = srcId ? CATALOG_BY_TYPE.get(nodes.find((n) => n.id === srcId)!.type) : undefined
    const tgtSpec = tgtId ? CATALOG_BY_TYPE.get(nodes.find((n) => n.id === tgtId)!.type) : undefined
    if (!srcId || !tgtId || !srcSpec || !tgtSpec) {
      errors.push(`Edge ignorée : ref introuvable (${re.from} → ${re.to}).`)
      continue
    }
    const out = srcSpec.outputs.find((p) => p.name === re.fromPort)
    const inp = tgtSpec.inputs.find((p) => p.name === re.toPort)
    if (!out) { errors.push(`Port de sortie "${re.fromPort}" absent de ${srcSpec.type}.`); continue }
    if (!inp) { errors.push(`Port d'entrée "${re.toPort}" absent de ${tgtSpec.type}.`); continue }
    if (!portsCompatible(out.type, inp.type)) {
      errors.push(`Types incompatibles ${out.type} → ${inp.type} (${srcSpec.type} → ${tgtSpec.type}).`)
      continue
    }
    edges.push({ id: `e_${srcId}_${re.fromPort}_${tgtId}_${re.toPort}`, source: srcId, sourceHandle: re.fromPort, target: tgtId, targetHandle: re.toPort })
  }

  try {
    topoSort(nodes, edges)
  } catch {
    errors.push('Le graphe contient un cycle.')
  }

  for (const n of nodes) {
    const spec = CATALOG_BY_TYPE.get(n.type)!
    for (const p of spec.inputs) {
      if (p.required && !edges.some((e) => e.target === n.id && e.targetHandle === p.name)) {
        errors.push(`Entrée requise "${p.name}" non connectée sur ${spec.label}.`)
      }
    }
  }

  return { title: raw.title?.trim() || 'Workflow Telegram', nodes, edges, errors }
}

/** Layout en couches gauche→droite (copie du client, pur). */
export function layoutServerGraph(nodes: ServerNode[], edges: ServerEdge[]): Record<string, { x: number; y: number }> {
  const COL_W = 320
  const ROW_H = 160
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (preds.has(e.target) && preds.has(e.source)) preds.get(e.target)!.push(e.source)
  }
  const layer = new Map<string, number>()
  const computing = new Set<string>()
  const layerOf = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!
    if (computing.has(id)) return 0
    computing.add(id)
    const ps = preds.get(id) ?? []
    const v = ps.length === 0 ? 0 : Math.max(...ps.map(layerOf)) + 1
    computing.delete(id)
    layer.set(id, v)
    return v
  }
  for (const n of nodes) layerOf(n.id)
  const rank = new Map<number, number>()
  const pos: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const l = layer.get(n.id)!
    const r = rank.get(l) ?? 0
    rank.set(l, r + 1)
    pos[n.id] = { x: l * COL_W, y: r * ROW_H }
  }
  return pos
}

function buildGenerationPrompt(userPrompt: string, repairIssues?: string[]): string {
  const parts = [
    `Tu es un architecte de workflows data. Conçois un workflow répondant à la demande, en
sélectionnant UNIQUEMENT des nodes du catalogue ci-dessous, connectés de manière cohérente.

RÈGLES IMPÉRATIVES :
- N'utilise QUE des "type" présents dans le catalogue. N'invente jamais de type ni de port.
- Connecte un port de sortie à un port d'entrée de TYPE compatible (même type, ou "any").
  Le suffixe "*" sur un port d'entrée signale qu'il est REQUIS.
- Les nodes "in: (aucun)" sont des sources : ne leur connecte aucune entrée.
- Donne à chaque node une "ref" unique (n1, n2, …) ; les edges référencent ces refs.
- "config" est une LISTE de paires {key, value} avec les noms de champs EXACTS du catalogue ;
  remplis chaque champ que la demande permet de déduire (URLs dans "urls", une par ligne).
- Ce workflow s'exécute AUTOMATIQUEMENT côté serveur, sans interface : aucune sélection de
  fichier, aucune action humaine.
- Pour notifier le résultat, termine par un node "send-telegram" (botToken et chatId vides =
  config globale de l'utilisateur ; iterate=true si un message par ligne est pertinent).

Réponds UNIQUEMENT avec un objet JSON de la forme :
{"title": "...", "summary": "...", "nodes": [{"ref":"n1","type":"...","config":[{"key":"...","value":"..."}]}], "edges": [{"from":"n1","fromPort":"sheet","to":"n2","toPort":"sheet"}]}`,
    `═══ CATALOGUE DES NODES ═══\n${buildServerCatalogText()}`,
    `═══ DEMANDE DE L'UTILISATEUR ═══\n${userPrompt}`,
  ]
  if (repairIssues?.length) {
    parts.push(`═══ CORRECTIONS À APPORTER ═══\n${repairIssues.map((m) => `- ${m}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

export interface GeneratedServerWorkflow {
  workflow: ServerWorkflow
  name: string
  nodeCount: number
}

/** Génère (LLM, 1 réparation), valide, layoute et SAUVEGARDE dans users/{uid}/workflows. */
export async function generateAndSaveWorkflowServer(uid: string, text: string): Promise<GeneratedServerWorkflow> {
  const attempt = async (repair?: string[]) => {
    const { text: out } = await callLlm(uid, buildGenerationPrompt(text, repair))
    const raw = parseLlmJson<RawGraph>(out)
    if (!raw || !isRawGraph(raw)) throw new Error('réponse LLM illisible (JSON attendu).')
    return validateServerGraph(raw, Date.now())
  }

  let validated = await attempt()
  if (validated.errors.length > 0) validated = await attempt(validated.errors)
  if (validated.nodes.length === 0) {
    throw new Error('aucun node généré — reformule ta demande plus précisément.')
  }

  const positions = layoutServerGraph(validated.nodes, validated.edges)
  const nodes = validated.nodes.map((n) => ({ ...n, position: positions[n.id] ?? { x: 0, y: 0 } }))

  const now = Date.now()
  const id = `wf_${now}_${Math.random().toString(36).slice(2, 8)}`
  const doc = {
    id,
    schemaVersion: 1,
    name: validated.title,
    description: '',
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
    nodes,
    edges: validated.edges,
  }
  await getFirestore().doc(`users/${uid}/workflows/${id}`).set(doc)
  return {
    workflow: { id, name: doc.name, ownerId: uid, nodes, edges: validated.edges },
    name: doc.name,
    nodeCount: nodes.length,
  }
}
