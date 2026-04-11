import { useState } from 'react'
import { Layers, Trash2, Pencil, Check, X as XIcon, Clock, Star, LifeBuoy, Loader2 } from 'lucide-react'
import type { DamImage, DamImageVariant } from '../types'

interface Props {
  originalImage: DamImage
  variants: DamImageVariant[]
  loading: boolean
  loadedVariantId: string | null
  onLoadOriginal: () => void
  onLoadVariant: (variant: DamImageVariant) => void
  onDelete: (variant: DamImageVariant) => void
  onRename: (variantId: string, name: string) => void
  onRecoverOrphans: () => Promise<number>
}

function formatDate(ts: number | { seconds: number } | null | undefined): string {
  if (!ts) return ''
  const ms = typeof ts === 'number' ? ts : ts.seconds * 1000
  const d = new Date(ms)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function editBadges(variant: DamImageVariant): string[] {
  const e = variant.edits
  const badges: string[] = []
  if (e.mask?.enabled && !(e.mask.x === 0 && e.mask.y === 0 && e.mask.width === 1 && e.mask.height === 1)) {
    const pct = Math.round(e.mask.width * e.mask.height * 100)
    badges.push(`Crop ${pct}%`)
  }
  if (e.rotation !== 0) badges.push(`${e.rotation}°`)
  if (e.flipH) badges.push('↔')
  if (e.flipV) badges.push('↕')
  if (e.filters.brightness !== 100) badges.push(`Lum ${e.filters.brightness}%`)
  if (e.filters.contrast !== 100) badges.push(`Contr ${e.filters.contrast}%`)
  if (e.filters.saturation !== 100) badges.push(`Sat ${e.filters.saturation}%`)
  if (e.filters.hue !== 0) badges.push(`Teinte ${e.filters.hue}°`)
  return badges
}

export function DamVariantsPanel({
  originalImage,
  variants,
  loading,
  loadedVariantId,
  onLoadOriginal,
  onLoadVariant,
  onDelete,
  onRename,
  onRecoverOrphans,
}: Props) {
  const originalActive = loadedVariantId === null
  const [recovering, setRecovering] = useState(false)
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null)

  const handleRecover = async () => {
    setRecovering(true)
    setRecoveryMsg(null)
    try {
      const n = await onRecoverOrphans()
      setRecoveryMsg(n > 0 ? `${n} variante${n > 1 ? 's' : ''} récupérée${n > 1 ? 's' : ''}` : 'Aucun orphelin trouvé')
    } catch (err) {
      console.error('Recovery failed:', err)
      setRecoveryMsg('Erreur pendant la récupération')
    } finally {
      setRecovering(false)
      setTimeout(() => setRecoveryMsg(null), 4000)
    }
  }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startRename = (v: DamImageVariant) => {
    setEditingId(v.id)
    setEditName(v.name)
  }

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="w-[260px] bg-[#141414] border-l border-white/5 overflow-y-auto shrink-0 flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-indigo-400" />
        <div className="text-xs font-medium text-white/80">Versions</div>
        <button
          onClick={handleRecover}
          disabled={recovering}
          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
          title="Récupérer les fichiers orphelins de Storage"
        >
          {recovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <LifeBuoy className="w-3 h-3" />}
          Récupérer
        </button>
        <span className="text-[10px] text-white/30">{variants.length + 1}</span>
      </div>
      {recoveryMsg && (
        <div className="px-4 py-1.5 text-[10px] text-amber-300/80 bg-amber-500/5 border-b border-amber-500/10">
          {recoveryMsg}
        </div>
      )}

      <div className="flex flex-col p-2 gap-2">
        {/* Original */}
        <div
          className={`group rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition ${
            originalActive ? 'ring-2 ring-amber-400' : 'ring-1 ring-amber-500/20'
          }`}
        >
          <button
            onClick={onLoadOriginal}
            className="w-full aspect-video bg-[#111] relative overflow-hidden"
            title="Revenir à l'original"
          >
            <img
              src={originalImage.previewUrl}
              alt="Original"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black text-[9px] font-medium">
              <Star className="w-2.5 h-2.5" fill="currentColor" />
              Original
            </div>
          </button>
          <div className="px-2.5 py-2">
            <div className="text-[11px] text-white/80 font-medium truncate">Image originale</div>
            <div className="flex items-center gap-1 mt-0.5 text-[9px] text-white/30">
              <span className="capitalize">{originalImage.sourceProvider}</span>
              <span className="ml-auto font-mono">
                {originalImage.width}x{originalImage.height}
              </span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center text-white/30 text-xs py-4">
            Chargement des variantes...
          </div>
        )}

        {!loading && variants.length === 0 && (
          <div className="flex flex-col items-center justify-center text-white/20 gap-2 p-4 text-center">
            <Layers className="w-6 h-6" />
            <div className="text-[10px] text-white/15">
              Modifiez l'image et cliquez sur "Enregistrer variante" pour créer une nouvelle version
            </div>
          </div>
        )}

        {!loading && variants.length > 0 && (
          <>
            {variants.map((v) => {
            const badges = editBadges(v)
            return (
              <div
                key={v.id}
                className={`group rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition ${
                  loadedVariantId === v.id ? 'ring-2 ring-indigo-400' : ''
                }`}
              >
                {/* Thumbnail */}
                <button
                  onClick={() => onLoadVariant(v)}
                  className="w-full aspect-video bg-[#111] relative overflow-hidden"
                  title="Charger cette variante"
                >
                  <img
                    src={v.renderedThumbUrl}
                    alt={v.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(v)
                      }}
                      className="p-1 rounded bg-black/60 text-white/70 hover:text-white"
                      title="Renommer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Supprimer la variante "${v.name}" ?`)) onDelete(v)
                      }}
                      className="p-1 rounded bg-black/60 text-white/70 hover:text-red-400"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </button>

                {/* Info */}
                <div className="px-2.5 py-2">
                  {editingId === v.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="flex-1 min-w-0 bg-[#111] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-indigo-500/50"
                      />
                      <button onClick={commitRename} className="text-indigo-400 hover:text-indigo-300 p-0.5">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-white/40 hover:text-white/60 p-0.5">
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-white/80 font-medium truncate">{v.name}</div>
                  )}

                  <div className="flex items-center gap-1 mt-0.5 text-[9px] text-white/30">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(v.createdAt as unknown as number)}
                    <span className="ml-auto font-mono">
                      {v.renderedWidth}x{v.renderedHeight}
                    </span>
                  </div>

                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1.5">
                      {badges.map((b, i) => (
                        <span
                          key={i}
                          className="px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-[8px]"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          </>
        )}
      </div>
    </div>
  )
}
