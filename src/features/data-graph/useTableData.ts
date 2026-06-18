// src/features/data-graph/useTableData.ts
import { useEffect, useState } from 'react'
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { QuerySpec } from './firestoreSchema'

export interface TableRow {
  _docId: string
  [k: string]: unknown
}

const MAX_ROWS = 100

/** Charge en LIVE (onSnapshot) les documents d'une collection selon son `QuerySpec`,
 *  scopé à l'utilisateur courant. `spec` null = pas de requête. Les erreurs de
 *  permission n'explosent pas : `error` est renseigné, `rows` reste vide. */
export function useTableData(spec: QuerySpec | null) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [rows, setRows] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spec || !uid) {
      setRows([]); setError(null); setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const path = spec.path.replace('{uid}', uid)
    const base = collection(db, path)
    const q = spec.ownerField
      ? query(base, where(spec.ownerField, '==', uid), limit(MAX_ROWS))
      : query(base, limit(MAX_ROWS))

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ _docId: d.id, ...(d.data() as Record<string, unknown>) })))
        setLoading(false)
      },
      (err) => {
        setError(err.code === 'permission-denied' ? 'Accès restreint à cette collection.' : err.message)
        setRows([])
        setLoading(false)
      },
    )
    return unsub
  }, [spec, uid])

  return { rows, loading, error }
}
