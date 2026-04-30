import { Loader2, Plus, Link2, AlertTriangle, X } from 'lucide-react'
import type { MergePreview } from '@/features/pim/types'

interface Props {
  open: boolean
  preview: MergePreview | null
  loading: boolean
  sourceName: string
  onConfirm: () => void
  onClose: () => void
}

export function MatchPreviewModal({ open, preview, loading, sourceName, onConfirm, onClose }: Props) {
  if (!open) return null

  const stats = preview
    ? {
        new: preview.newMasters.length,
        merged: preview.mergedOnExisting.length,
        dedup: preview.needsDedup.length,
        total: preview.newMasters.length + preview.mergedOnExisting.length + preview.needsDedup.length,
      }
    : { new: 0, merged: 0, dedup: 0, total: 0 }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/85">
            Aperçu de l'import · {sourceName} <span className="text-white/40">· {stats.total} ligne{stats.total > 1 ? 's' : ''}</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-3">
          {loading && (
            <p className="flex items-center gap-2 text-white/60">
              <Loader2 className="w-4 h-4 animate-spin" /> Calcul du matching…
            </p>
          )}
          {!loading && preview && (
            <>
              <Section
                icon={<Plus className="w-3.5 h-3.5 text-emerald-400" />}
                color="emerald"
                title={`${stats.new} nouveau${stats.new > 1 ? 'x produits' : ' produit'}`}
                items={preview.newMasters.slice(0, 8).map((r) => ({
                  primary: stringField(r.snapshot, 'name') ?? `Ligne ${r.rowIndex + 1}`,
                  secondary: r.detectedSku ?? 'sans SKU',
                }))}
                more={preview.newMasters.length - 8}
              />
              <Section
                icon={<Link2 className="w-3.5 h-3.5 text-indigo-400" />}
                color="indigo"
                title={`${stats.merged} mergé${stats.merged > 1 ? 's' : ''} sur existant`}
                items={preview.mergedOnExisting.slice(0, 8).map((m) => ({
                  primary: stringField(m.snapshot, 'name') ?? `Ligne ${m.rowIndex + 1}`,
                  secondary: `→ ${m.targetMasterSku ?? m.targetProductId}`,
                }))}
                more={preview.mergedOnExisting.length - 8}
              />
              <Section
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                color="amber"
                title={`${stats.dedup} sans SKU · à dédupliquer`}
                items={preview.needsDedup.slice(0, 8).map((r) => ({
                  primary: stringField(r.snapshot, 'name') ?? `Ligne ${r.rowIndex + 1}`,
                  secondary: 'sera créé comme master synthétique',
                }))}
                more={preview.needsDedup.length - 8}
              />
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !preview}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-md text-[12px] text-white"
          >
            Confirmer l'import
          </button>
        </footer>
      </div>
    </div>
  )
}

function stringField(snapshot: Record<string, unknown>, key: string): string | null {
  const v = snapshot[key]
  return typeof v === 'string' ? v : null
}

function Section({
  icon, title, items, more, color,
}: {
  icon: React.ReactNode
  title: string
  items: { primary: string; secondary: string }[]
  more: number
  color: 'emerald' | 'indigo' | 'amber'
}) {
  const tones = {
    emerald: 'bg-emerald-500/5 border-emerald-500/20',
    indigo: 'bg-indigo-500/5 border-indigo-500/20',
    amber: 'bg-amber-500/5 border-amber-500/20',
  }[color]
  if (items.length === 0) return null
  return (
    <div className={`border rounded-md ${tones} p-2.5`}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/70 mb-2">
        {icon} {title}
      </p>
      <ul className="space-y-0.5 text-[12px] text-white/70">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 truncate">
            <span className="truncate">{it.primary}</span>
            <span className="text-[10px] text-white/40 shrink-0">{it.secondary}</span>
          </li>
        ))}
        {more > 0 && <li className="text-[10px] text-white/30">… et {more} autre{more > 1 ? 's' : ''}</li>}
      </ul>
    </div>
  )
}
