import { useState, useEffect, useRef } from 'react'
import { Download, Trash2, FileCode2, Maximize2, Pencil, Check, X, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useUserAnimations, type SavedAnimation } from './useUserAnimations'
import { HyperframesPlayer } from './HyperframesPlayer'
import type { AspectFormat } from './types'

const ASPECT_LABEL: Record<AspectFormat, string> = {
  portrait: '9:16',
  square: '1:1',
  landscape: '16:9',
}

const ASPECT_RATIO: Record<AspectFormat, string> = {
  portrait: '9 / 16',
  square: '1 / 1',
  landscape: '16 / 9',
}

function formatDate(a: SavedAnimation): string {
  if (!a.createdAt) return ''
  const d = a.createdAt.toDate()
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function defaultLabel(a: SavedAnimation): string {
  if (a.title?.trim()) return a.title.trim()
  const combined = [a.brand, a.caption].filter(Boolean).join(' — ')
  return combined || 'Sans titre'
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'animation'
}

function downloadFilename(a: SavedAnimation): string {
  const base = a.title?.trim()
    || [a.brand, a.caption].filter(Boolean).join(' — ')
    || `animation-${a.animationId.slice(0, 8)}`
  return `${sanitizeFilename(base)}.zip`
}

function formatBytes(b: number | null): string {
  if (b === null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

interface AnimationTitleProps {
  animation: SavedAnimation
  onRename: (title: string) => Promise<void>
}

function AnimationTitle({ animation, onRename }: AnimationTitleProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(animation.title ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = () => {
    setValue(animation.title ?? '')
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setValue(animation.title ?? '')
  }

  const commit = async () => {
    if (saving) return
    const trimmed = value.trim()
    const current = animation.title?.trim() ?? ''
    if (trimmed === current) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(trimmed)
      toast.success('Animation renommée')
      setEditing(false)
    } catch {
      toast.error('Renommage échoué')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          disabled={saving}
          placeholder="Nom de l'animation"
          className="flex-1 min-w-0 bg-white/5 border border-indigo-500/40 rounded-md px-2 py-1 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/70 disabled:opacity-50"
        />
        <button
          onClick={() => void commit()}
          disabled={saving}
          className="text-emerald-300/80 hover:text-emerald-300 disabled:opacity-50 p-1"
          aria-label="Valider"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="text-white/40 hover:text-white/80 disabled:opacity-50 p-1"
          aria-label="Annuler"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  const hasTitle = !!animation.title?.trim()

  return (
    <button
      onClick={startEdit}
      className="group/title flex items-center gap-1.5 text-left text-[12px] text-white/70 hover:text-white transition-colors min-w-0"
      title="Renommer"
    >
      <span className={`truncate ${hasTitle ? '' : 'italic text-white/40'}`}>{defaultLabel(animation)}</span>
      <Pencil className="w-3 h-3 text-white/30 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

/** Card individuel : preview HyperFrames si playing, sinon affiche un poster
 *  statique (boutton Play) pour éviter de charger toutes les iframes en même
 *  temps quand la grille est dense. */
function AnimationCard({ animation, onDelete, onRename }: {
  animation: SavedAnimation
  onDelete: (a: SavedAnimation) => void
  onRename: (a: SavedAnimation, title: string) => Promise<void>
}) {
  const [playing, setPlaying] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    const filename = downloadFilename(animation)
    try {
      const res = await fetch(animation.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Téléchargement échoué')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden group">
      <div
        className="bg-black flex items-center justify-center relative"
        style={{ aspectRatio: ASPECT_RATIO[animation.aspect] }}
      >
        {playing ? (
          <HyperframesPlayer
            aspect={animation.aspect}
            composition={animation.composition ?? undefined}
            styleConfig={animation.styleConfig ?? undefined}
            brand={animation.brand ?? undefined}
            caption={animation.caption ?? undefined}
            prompt={animation.prompt ?? undefined}
            width={animation.width ?? undefined}
            height={animation.height ?? undefined}
            autoPlay
            className="w-full h-full"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
            title="Lire l'aperçu"
          >
            <FileCode2 className="w-8 h-8" />
            <span className="text-[10px] uppercase tracking-wider">HTML/CSS/JS</span>
            <div className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            </div>
          </button>
        )}
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono tabular-nums">
          <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3" />{ASPECT_LABEL[animation.aspect]}</span>
          <span className="text-white/20">·</span>
          <span>{formatBytes(animation.bytes)}</span>
          <span className="text-white/20">·</span>
          <span className="truncate">{formatDate(animation)}</span>
        </div>
        <AnimationTitle animation={animation} onRename={(title) => onRename(animation, title)} />
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 text-white text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors"
            title={`Télécharger ${downloadFilename(animation)}`}
          >
            <Download className="w-3 h-3" />
            {downloading ? 'Téléchargement…' : 'Télécharger ZIP'}
          </button>
          <button
            onClick={() => onDelete(animation)}
            className="flex items-center justify-center bg-white/5 hover:bg-red-500/15 hover:text-red-300 border border-white/10 text-white/60 px-2 py-1.5 rounded-md transition-colors"
            aria-label="Supprimer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function UserAnimationsList() {
  const { animations, loading, deleteAnimation, renameAnimation } = useUserAnimations()

  const handleDelete = async (a: SavedAnimation) => {
    try {
      await deleteAnimation(a)
      toast.success('Animation supprimée')
    } catch {
      toast.error('Suppression échouée')
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement…</div>
  }

  if (animations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-sm gap-2">
        <FileCode2 className="w-8 h-8 text-white/15" />
        Aucune animation sauvegardée
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {animations.map((a) => (
          <AnimationCard
            key={a.animationId}
            animation={a}
            onDelete={handleDelete}
            onRename={renameAnimation}
          />
        ))}
      </div>
    </div>
  )
}
