// src/features/gdrive/GDrivePickerModal.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Home,
  Users,
  Clock,
  Star,
  Search,
  ChevronRight,
  Loader2,
  FileText,
  Folder,
  LogIn,
  AlertCircle,
} from 'lucide-react'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGoogleDrive } from './useGoogleDrive'
import type { DriveSection, GDriveFile } from './types'

interface PickedFile {
  id: string
  name: string
  mimeType: string
}

interface Props {
  open: boolean
  onClose: () => void
  onPick: (file: PickedFile) => void
  /** Filtre optionnel sur le mimeType visible (les autres fichiers sont masqués). */
  mimeFilter?: 'sheets' | 'all'
  title?: string
}

const SECTIONS: { id: DriveSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'my-drive', label: 'Mon Drive', icon: Home },
  { id: 'shared', label: 'Partagés', icon: Users },
  { id: 'recent', label: 'Récents', icon: Clock },
  { id: 'starred', label: 'Suivis', icon: Star },
]

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function mimeBadge(mimeType: string): { abbrev: string; color: string; bg: string } {
  if (mimeType === SHEETS_MIME) return { abbrev: 'S', color: 'text-green-400', bg: 'bg-green-500/20' }
  if (mimeType === 'application/vnd.google-apps.document') return { abbrev: 'W', color: 'text-blue-400', bg: 'bg-blue-500/20' }
  if (mimeType === 'application/vnd.google-apps.presentation') return { abbrev: 'P', color: 'text-amber-400', bg: 'bg-amber-500/20' }
  if (mimeType.includes('pdf')) return { abbrev: 'P', color: 'text-red-400', bg: 'bg-red-500/20' }
  if (mimeType.startsWith('image/')) return { abbrev: 'I', color: 'text-sky-400', bg: 'bg-sky-500/20' }
  return { abbrev: '~', color: 'text-white/40', bg: 'bg-white/10' }
}

interface FolderCrumb {
  id: string
  name: string
}

