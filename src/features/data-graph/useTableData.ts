// src/features/data-graph/useTableData.ts
import { useEffect, useState } from 'react'
import { collection, query, where, limit, onSnapshot, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { QuerySpec } from './firestoreSchema'
import { parseMaybeJson, asSheets, type SheetLike } from './formatValue'

export interface TableRow {
  _docId: string
  [k: string]: unknown
}

/** Feuille étiquetée par sa BDD (pour le sélecteur du panneau). */
interface NamedSheet extends SheetLike { name: string }

const MAX_ROWS = 500
const FLAT_MAX = 20000

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
  const [sheets, setSheets] = useState<NamedSheet[]>([])

  useEffect(() => {
    if (!spec || !uid) {
      setRows([]); setSheets([]); setError(null); setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setSheets([])
    const onErr = (err: { code?: string; message: string }) => {
      setError(err.code === 'permission-denied' ? 'Accès restreint à cette collection.' : err.message)
      setRows([]); setSheets([]); setLoading(false)
    }

    // Feuilles → une "feuille" par BDD (nom = fileName de excel_data), chacune avec SES
    // colonnes et SES lignes. Le panneau propose un sélecteur de BDD.
    if (spec.flattenSheets) {
      setLive(true)
      const field = spec.flattenSheets
      let alive = true
      let unsub = () => {}
      ;(async () => {
        const nameById = new Map<string, string>()
        try {
          const meta = await getDocs(query(collection(db, 'excel_data'), where('userId', '==', uid)))
          meta.forEach((d) => {
            const fn = (d.data() as { fileName?: string }).fileName
            if (fn) nameById.set(d.id, fn)
          })
        } catch { /* best-effort : repli sur l'id du doc */ }
        if (!alive) return

        const base = collection(db, spec.path.replace('{uid}', uid))
        const q = spec.ownerField ? query(base, where(spec.ownerField, '==', uid)) : query(base)
        unsub = onSnapshot(
          q,
          (snap) => {
            const out: NamedSheet[] = []
            for (const d of snap.docs) {
              const parsed = asSheets(parseMaybeJson((d.data() as Record<string, unknown>)[field]))
              if (!parsed) continue
              const bdd = nameById.get(d.id) ?? d.id
              for (const s of parsed) {
                const name = parsed.length > 1 && s.name ? `${bdd} · ${s.name}` : bdd
                out.push({ name, columns: s.columns, rows: s.rows.slice(0, FLAT_MAX) })
              }
            }
            // Plus grosse BDD d'abord (Monoprix en tête).
            out.sort((a, b) => b.rows.length - a.rows.length)
            setSheets(out)
            setRows([])
            setLoading(false)
          },
          onErr,
        )
      })()
      return () => { alive = false; unsub() }
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

  return { rows, loading, error, live, sheets }
}
