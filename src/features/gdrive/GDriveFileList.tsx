import { useState, useEffect, useRef, useMemo } from 'react'
import { Loader2, FileText, Trash2, CheckSquare, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useGoogleDrive } from './useGoogleDrive'
import { GDriveFileRow } from './GDriveFileRow'
import { trashDriveFiles, restoreDriveFiles, deleteDriveFilesForever } from '@/features/dam/damCleanup'
import type { GDriveFile, DriveSection } from './types'
import { t } from '@/lib/i18n'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface Props {
  section: DriveSection
  search: string
  parentId: string | null
  onFolderOpen: (file: GDriveFile) => void
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

export function GDriveFileList({ section, search, parentId, onFolderOpen }: Props) {
  const [files, setFiles] = useState<GDriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [reloadKey, setReloadKey] = useState(0)
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const { listFilesBySection, listFilesByParent, countFolderFiles } = useGoogleDrive()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setFiles([])
      // En corbeille, on liste les ENFANTS EN CORBEILLE d'un dossier (trashed=true).
      const request = parentId
        ? listFilesByParent(parentId, search, section === 'trash')
        : listFilesBySection(section, search)
      request.then(setFiles).finally(() => setLoading(false))
    }, search ? 400 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [section, search, parentId, reloadKey])

  // Reset la sélection au changement de dossier/section/recherche.
  useEffect(() => { setSelected(new Set()) }, [section, search, parentId])

  const isTrash = section === 'trash'

  // En corbeille, à la racine : masquer les éléments dont un parent est lui-même
  // un dossier en corbeille (on les voit en entrant dans le dossier) → respecte
  // la hiérarchie au lieu de tout afficher à plat. MÉMOÏSÉ : sinon un nouveau
  // tableau à chaque rendu relance l'effet de comptage → boucle infinie (gel).
  const displayFiles = useMemo(() => {
    if (!isTrash || parentId) return files
    const trashedFolderIds = new Set(files.filter((f) => f.mimeType === FOLDER_MIME).map((f) => f.id))
    return files.filter((f) => !(f.parents ?? []).some((p) => trashedFolderIds.has(p)))
  }, [files, isTrash, parentId])

  // Compte le contenu de chaque dossier affiché (en corbeille = enfants en corbeille).
  useEffect(() => {
    let cancelled = false
    const folderIds = displayFiles.filter((f) => f.mimeType === FOLDER_MIME).map((f) => f.id)
    void Promise.all(folderIds.map(async (id) => [id, await countFolderFiles(id, isTrash)] as const))
      .then((pairs) => { if (!cancelled) setFolderCounts(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [displayFiles, countFolderFiles, isTrash])

  const nonFolderFiles = displayFiles.filter((f) => f.mimeType !== FOLDER_MIME)
  const allSelected = nonFolderFiles.length > 0 && nonFolderFiles.every((f) => selected.has(f.id))
  const toggleSelect = (file: GDriveFile) =>
    setSelected((s) => { const n = new Set(s); if (n.has(file.id)) n.delete(file.id); else n.add(file.id); return n })
  const toggleSelectAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(nonFolderFiles.map((f) => f.id))))
  const runOp = async (
    fn: (ids: string[]) => Promise<number>,
    ids: string[],
    done: (n: number) => string,
  ) => {
    if (ids.length === 0) return
    try {
      const n = await fn(ids)
      setSelected(new Set())
      setReloadKey((k) => k + 1)
      toast.success(done(n))
    } catch (e) {
      toast.error(`Opération : ${e instanceof Error ? e.message : 'échec'}`)
    }
  }
  const trash = (ids: string[], label: string) =>
    runOp(trashDriveFiles, ids, (n) => `${n} ${label}${n > 1 ? 's' : ''} déplacé${n > 1 ? 's' : ''} dans la corbeille Drive`)
  const restore = (ids: string[]) =>
    runOp(restoreDriveFiles, ids, (n) => `${n} fichier${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''}`)
  const deleteForever = (ids: string[]) => {
    if (ids.length === 0) return
    if (!window.confirm(`Supprimer DÉFINITIVEMENT ${ids.length} fichier(s) ? Cette action est irréversible.`)) return
    void runOp(deleteDriveFilesForever, ids, (n) => `${n} fichier${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''} définitivement`)
  }
  const rowActions = isTrash
    ? { onRestore: (f: GDriveFile) => void restore([f.id]), onDeleteForever: (f: GDriveFile) => deleteForever([f.id]) }
    : { onTrash: (f: GDriveFile) => void trash([f.id], f.mimeType === FOLDER_MIME ? 'dossier' : 'fichier') }

  const dateLabel = section === 'shared' ? 'Date de partage' : 'Date de modification'
  const groups = parentId ? null : groupByDate(displayFiles, section)
  const folders = parentId ? displayFiles.filter((f) => f.mimeType === FOLDER_MIME) : []
  const nonFolders = parentId ? displayFiles.filter((f) => f.mimeType !== FOLDER_MIME) : []

  return (
    <div className="flex flex-col min-h-0">
      {/* Barre d'actions : sélection multiple + corbeille */}
      {!loading && nonFolderFiles.length > 0 && (
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 text-[12px] transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          {selected.size > 0 && (isTrash ? (
            <>
              <button
                type="button"
                onClick={() => void restore([...selected])}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-[12px] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurer ({selected.size})
              </button>
              <button
                type="button"
                onClick={() => deleteForever([...selected])}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[12px] transition-colors"
                title={t('gd.deleteForever')}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer définitivement ({selected.size})
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void trash([...selected], 'fichier')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 text-[12px] transition-colors"
              title={t('gd.trashSelection')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Corbeille ({selected.size})
            </button>
          ))}
        </div>
      )}

      {/* Column header */}
      <div className="flex items-center gap-3 px-3 pb-2 border-b border-white/[0.08] text-xs font-medium text-white/30">
        <div className="w-5 shrink-0" />
        <span className="flex-1">Nom</span>
        {section === 'shared' && !parentId && <span className="w-52 shrink-0">{t('gd.sharedBy')}</span>}
        <span className="w-28 shrink-0 text-right">{dateLabel}</span>
        <div className="w-6 shrink-0" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      )}

      {!loading && displayFiles.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16">
          <FileText className="w-8 h-8 text-white/10" />
          <p className="text-sm text-white/30">Aucun fichier</p>
        </div>
      )}

      {!loading && parentId && folders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/25 px-3 py-2 mt-1">Dossiers ({folders.length})</p>
          {folders.map((file) => (
            <GDriveFileRow key={file.id} file={file} section={section} onFolderOpen={onFolderOpen} fileCount={folderCounts[file.id]}
              selected={selected.has(file.id)} onToggleSelect={toggleSelect} {...rowActions} />
          ))}
        </div>
      )}

      {!loading && parentId && nonFolders.length > 0 && (
        <div>
          <p className="text-xs font-medium text-white/25 px-3 py-2 mt-3">Fichiers ({nonFolders.length})</p>
          {nonFolders.map((file) => (
            <GDriveFileRow key={file.id} file={file} section={section} onFolderOpen={onFolderOpen} fileCount={folderCounts[file.id]}
              selected={selected.has(file.id)} onToggleSelect={toggleSelect} {...rowActions} />
          ))}
        </div>
      )}

      {!loading && !parentId && groups?.map(({ label, files: groupFiles }) => (
        <div key={label}>
          <p className="text-xs font-medium text-white/25 px-3 py-2 mt-3 first:mt-1">{label} ({groupFiles.length})</p>
          {groupFiles.map((file) => (
            <GDriveFileRow key={file.id} file={file} section={section} onFolderOpen={onFolderOpen} fileCount={folderCounts[file.id]}
              selected={selected.has(file.id)} onToggleSelect={toggleSelect} {...rowActions} />
          ))}
        </div>
      ))}
    </div>
  )
}
