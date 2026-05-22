import { useState, useEffect, useRef } from 'react'
import { Download, Trash2, Film, Maximize2, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useUserVideos, type SavedVideo } from './useUserVideos'
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

function formatDate(v: SavedVideo): string {
  if (!v.createdAt) return ''
  const d = v.createdAt.toDate()
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function defaultLabel(v: SavedVideo): string {
  if (v.title?.trim()) return v.title.trim()
  const combined = [v.brand, v.caption].filter(Boolean).join(' — ')
  return combined || 'Sans titre'
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'video'
}

function downloadFilename(v: SavedVideo): string {
  const base = v.title?.trim() || [v.brand, v.caption].filter(Boolean).join(' — ') || `video-${v.renderId.slice(0, 8)}`
  return `${sanitizeFilename(base)}.mp4`
}

function VideoPlayer({ src, label }: { src: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    let previousDocTitle: string | null = null

    const useLabel = () => {
      if (previousDocTitle === null) previousDocTitle = document.title
      document.title = label
    }
    const restore = () => {
      if (previousDocTitle !== null) {
        document.title = previousDocTitle
        previousDocTitle = null
      }
    }

    const onFsChange = () => {
      if (document.fullscreenElement === el) useLabel()
      else if (previousDocTitle !== null) restore()
    }

    el.addEventListener('enterpictureinpicture', useLabel)
    el.addEventListener('leavepictureinpicture', restore)
    document.addEventListener('fullscreenchange', onFsChange)

    return () => {
      el.removeEventListener('enterpictureinpicture', useLabel)
      el.removeEventListener('leavepictureinpicture', restore)
      document.removeEventListener('fullscreenchange', onFsChange)
      restore()
    }
  }, [label])

  return (
    <video
      ref={videoRef}
      src={src}
      title={label}
      aria-label={label}
      className="block w-full h-full object-contain"
      controls
      controlsList="nodownload"
      preload="metadata"
      muted
    />
  )
}

interface VideoTitleProps {
  video: SavedVideo
  onRename: (title: string) => Promise<void>
}

function VideoTitle({ video, onRename }: VideoTitleProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(video.title ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = () => {
    setValue(video.title ?? '')
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setValue(video.title ?? '')
  }

  const commit = async () => {
    if (saving) return
    const trimmed = value.trim()
    const current = video.title?.trim() ?? ''
    if (trimmed === current) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(trimmed)
      toast.success('Vidéo renommée')
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
          placeholder="Nom de la vidéo"
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

  const hasTitle = !!video.title?.trim()

  return (
    <button
      onClick={startEdit}
      className="group/title flex items-center gap-1.5 text-left text-[12px] text-white/70 hover:text-white transition-colors min-w-0"
      title="Renommer"
    >
      <span className={`truncate ${hasTitle ? '' : 'italic text-white/40'}`}>{defaultLabel(video)}</span>
      <Pencil className="w-3 h-3 text-white/30 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

export function UserVideosList() {
  const { videos, loading, deleteVideo, renameVideo } = useUserVideos()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDelete = async (v: SavedVideo) => {
    try {
      await deleteVideo(v)
      toast.success('Vidéo supprimée')
    } catch (e) {
      toast.error('Suppression échouée')
    }
  }

  const handleDownload = async (v: SavedVideo) => {
    if (downloadingId) return
    setDownloadingId(v.renderId)
    const filename = downloadFilename(v)
    try {
      const res = await fetch(v.url)
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
      setDownloadingId(null)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement…</div>
  }

  if (videos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-sm gap-2">
        <Film className="w-8 h-8 text-white/15" />
        Aucune vidéo générée
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((v) => (
          <div key={v.renderId} className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden group">
            <div className="bg-black flex items-center justify-center" style={{ aspectRatio: ASPECT_RATIO[v.aspect] }}>
              <VideoPlayer src={v.url} label={defaultLabel(v)} />
            </div>
            <div className="px-3 py-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono tabular-nums">
                <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3" />{ASPECT_LABEL[v.aspect]}</span>
                {v.durationMs !== null && (
                  <>
                    <span className="text-white/20">·</span>
                    <span>{Math.round(v.durationMs / 1000)}s</span>
                  </>
                )}
                <span className="text-white/20">·</span>
                <span className="truncate">{formatDate(v)}</span>
              </div>
              <VideoTitle video={v} onRename={(title) => renameVideo(v, title)} />
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => void handleDownload(v)}
                  disabled={downloadingId === v.renderId}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 text-white text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors"
                  title={`Télécharger ${downloadFilename(v)}`}
                >
                  <Download className="w-3 h-3" />
                  {downloadingId === v.renderId ? 'Téléchargement…' : 'Télécharger'}
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="flex items-center justify-center bg-white/5 hover:bg-red-500/15 hover:text-red-300 border border-white/10 text-white/60 px-2 py-1.5 rounded-md transition-colors"
                  aria-label="Supprimer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
