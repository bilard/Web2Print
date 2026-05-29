import { useState, useEffect, useRef } from 'react'
import { Download, Trash2, FileCode2, Maximize2, Pencil, Check, X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useUserAnimations, type SavedAnimation } from './useUserAnimations'
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
  // eslint-disable-next-line no-control-regex -- on retire volontairement les caractères de contrôle d'un nom de fichier
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

/** Card animation DAM. Poster statique + métadonnées + actions. Pas de preview
 *  live ici : les compositions enrichies (Nano Banana + base64/Storage URLs) ne
 *  rendent pas fiablement dans une iframe miniature avec srcDoc, et la card est
 *  contrainte par aspect-ratio donc les contrôles du player débordent. L'aperçu
 *  complet se fait via "Voir" (ouvre le ZIP dans un nouvel onglet) ou en
 *  téléchargeant le ZIP (qui s'auto-play). */
function AnimationCard({ animation, onDelete, onRename }: {
  animation: SavedAnimation
  onDelete: (a: SavedAnimation) => void
  onRename: (a: SavedAnimation, title: string) => Promise<void>
}) {
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

  /** Ouvre l'animation dans un nouvel onglet. Télécharge le ZIP depuis Storage,
   *  extrait l'index.html (self-contained, autoplay inclus) et le sert en blob
   *  URL. On passe par le ZIP plutôt que par la composition Firestore parce
   *  que le mode design-reveal (canvas) embarque le SVG capturé dans le ZIP
   *  uniquement — Firestore ne stocke pas le SVG (trop volumineux + pas
   *  nécessaire à la liste DAM). */
  const handleOpenPreview = async () => {
    try {
      const JSZip = (await import('jszip')).default
      const res = await fetch(animation.url)
      if (!res.ok) throw new Error(`HTTP ${res.status} en récupérant le ZIP`)
      const zip = await JSZip.loadAsync(await res.blob())
      const html = await zip.file('index.html')?.async('string')
      if (!html) throw new Error('index.html introuvable dans le ZIP')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      // Pas de revokeObjectURL — le nouvel onglet en a besoin pendant tout
      // son cycle de vie.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Ouverture échouée : ${msg}`)
    }
  }

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden group">
      <button
        onClick={() => void handleOpenPreview()}
        className="bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 flex flex-col items-center justify-center gap-3 relative w-full hover:from-indigo-500/20 hover:to-fuchsia-500/20 transition-colors"
        style={{ aspectRatio: ASPECT_RATIO[animation.aspect] }}
        title="Ouvrir l'animation dans un nouvel onglet"
      >
        <FileCode2 className="w-10 h-10 text-white/30 group-hover:text-white/60 transition-colors" />
        <span className="text-[10px] uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">
          HTML / CSS / JS
        </span>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/10 border border-white/20 text-[10px] text-white/70">
          <ExternalLink className="w-3 h-3" />
          Ouvrir
        </div>
      </button>
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
