/**
 * Identité VISUELLE d'un node dans le graphe de la PWA.
 *
 * ⚠️ Table autonome, volontairement : importer le registre des nodes de l'app
 * tirerait tout le moteur d'exécution (et ses dépendances de scraping) dans le
 * bundle mobile. Un type inconnu retombe sur un gabarit neutre plutôt que de
 * disparaître — mieux vaut une carte « type brut » qu'un trou dans la chaîne.
 */
export interface NodeSkin {
  label: string
  /** Lettre affichée dans la pastille — un SVG n'a pas d'icône Lucide sans coût. */
  glyph: string
  accent: string
}

const NEUTRAL: NodeSkin = { label: '', glyph: '•', accent: '#8e8e93' }

const SKINS: Record<string, NodeSkin> = {
  cron: { label: 'Cron (planifié)', glyph: '⏱', accent: '#f5a524' },
  'source-sites': { label: 'Sites sources', glyph: '☰', accent: '#f5a524' },
  'gsheets-import': { label: 'Import Sheets', glyph: '↓', accent: '#30d158' },
  'gsheets-export': { label: 'Export Sheets', glyph: '↑', accent: '#0a84ff' },
  'harvest-competitor': { label: 'Moisson concurrents', glyph: '⤢', accent: '#bf5af2' },
  'compare-catalog': { label: 'Comparer catalogue', glyph: '⚖', accent: '#ff375f' },
  'directed-search': { label: 'Recherche dirigée', glyph: '⌕', accent: '#bf5af2' },
  'pairing-rules': { label: 'Règles d’appariement', glyph: '⚙', accent: '#ff375f' },
  'price-watch-report': { label: 'Rapport veille', glyph: '▤', accent: '#0a84ff' },
  'send-window': { label: 'Cadence d’envoi', glyph: '⏲', accent: '#ff375f' },
  'send-gmail': { label: 'Envoyer via Gmail', glyph: '✉', accent: '#0a84ff' },
  'price-watch': { label: 'Veille tarifaire', glyph: '€', accent: '#ff9f0a' },
  'price-watch-track': { label: 'Suivi tarifaire', glyph: '€', accent: '#ff9f0a' },
  telegram: { label: 'Telegram', glyph: '✈', accent: '#0a84ff' },
  gmail: { label: 'Gmail', glyph: '✉', accent: '#ff453a' },
}

export function nodeSkin(type: string): NodeSkin {
  const s = SKINS[type]
  return s ?? { ...NEUTRAL, label: type }
}

/** Couleur d'un état d'exécution. `null` = aucun état connu (carte au repos). */
export function statusColor(status: string | undefined): string | null {
  switch (status) {
    case 'running': return '#0a84ff'
    case 'success': return '#30d158'
    case 'error': return '#ff453a'
    case 'skipped': return '#6a6a70'
    default: return null
  }
}

export function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'running': return 'en cours'
    case 'success': return 'terminé'
    case 'error': return 'en erreur'
    case 'skipped': return 'ignoré'
    default: return 'au repos'
  }
}
