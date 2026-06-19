// src/features/access/moduleMeta.ts
// Identité visuelle par module (icône + classes de couleur) pour les écrans RBAC.
// Les noms de clés correspondent EXACTEMENT au champ `module` de `permissions.ts`.
import {
  Library, Upload, Image as ImageIcon, FileSpreadsheet, FolderTree,
  Globe, Workflow, Film, MessageSquare, Send, Settings, Shield, TrendingUpDown,
  type LucideIcon,
} from 'lucide-react'

export interface ModuleMeta {
  icon: LucideIcon
  /** Pastille d'icône (fond + texte). */
  dot: string
  /** Puce active (action sélectionnée). */
  chipOn: string
  /** Liseré gauche / accent de carte. */
  bar: string
  /** Texte d'accent (titre, compteur plein). */
  text: string
}

const FALLBACK: ModuleMeta = {
  icon: Shield, dot: 'bg-white/10 text-white/60',
  chipOn: 'bg-white/15 border-white/30 text-white', bar: 'bg-white/20', text: 'text-white/70',
}

const MODULE_META: Record<string, ModuleMeta> = {
  'Bibliothèque': { icon: Library,         dot: 'bg-sky-500/15 text-sky-300',     chipOn: 'bg-sky-500/20 border-sky-500/50 text-sky-100',         bar: 'bg-sky-500',     text: 'text-sky-300' },
  'Import':       { icon: Upload,          dot: 'bg-amber-500/15 text-amber-300', chipOn: 'bg-amber-500/20 border-amber-500/50 text-amber-100',   bar: 'bg-amber-500',   text: 'text-amber-300' },
  'DAM':          { icon: ImageIcon,       dot: 'bg-pink-500/15 text-pink-300',   chipOn: 'bg-pink-500/20 border-pink-500/50 text-pink-100',      bar: 'bg-pink-500',    text: 'text-pink-300' },
  'PIM':          { icon: FileSpreadsheet, dot: 'bg-emerald-500/15 text-emerald-300', chipOn: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100', bar: 'bg-emerald-500', text: 'text-emerald-300' },
  'Taxonomies':   { icon: FolderTree,      dot: 'bg-teal-500/15 text-teal-300',   chipOn: 'bg-teal-500/20 border-teal-500/50 text-teal-100',      bar: 'bg-teal-500',    text: 'text-teal-300' },
  'Scraping':     { icon: Globe,           dot: 'bg-indigo-500/15 text-indigo-300', chipOn: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-100', bar: 'bg-indigo-500', text: 'text-indigo-300' },
  'Workflows':    { icon: Workflow,        dot: 'bg-violet-500/15 text-violet-300', chipOn: 'bg-violet-500/20 border-violet-500/50 text-violet-100', bar: 'bg-violet-500', text: 'text-violet-300' },
  'Veille tarifaire': { icon: TrendingUpDown, dot: 'bg-orange-500/15 text-orange-300', chipOn: 'bg-orange-500/20 border-orange-500/50 text-orange-100', bar: 'bg-orange-500', text: 'text-orange-300' },
  'Animation':    { icon: Film,            dot: 'bg-fuchsia-500/15 text-fuchsia-300', chipOn: 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-100', bar: 'bg-fuchsia-500', text: 'text-fuchsia-300' },
  'Chat IA':      { icon: MessageSquare,   dot: 'bg-cyan-500/15 text-cyan-300',   chipOn: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-100',      bar: 'bg-cyan-500',    text: 'text-cyan-300' },
  'Telegram':     { icon: Send,            dot: 'bg-blue-500/15 text-blue-300',   chipOn: 'bg-blue-500/20 border-blue-500/50 text-blue-100',      bar: 'bg-blue-500',    text: 'text-blue-300' },
  'Paramètres':   { icon: Settings,        dot: 'bg-slate-500/20 text-slate-300', chipOn: 'bg-slate-500/25 border-slate-400/50 text-slate-100',   bar: 'bg-slate-400',   text: 'text-slate-300' },
}

export function moduleMeta(module: string): ModuleMeta {
  return MODULE_META[module] ?? FALLBACK
}

/** Couleur brute (hex) par module — pour les liens SVG de la carte mentale (React Flow). */
const MODULE_HEX: Record<string, string> = {
  'Bibliothèque': '#0ea5e9', 'Import': '#f59e0b', 'DAM': '#ec4899', 'PIM': '#10b981',
  'Taxonomies': '#14b8a6', 'Scraping': '#6366f1', 'Workflows': '#8b5cf6', 'Veille tarifaire': '#f97316',
  'Animation': '#d946ef', 'Chat IA': '#06b6d4', 'Telegram': '#3b82f6', 'Paramètres': '#94a3b8',
}
export function moduleHex(module: string): string {
  return MODULE_HEX[module] ?? '#64748b'
}

/** Ordre d'affichage = ordre de navigation de l'app (barre latérale). */
const MODULE_ORDER = [
  'Import', 'Bibliothèque', 'DAM', 'PIM', 'Taxonomies', 'Scraping',
  'Workflows', 'Veille tarifaire', 'Telegram', 'Animation', 'Chat IA', 'Paramètres',
]

/** Entrées d'un Record groupé par module, triées selon l'ordre de navigation. */
export function orderedModuleEntries<T>(byModule: Record<string, T>): [string, T][] {
  const idx = (m: string) => { const i = MODULE_ORDER.indexOf(m); return i === -1 ? 999 : i }
  return Object.entries(byModule).sort(([a], [b]) => idx(a) - idx(b))
}
