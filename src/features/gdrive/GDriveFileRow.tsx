import { MoreVertical, Folder } from 'lucide-react'
import type { GDriveFile, DriveSection } from './types'

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
}

export function GDriveFileRow({ file, section }: Props) {
  const cfg = getMimeStyle(file.mimeType)
  const rawDate = section === 'shared' ? (file.sharedWithMeTime ?? file.modifiedTime) : file.modifiedTime
  const date = new Date(rawDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const sharer = file.sharingUser?.displayName ?? file.owners?.[0]?.displayName ?? ''
  const sharerPhoto = file.sharingUser?.photoLink ?? file.owners?.[0]?.photoLink

  return (
    <a
      href={file.webViewLink}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors group cursor-pointer border-b border-white/[0.03] last:border-0"
    >
      {/* Icon */}
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {cfg.isFolder
          ? <Folder className={`w-5 h-5 ${cfg.color}`} fill="currentColor" fillOpacity={0.3} />
          : <div className={`w-5 h-5 rounded-sm ${cfg.bg} flex items-center justify-center`}>
              <span className={`text-[8px] font-bold ${cfg.color}`}>{cfg.abbrev}</span>
            </div>
        }
      </div>

      {/* Name */}
      <span className="flex-1 text-sm text-white/70 truncate group-hover:text-white/90 transition-colors">{file.name}</span>

      {/* Shared by (section shared only) */}
      {section === 'shared' && (
        <div className="w-52 shrink-0 flex items-center gap-2 min-w-0">
          {sharerPhoto && <img src={sharerPhoto} alt="" className="w-5 h-5 rounded-full shrink-0" />}
          <span className="text-xs text-white/35 truncate">{sharer}</span>
        </div>
      )}

      {/* Date */}
      <span className="w-28 text-xs text-white/35 shrink-0 text-right">{date}</span>

      {/* More menu */}
      <button
        className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded hover:bg-white/10"
        onClick={(e) => e.preventDefault()}
        title="Plus d'options"
      >
        <MoreVertical className="w-3.5 h-3.5 text-white/40" />
      </button>
    </a>
  )
}
