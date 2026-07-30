import { Folder, Trash2, Check, RotateCcw } from 'lucide-react'
import { DamImage } from '@/features/dam/DamImage'
import { driveWebViewLink } from '@/features/dam/driveAssets'
import type { GDriveFile, DriveSection } from './types'
import { t } from '@/lib/i18n'

function getMimeStyle(mimeType: string): { abbrev: string; color: string; bg: string; isFolder: boolean } {
  if (mimeType === 'application/vnd.google-apps.folder')       return { abbrev: '', color: 'text-amber-300', bg: '', isFolder: true }
  if (mimeType === 'application/vnd.google-apps.document')     return { abbrev: 'W', color: 'text-blue-400',  bg: 'bg-blue-500/20',   isFolder: false }
  if (mimeType === 'application/vnd.google-apps.spreadsheet')  return { abbrev: 'S', color: 'text-green-400', bg: 'bg-green-500/20',  isFolder: false }
  if (mimeType === 'application/vnd.google-apps.presentation') return { abbrev: 'P', color: 'text-amber-400', bg: 'bg-amber-500/20',  isFolder: false }
  if (mimeType === 'application/vnd.google-apps.form')         return { abbrev: 'F', color: 'text-purple-400',bg: 'bg-purple-500/20', isFolder: false }
  if (mimeType.includes('pdf'))                                return { abbrev: 'P', color: 'text-red-400',   bg: 'bg-red-500/20',    isFolder: false }
  if (mimeType.startsWith('image/'))                           return { abbrev: 'I', color: 'text-sky-400',   bg: 'bg-sky-500/20',    isFolder: false }
  return { abbrev: '~', color: 'text-white/40', bg: 'bg-white/10', isFolder: false }
}

interface Props {
  file: GDriveFile
  section: DriveSection
  onFolderOpen?: (file: GDriveFile) => void
  /** Si fourni, affiche une case de sélection (fichiers non-dossier). */
  selected?: boolean
  onToggleSelect?: (file: GDriveFile) => void
  /** Si fourni, affiche une corbeille au survol (mise en corbeille). */
  onTrash?: (file: GDriveFile) => void
  /** Mode corbeille : restaurer le fichier. */
  onRestore?: (file: GDriveFile) => void
  /** Mode corbeille : supprimer définitivement (irréversible). */
  onDeleteForever?: (file: GDriveFile) => void
  /** Nombre d'éléments dans le dossier (affiché « Nom (N) »). */
  fileCount?: number
}

export function GDriveFileRow({ file, section, onFolderOpen, selected, onToggleSelect, onTrash, onRestore, onDeleteForever, fileCount }: Props) {
  const cfg = getMimeStyle(file.mimeType)
  const isImage = !cfg.isFolder && file.mimeType.startsWith('image/')
  const rawDate = section === 'shared' ? (file.sharedWithMeTime ?? file.modifiedTime) : file.modifiedTime
  const date = new Date(rawDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const sharer = file.sharingUser?.displayName ?? file.owners?.[0]?.displayName ?? ''
  const sharerPhoto = file.sharingUser?.photoLink ?? file.owners?.[0]?.photoLink

  const handleNav = (e: React.MouseEvent) => {
    if (cfg.isFolder && onFolderOpen) {
      e.preventDefault()
      onFolderOpen(file)
    }
  }

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg group border-b border-white/[0.03] last:border-0 transition-colors ${
        selected ? 'bg-blue-500/15' : 'hover:bg-white/[0.04]'
      }`}
    >
      {/* Case de sélection (fichiers seulement) */}
      {onToggleSelect && !cfg.isFolder && (
        <button
          type="button"
          onClick={() => onToggleSelect(file)}
          className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
            selected ? 'bg-blue-500 border-blue-500' : 'border-white/25 hover:border-white/50'
          }`}
          aria-label={t('gd.select')}
        >
          {selected && <Check className="w-3 h-3 text-[#fff]" />}
        </button>
      )}

      {/* Icône / vignette + nom (zone cliquable) */}
      <a
        href={file.webViewLink}
        target={cfg.isFolder ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={handleNav}
        className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer"
      >
        {cfg.isFolder ? (
          <div className="w-9 h-9 shrink-0 flex items-center justify-center">
            <Folder className={`w-5 h-5 ${cfg.color}`} fill="currentColor" fillOpacity={0.3} />
          </div>
        ) : isImage ? (
          <DamImage value={driveWebViewLink(file.id)} className="w-9 h-9 shrink-0 rounded object-cover bg-white/5 border border-white/10" />
        ) : (
          <div className="w-9 h-9 shrink-0 flex items-center justify-center">
            <div className={`w-5 h-5 rounded-sm ${cfg.bg} flex items-center justify-center`}>
              <span className={`text-[8px] font-bold ${cfg.color}`}>{cfg.abbrev}</span>
            </div>
          </div>
        )}
        <span className="flex-1 text-sm text-white/70 truncate group-hover:text-white/90 transition-colors">
          {file.name}
          {cfg.isFolder && typeof fileCount === 'number' && (
            <span className="ml-1.5 text-xs text-white/35">({fileCount})</span>
          )}
        </span>
      </a>

      {/* Partagé par (section "shared") */}
      {section === 'shared' && (
        <div className="w-52 shrink-0 flex items-center gap-2 min-w-0">
          {sharerPhoto && <img src={sharerPhoto} alt="" className="w-5 h-5 rounded-full shrink-0" />}
          <span className="text-xs text-white/35 truncate">{sharer}</span>
        </div>
      )}

      <span className="w-28 text-xs text-white/35 shrink-0 text-right">{date}</span>

      <div className="flex items-center shrink-0">
        {onRestore && (
          <button
            type="button"
            onClick={() => onRestore(file)}
            className="w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10"
            title="Restaurer depuis la corbeille"
            aria-label="Restaurer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {onTrash && (
          <button
            type="button"
            onClick={() => onTrash(file)}
            className="w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded text-white/30 hover:text-red-400 hover:bg-red-500/10"
            title={t('gd.trash')}
            aria-label="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onDeleteForever && (
          <button
            type="button"
            onClick={() => onDeleteForever(file)}
            className="w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded text-red-400/60 hover:text-red-300 hover:bg-red-500/20"
            title={t('gd.deleteForever')}
            aria-label={t('gd.deleteForeverShort')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
