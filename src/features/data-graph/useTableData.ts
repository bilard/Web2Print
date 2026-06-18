// src/features/data-graph/useTableData.ts
import { useEffect, useState } from 'react'
import { collection, query, where, limit, onSnapshot, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { QuerySpec } from './firestoreSchema'
import { parseMaybeJson, asSheets } from './formatValue'

export interface TableRow {
  _docId: string
  [k: string]: unknown
}

const MAX_ROWS = 500
const FLAT_MAX = 5000

/** Agrège les sous-docs d'une sous-collection : liste les parents possédés par le user,
 *  puis charge leurs sous-docs (one-shot — les règles interdisent un collectionGroup). */
async function loadSubcollection(spec: QuerySpec, uid: string): Promise<TableRow[]> {
  const sub = spec.subOf!
  const parents = await getDocs(query(collection(db, sub.parentPath), where(sub.parentOwnerField, '==', uid)))
  const out: TableRow[] = []
  for (const parent of parents.docs) {
    if (out.length >= MAX_ROWS) break
    const snap = await getDocs(query(collection(db, sub.parentPath, parent.id, spec.path), limit(MAX_ROWS)))
    snap.docs.forEach((d) => out.push({ _docId: d.id, _parent: parent.id, ...(d.data() as Record<string, unknown>) }))
  }
  return out.slice(0, MAX_ROWS)
}

/** Charge les documents d'une collection selon son `QuerySpec`, scopé à l'utilisateur
 *  courant. Top-level/sous-coll user = LIVE (onSnapshot) ; sous-collection agrégée =
 *  one-shot (`live` false). `spec` null = pas de requête. Erreurs gérées (pas de crash). */
export function useTableData(spec: QuerySpec | null) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [rows, setRows] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(true)

  useEffect(() => {
    if (!spec || !uid) {
      setRows([]); setError(null); setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const onErr = (err: { code?: string; message: string }) => {
      setError(err.code === 'permission-denied' ? 'Accès restreint à cette collection.' : err.message)
      setRows([]); setLoading(false)
    }

    // Feuilles aplaties → LIVE sur la collection, puis on explose chaque doc en lignes.
    if (spec.flattenSheets) {
      setLive(true)
      const base = collection(db, spec.path.replace('{uid}', uid))
      const q = spec.ownerField ? query(base, where(spec.ownerField, '==', uid)) : query(base)
      const field = spec.flattenSheets
      const unsub = onSnapshot(
        q,
        (snap) => {
          const out: TableRow[] = []
          for (const d of snap.docs) {
            const sheets = asSheets(parseMaybeJson((d.data() as Record<string, unknown>)[field]))
            if (!sheets) continue
            for (const s of sheets) {
              for (const r of s.rows) {
                if (out.length >= FLAT_MAX) break
                out.push({ _docId: `${d.id}:${out.length}`, feuille: s.name ?? d.id, ...r })
              }
            }
          }
          setRows(out)
          setLoading(false)
        },
        onErr,
      )
      return unsub
    }

    // Sous-collection agrégée → chargement one-shot.
    if (spec.subOf) {
      setLive(false)
      let alive = true
      loadSubcollection(spec, uid)
        .then((r) => { if (alive) { setRows(r); setLoading(false) } })
        .catch((e) => { if (alive) onErr(e) })
      return () => { alive = false }
    }

    // Collection (top-level ou sous-collection per-user) → LIVE.
    setLive(true)
    const base = collection(db, spec.path.replace('{uid}', uid))
    const q = spec.ownerField
      ? query(base, where(spec.ownerField, '==', uid), limit(MAX_ROWS))
      : query(base, limit(MAX_ROWS))

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ _docId: d.id, ...(d.data() as Record<string, unknown>) })))
        setLoading(false)
      },
      onErr,
    )
    return unsub
  }, [spec, uid])

  return { rows, loading, error, live }
}
