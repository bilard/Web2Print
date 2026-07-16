/** Sémantique visuelle partagée des statuts, alignée sur le verdict fabricant. */
import type { CompareStatus } from '../types'

export const STATUS_ORDER: CompareStatus[] = ['diff', 'mfr-only', 'match', 'source-only']

export const STATUS_UI: Record<CompareStatus, { label: string; hex: string; chip: string }> = {
  diff:          { label: 'Divergents',        hex: '#fbbf24', chip: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'mfr-only':    { label: 'Apport fabricant',  hex: '#818cf8', chip: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' },
  match:         { label: 'Concordants',       hex: '#34d399', chip: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'source-only': { label: 'Source seule',      hex: '#94a3b8', chip: 'text-white/45 bg-white/[0.04] border-white/10' },
}
