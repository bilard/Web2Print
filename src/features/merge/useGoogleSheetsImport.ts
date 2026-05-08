import { useCallback, useState } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { parseExcelFile } from '@/features/excel/useExcelImport'
import { useDataMerge } from './useDataMerge'
import type { DataSourceRef } from '@/stores/merge.store'

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
]
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface SheetsFile {
  id: string
  name: string
  modifiedTime: string
  owners?: Array<{ displayName: string }>
}

export function useGoogleSheetsImport() {
  const user = useAuthStore((s) => s.user)
  const { accessToken, connect: storeConnect, disconnect } = useGDriveStore()
  const { saveToFirebase } = useExcelFirebase()
  const { connectSource } = useDataMerge()

  const [connecting, setConnecting] = useState(false)
  const [importing, setImporting] = useState<string | null>(null) // fileId being imported
  const [error, setError] = useState<string | null>(null)

  /** Se connecte à Google Drive et stocke le token */
  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const provider = new GoogleAuthProvider()
      for (const scope of DRIVE_SCOPES) provider.addScope(scope)
      provider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const token = credential?.accessToken
      if (!token) throw new Error('Impossible de récupérer le token Google')
      storeConnect(token, result.user.email ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setConnecting(false)
    }
  }, [storeConnect])

  /** Liste les fichiers Google Sheets accessibles */
  const listSheetsFiles = useCallback(async (search = ''): Promise<SheetsFile[]> => {
    if (!accessToken) return []
    const base = `mimeType='${SHEETS_MIME}' and trashed=false`
    const q = search.trim() ? `${base} and name contains '${search.trim()}'` : base
    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,modifiedTime,owners)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
    })
    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      if (res.status === 401) disconnect()
      return []
    }
    const data = await res.json() as { files: SheetsFile[] }
    return data.files ?? []
  }, [accessToken, disconnect])

  /** Importe un fichier Sheets via l'export Drive (XLSX) */
  const importFile = useCallback(async (file: SheetsFile) => {
    if (!user || !accessToken) return
    setError(null)
    setImporting(file.id)

    try {
      const res = await fetch(
        `${DRIVE_API}/files/${file.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) {
        if (res.status === 403) throw new Error('Accès refusé au document')
        throw new Error(`Erreur export : ${res.status}`)
      }

      const blob = await res.blob()
      const fileName = `${file.name}.sheets`
      const fakeFile = new File([blob], fileName, { type: XLSX_MIME })

      const sheets = await parseExcelFile(fakeFile)
      if (sheets.length === 0) throw new Error('Aucune donnée trouvée dans le document')

      const docId = await saveToFirebase(fileName, sheets)
      if (!docId) throw new Error('Échec de la sauvegarde Firebase')

      const source: DataSourceRef = {
        excelDocId: docId,
        sheetIndex: 0,
        fileName,
      }
      await connectSource(source)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      console.error('[GoogleSheetsImport]', err)
    } finally {
      setImporting(null)
    }
  }, [user, accessToken, saveToFirebase, connectSource])

  return {
    connected: !!accessToken,
    connecting,
    importing,
    error,
    clearError: () => setError(null),
    connect,
    disconnect,
    listSheetsFiles,
    importFile,
  }
}
