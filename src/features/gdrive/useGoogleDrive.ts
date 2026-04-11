import { useCallback } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { useGDriveStore } from '@/stores/gdrive.store'
import type { GDriveFile, DriveSection } from './types'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FILE_FIELDS = 'files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,sharedWithMeTime,viewedByMeTime,sharingUser,owners)'

const SECTION_QUERIES: Record<DriveSection, { q: string; orderBy: string }> = {
  'my-drive': { q: "'root' in parents and trashed=false",    orderBy: 'modifiedTime desc' },
  'shared':   { q: 'sharedWithMe=true and trashed=false',    orderBy: 'sharedWithMeTime desc' },
  'recent':   { q: 'trashed=false',                          orderBy: 'modifiedTime desc' },
  'starred':  { q: 'starred=true and trashed=false',         orderBy: 'modifiedTime desc' },
}

export function useGoogleDrive() {
  const { accessToken, connect, disconnect } = useGDriveStore()

  const connectDrive = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    provider.addScope(DRIVE_SCOPE)
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

  const listFilesByParent = useCallback((parentId: string, search: string): Promise<GDriveFile[]> => {
    const base = `'${parentId}' in parents and trashed=false`
    const finalQ = search.trim() ? `${base} and name contains '${search.trim().replace(/'/g, "\\'")}'` : base
    return runQuery(finalQ, 'folder,modifiedTime desc')
  }, [runQuery])

  return { connectDrive, listFilesBySection, listFilesByParent, disconnect }
}
