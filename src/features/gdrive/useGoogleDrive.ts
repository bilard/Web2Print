import { useCallback } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { useGDriveStore } from '@/stores/gdrive.store'
import type { GDriveFile, DriveSection } from './types'

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  // Permet aux nodes d'export workflow de créer/écrire des fichiers que l'app a créés.
  'https://www.googleapis.com/auth/drive.file',
]
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FILE_FIELDS = 'files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,parents,sharedWithMeTime,viewedByMeTime,sharingUser,owners)'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const SECTION_QUERIES: Record<DriveSection, { q: string; orderBy: string }> = {
  'my-drive': { q: "'root' in parents and trashed=false",    orderBy: 'modifiedTime desc' },
  'shared':   { q: 'sharedWithMe=true and trashed=false',    orderBy: 'sharedWithMeTime desc' },
  'recent':   { q: 'trashed=false',                          orderBy: 'modifiedTime desc' },
  'starred':  { q: 'starred=true and trashed=false',         orderBy: 'modifiedTime desc' },
  'trash':    { q: 'trashed=true',                           orderBy: 'modifiedTime desc' },
}

export function useGoogleDrive() {
  const { accessToken, connect, disconnect } = useGDriveStore()

  const connectDrive = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    for (const scope of DRIVE_SCOPES) provider.addScope(scope)
    provider.setCustomParameters({ login_hint: 'ibs.studio@gmail.com', prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    const token = credential?.accessToken
    if (token) connect(token, result.user.email ?? '')
  }, [connect])

  const runQuery = useCallback(async (q: string, orderBy: string): Promise<GDriveFile[]> => {
    if (!accessToken) return []
    const params = new URLSearchParams({ q, fields: FILE_FIELDS, orderBy, pageSize: '100' })
    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      if (res.status === 401) disconnect()
      return []
    }
    const data = await res.json() as { files: GDriveFile[] }
    return data.files ?? []
  }, [accessToken, disconnect])

  const listFilesBySection = useCallback((section: DriveSection, search: string): Promise<GDriveFile[]> => {
    const { q, orderBy } = SECTION_QUERIES[section]
    const finalQ = search.trim() ? `${q} and name contains '${search.trim().replace(/'/g, "\\'")}'` : q
    return runQuery(finalQ, orderBy)
  }, [runQuery])

  const listFilesByParent = useCallback((parentId: string, search: string, trashed = false): Promise<GDriveFile[]> => {
    const base = `'${parentId}' in parents and trashed=${trashed}`
    const finalQ = search.trim() ? `${base} and name contains '${search.trim().replace(/'/g, "\\'")}'` : base
    return runQuery(finalQ, 'folder,modifiedTime desc')
  }, [runQuery])

  /** Nombre d'éléments dans un dossier (trashed=false par défaut ; true en corbeille). */
  const countFolderFiles = useCallback(async (folderId: string, trashed = false): Promise<number> => {
    if (!accessToken) return 0
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=${trashed}`, fields: 'files(id)', pageSize: '1000',
    })
    const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return 0
    const data = (await res.json()) as { files?: unknown[] }
    return data.files?.length ?? 0
  }, [accessToken])

  /** Crée un dossier (scope drive.file). `parentId` absent → racine « Mon Drive ». */
  const createFolder = useCallback(async (name: string, parentId?: string): Promise<GDriveFile | null> => {
    if (!accessToken || !name.trim()) return null
    const body: { name: string; mimeType: string; parents?: string[] } = { name: name.trim(), mimeType: FOLDER_MIME }
    if (parentId) body.parents = [parentId]
    const res = await fetch(`${DRIVE_API}/files?fields=id,name,mimeType,modifiedTime,parents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      if (res.status === 401) disconnect()
      return null
    }
    return (await res.json()) as GDriveFile
  }, [accessToken, disconnect])

  return { connectDrive, listFilesBySection, listFilesByParent, countFolderFiles, createFolder, disconnect }
}
