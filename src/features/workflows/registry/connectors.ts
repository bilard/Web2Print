// src/features/workflows/registry/connectors.ts
// Registre des « connecteurs » (services externes) affichés en pastilles sous le
// titre de chaque carte de node. Source unique : un node peut soit déclarer
// `connectors` dans sa NodeSpec, soit hériter du mapping par type ci-dessous.
import type { NodeSpec } from '../types'

export interface ConnectorMeta {
  /** Libellé court affiché sur la pastille. */
  label: string
  /** Classe texte (token thémable). */
  color: string
  /** Classe fond de la pastille. */
  dot: string
}

/** Catalogue des connecteurs connus. */
const CONNECTORS: Record<string, ConnectorMeta> = {
  jina:       { label: 'Jina',       color: 'text-sky-300',     dot: 'bg-sky-400/70' },
  brightdata: { label: 'Bright Data', color: 'text-orange-300', dot: 'bg-orange-400/70' },
  llm:      { label: 'LLM',      color: 'text-violet-300',  dot: 'bg-violet-400/70' },
  vision:   { label: 'Vision',   color: 'text-amber-300',   dot: 'bg-amber-400/70' },
  image:    { label: 'Image IA', color: 'text-pink-300',    dot: 'bg-pink-400/70' },
  drive:    { label: 'Drive',    color: 'text-emerald-300', dot: 'bg-emerald-400/70' },
  sheets:   { label: 'Sheets',   color: 'text-green-300',   dot: 'bg-green-400/70' },
  gmail:    { label: 'Gmail',    color: 'text-red-300',     dot: 'bg-red-400/70' },
  telegram: { label: 'Telegram', color: 'text-cyan-300',    dot: 'bg-cyan-400/70' },
}

/**
 * Mapping par type de node → connecteurs, pour les nodes qui ne déclarent pas
 * `connectors` eux-mêmes. Seuls les nodes qui parlent réellement à un service
 * externe sont listés ; les nodes purement logiques/locaux n'affichent rien.
 */
const CONNECTORS_BY_TYPE: Record<string, string[]> = {
  // Scraping / lecture web + extraction LLM
  'scrape-url': ['jina', 'llm'],
  'web-ask': ['jina', 'llm'],
  'web-search': ['jina'],
  enrichment: ['jina', 'llm'],
  'list-products': ['jina', 'llm'],
  // 'compare-prices' : pivot déterministe par EAN, aucun service externe → pas de pastille.
  'price-watch': ['jina', 'llm'],
  'price-watch-track': ['jina', 'llm'],
  // Vision + LLM (décomposition d'images / documents)
  decompose: ['vision', 'llm'],
  'image-to-svg': ['vision', 'llm'],
  'pdf-to-svg': ['vision', 'llm'],
  // Génération d'image
  'generate-image': ['image'],
  // Google Drive
  'gdrive-export': ['drive'],
  'gdrive-import': ['drive'],
  'save-dam': ['drive'],
  // Google Sheets
  'gsheets-export': ['sheets'],
  'gsheets-import': ['sheets'],
  // Messagerie
  'send-gmail': ['gmail'],
  'send-telegram': ['telegram'],
  'telegram-approval': ['telegram'],
}

/** Retourne les métadonnées des connecteurs d'un node (déclarés ou inférés par type). */
export function connectorsForSpec(spec: NodeSpec): ConnectorMeta[] {
  const ids = spec.connectors ?? CONNECTORS_BY_TYPE[spec.type] ?? []
  return connectorsByIds(ids)
}

/** Mappe une liste d'ids de connecteurs vers leurs métadonnées (ordre conservé, inconnus ignorés). */
export function connectorsByIds(ids: string[]): ConnectorMeta[] {
  return ids.map((id) => CONNECTORS[id]).filter((c): c is ConnectorMeta => Boolean(c))
}
