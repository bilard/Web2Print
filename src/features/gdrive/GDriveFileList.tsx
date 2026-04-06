import { useState, useEffect, useRef } from 'react'
import { Loader2, FileText } from 'lucide-react'
import { useGoogleDrive } from './useGoogleDrive'
import { GDriveFileRow } from './GDriveFileRow'
import type { GDriveFile, DriveSection } from './types'

interface Props {
  section: DriveSection
  search: string
}

function getDateGroup(file: GDriveFile, section: DriveSection): string {
  const raw = section === 'shared' ? (file.sharedWithMeTime ?? file.modifiedTime) : file.modifiedTime
  const date = new Date(raw)
  const now = new Date()
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000
  if (diffDays <= 31) return 'Mois dernier'
  if (date.getFullYear() === now.getFullYear()) return "Au début de l'année"
  return 'Plus ancienne'
}

const GROUP_ORDER = ['Mois dernier', "Au début de l'année", 'Plus ancienne']

function groupByDate(files: GDriveFile[], section: DriveSection) {
  const map: Record<string, GDriveFile[]> = {}
  for (const f of files) {
    const g = getDateGroup(f, section)
    ;(map[g] ??= []).push(f)
  }
  return GROUP_ORDER.filter((g) => map[g]?.length > 0).map((g) => ({ label: g, files: map[g] }))
}

export function GDriveFileList({ section, search }: Props) {
  const [files, setFiles] = useState<GDriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const { listFilesBySection } = useGoogleDrive()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setFiles([])
      listFilesBySection(section, search).then(setFiles).finally(() => setLoading(false))
    }, search ? 400 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [section, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateLabel = section === 'shared' ? 'Date de partage' : 'Date de modification'
  const groups = groupByDate(files, section)

  return (
    <div className="flex flex-col min-h-0">
      {/* Column header */}
      <div className="flex items-center gap-3 px-3 pb-2 border-b border-white/[0.08] text-xs font-medium text-white/30">
        <div className="w-5 shrink-0" />
        <span className="flex-1">Nom</span>
        {section === 'shared' && <span className="w-52 shrink-0">Partagé par</span>}
        <span className="w-28 shrink-0 text-right">{dateLabel}</span>
        <div className="w-6 shrink-0" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      )}

      {!loading && files.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16">
          <FileText className="w-8 h-8 text-white/10" />
          <p className="text-sm text-white/30">Aucun fichier</p>
        </div>
      )}

      {!loading && groups.map(({ label, files: groupFiles }) => (
        <div key={label}>
          <p className="text-xs font-medium text-white/25 px-3 py-2 mt-3 first:mt-1">{label}</p>
          {groupFiles.map((file) => (
            <GDriveFileRow key={file.id} file={file} section={section} />
          ))}
        </div>
      ))}
    </div>
  )
}
