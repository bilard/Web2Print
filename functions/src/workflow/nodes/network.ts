// functions/src/workflow/nodes/network.ts
// Réimplémentation SERVEUR (headless) des nodes réseau client (web-search, scrape-url,
// enrichment). Volontairement plus simple que le pipeline `enrichRow` du client : Jina
// (read/search) + UNE extraction JSON via LLM. Le rôle de ce fichier est d'être
// WIRE-COMPATIBLE avec les nodes client — mêmes clés de config, mêmes ports d'E/S,
// mêmes formes de sortie ({ sheet, ... }) que ce qu'attendent les nodes en aval.
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { callLlm, parseLlmJson } from '../llm'

// Jeu de champs serveur par défaut pour scrape-url quand un template (≠ custom) est
// choisi. Le client résout `template` via FIELD_TEMPLATES (lourd, côté client) ; ici on
// se limite aux champs produit usuels. `custom` lit `customFields`.
const DEFAULT_TEMPLATE_FIELDS = ['name', 'reference', 'price', 'description', 'brand', 'image_url']

function splitList(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseUrls(raw: unknown): string[] {
  return splitList(raw).filter((s) => /^https?:\/\//.test(s))
}

async function extractFields(
  uid: string,
  content: string,
  fields: string[],
): Promise<Record<string, unknown>> {
  if (fields.length === 0 || !content.trim()) return {}
  const prompt =
    `Extrait les champs suivants du contenu de page ci-dessous. Réponds UNIQUEMENT par un objet JSON ` +
    `avec exactement ces clés : ${fields.join(', ')}. Valeur vide "" si absent.\n\n` +
    `--- CONTENU ---\n${content.slice(0, 12000)}`
  const { text } = await callLlm(uid, prompt)
  return parseLlmJson<Record<string, unknown>>(text) ?? {}
}

// --- web-search ---
// Config client : { query, maxResults, readPages }. On lit `query`.
// Sortie client : { sheet: ExcelSheet, text }. On renvoie { sheet: { rows }, text }.
registerServerNode({
  type: 'web-search',
  run: async (ctx, config) => {
    const query = String(config.query ?? '').trim()
    if (!query) {
      ctx.log('warn', 'Requête vide.')
      return { sheet: { rows: [] }, text: '' }
    }
    ctx.log('info', `Recherche web : « ${query} »`)
    const results = await jinaSearch(ctx.uid, query)
    ctx.log('info', `${results.length} résultat(s).`)
    const rows = results.map((r) => ({ title: r.title, url: r.url, description: r.snippet }))
    const text = results.map((r) => `# ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')
    return { sheet: { rows }, text }
  },
})

// --- scrape-url ---
// Config client : { urls, template, customFields }. Pas de port d'entrée.
// Sortie client : { sheet: ExcelSheet, assets }. Lignes clées sur `_url`.
registerServerNode({
  type: 'scrape-url',
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    const fields =
      String(config.template ?? '') === 'custom'
        ? splitList(config.customFields)
        : DEFAULT_TEMPLATE_FIELDS
    if (urls.length === 0) {
      ctx.log('warn', 'Aucune URL valide.')
      return { sheet: { rows: [] }, assets: [] }
    }
    const rows: Record<string, unknown>[] = []
    for (const url of urls) {
      if (ctx.signal.aborted) throw new Error('Run aborted')
      ctx.log('info', `Scrape ${url}`)
      try {
        const { title, content } = await jinaRead(ctx.uid, url)
        const extracted = await extractFields(ctx.uid, content, fields)
        rows.push({ _url: url, title, ...extracted })
      } catch (err) {
        ctx.log('warn', `Échec ${url} : ${err instanceof Error ? err.message : err}`)
        rows.push({ _url: url, _error: String(err) })
      }
    }
    return { sheet: { rows }, assets: [] }
  },
})

// --- enrichment ---
// Config client : { urlColumn, fields }. Port d'entrée : sheet.
// Sortie client : { sheet (préserve ...sheet), assets }.
registerServerNode({
  type: 'enrichment',
  run: async (ctx, config, inputs) => {
    const urlCol = String(config.urlColumn ?? 'url').trim() || 'url'
    const fields = splitList(config.fields)
    const sheet = (inputs.sheet ?? { rows: [] }) as { rows?: Record<string, unknown>[]; [k: string]: unknown }
    const rows = Array.isArray(sheet.rows) ? sheet.rows : []
    const out: Record<string, unknown>[] = []
    for (const row of rows) {
      if (ctx.signal.aborted) throw new Error('Run aborted')
      const url = String(row[urlCol] ?? '')
      if (!/^https?:\/\//.test(url)) {
        out.push(row)
        continue
      }
      ctx.log('info', `Enrichissement ${url}`)
      try {
        const { content } = await jinaRead(ctx.uid, url)
        out.push({ ...row, ...(await extractFields(ctx.uid, content, fields)) })
      } catch (err) {
        ctx.log('warn', `Enrichissement échoué ${url} : ${err instanceof Error ? err.message : err}`)
        out.push(row)
      }
    }
    ctx.log('info', `Enrichi ${out.length} ligne(s).`)
    return { sheet: { ...sheet, rows: out }, assets: [] }
  },
})