export function GDrivePickerModal({ open, onClose, onPick, mimeFilter = 'all', title }: Props) {
  const accessToken = useGDriveStore((s) => s.accessToken)
  const accountEmail = useGDriveStore((s) => s.accountEmail)
  const { connectDrive, listFilesBySection, listFilesByParent, disconnect } = useGoogleDrive()

  const [section, setSection] = useState<DriveSection>('my-drive')
  const [search, setSearch] = useState('')
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([])
  const [files, setFiles] = useState<GDriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentFolder = folderStack[folderStack.length - 1] ?? null

  useEffect(() => {
    if (!open || !accessToken) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      const req = currentFolder
        ? listFilesByParent(currentFolder.id, search)
        : listFilesBySection(section, search)
      req.then(setFiles).finally(() => setLoading(false))
    }, search ? 400 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, accessToken, section, search, currentFolder, listFilesBySection, listFilesByParent])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleConnect = async () => {
    setError(null)
    setConnecting(true)
    try {
      await connectDrive()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion échouée')
    } finally {
      setConnecting(false)
    }
  }

  const handleSection = useCallback((id: DriveSection) => {
    setSection(id)
    setSearch('')
    setFolderStack([])
  }, [])

  const handleOpenFolder = useCallback((file: GDriveFile) => {
    setFolderStack((s) => [...s, { id: file.id, name: file.name }])
    setSearch('')
  }, [])

  const handleCrumb = useCallback((index: number) => {
    setFolderStack((s) => (index < 0 ? [] : s.slice(0, index + 1)))
    setSearch('')
  }, [])

  const handlePick = (file: GDriveFile) => {
    onPick({ id: file.id, name: file.name, mimeType: file.mimeType })
    onClose()
  }

  if (!open) return null

  // Filtrage : on garde toujours les dossiers (pour navigation) + les fichiers
  // qui matchent le filtre demandé.
  const visibleFiles = files.filter((f) => {
    if (f.mimeType === FOLDER_MIME) return true
    if (mimeFilter === 'sheets') return f.mimeType === SHEETS_MIME
    return true
  })

  const sectionLabel = SECTIONS.find((s) => s.id === section)?.label ?? ''

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[860px] max-w-[95vw] h-[640px] max-h-[90vh] bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="w-48 shrink-0 bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col gap-3 p-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 87.3 78" className="w-6 h-6 shrink-0">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
              <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335" />
              <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d" />
              <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc" />
              <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
            </svg>
            <span className="text-sm font-medium text-white/80">{title ?? 'Drive'}</span>
          </div>
          {accessToken ? (
            <>
              <nav className="flex flex-col gap-0.5">
                {SECTIONS.map(({ id, label, icon: Icon }) => {
                  const isActive = section === id && folderStack.length === 0
                  return (
                    <button
                      key={id}
                      onClick={() => handleSection(id)}
                      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-300 font-medium'
                          : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </nav>
              <div className="mt-auto text-[10px] text-white/30 truncate" title={accountEmail ?? ''}>
                {accountEmail ?? ''}
              </div>
              <button
                onClick={disconnect}
                className="text-[10px] text-white/40 hover:text-red-400 self-start"
              >
                Déconnecter
              </button>
            </>
          ) : null}
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="text-sm text-white/80">
              {mimeFilter === 'sheets' ? 'Sélectionner un Google Sheets' : 'Sélectionner un fichier Drive'}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/5 text-white/50 hover:text-white"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {!accessToken ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(66,133,244,0.2), rgba(52,168,83,0.2), rgba(251,188,5,0.2))',
                }}
              >
                <svg viewBox="0 0 87.3 78" className="w-8 h-8">
                  <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                  <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335" />
                  <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d" />
                  <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc" />
                  <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
              </div>
              <p className="text-sm text-white/70 max-w-xs leading-relaxed">
                Connectez votre Google Drive pour parcourir vos fichiers.
              </p>
              {error ? (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 max-w-sm">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-white text-gray-800 font-medium text-sm hover:bg-white/90 disabled:opacity-50 transition-colors"
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {connecting ? 'Connexion…' : 'Se connecter avec Google'}
              </button>
            </div>
          ) : (
            <>
              {/* Search + breadcrumb */}
              <div className="px-4 py-3 border-b border-white/[0.06] flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={currentFolder ? `Rechercher dans ${currentFolder.name}` : 'Rechercher dans Drive'}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-blue-500/40"
                  />
                </div>
                {folderStack.length > 0 && (
                  <nav className="flex items-center gap-1 text-xs flex-wrap">
                    <button
                      onClick={() => handleCrumb(-1)}
                      className="text-white/50 hover:text-white px-1"
                    >
                      {sectionLabel}
                    </button>
                    {folderStack.map((c, i) => {
                      const isLast = i === folderStack.length - 1
                      return (
                        <div key={c.id} className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-white/25" />
                          {isLast ? (
                            <span className="text-white px-1 truncate max-w-[200px]" title={c.name}>
                              {c.name}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCrumb(i)}
                              className="text-white/50 hover:text-white px-1 truncate max-w-[180px]"
                              title={c.name}
                            >
                              {c.name}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </nav>
                )}
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
                  </div>
                ) : visibleFiles.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16">
                    <FileText className="w-8 h-8 text-white/10" />
                    <p className="text-xs text-white/30">Aucun fichier</p>
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {visibleFiles.map((f) => {
                      const isFolder = f.mimeType === FOLDER_MIME
                      const badge = mimeBadge(f.mimeType)
                      const date = new Date(f.modifiedTime).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => (isFolder ? handleOpenFolder(f) : handlePick(f))}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/[0.05] text-left transition-colors group"
                          >
                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                              {isFolder ? (
                                <Folder className="w-5 h-5 text-amber-300" fill="currentColor" fillOpacity={0.3} />
                              ) : (
                                <div className={`w-5 h-5 rounded-sm ${badge.bg} flex items-center justify-center`}>
                                  <span className={`text-[8px] font-bold ${badge.color}`}>{badge.abbrev}</span>
                                </div>
                              )}
                            </div>
                            <span className="flex-1 text-sm text-white/80 truncate group-hover:text-white">
                              {f.name}
                            </span>
                            <span className="text-[11px] text-white/30 shrink-0">{date}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
