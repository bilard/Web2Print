// Liste LIVE des tableaux de bord de l'espace de travail. Aucun cache : l'abonnement
// reflète la base, un tableau créé sur un autre poste apparaît sans rechargement.
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { dashboardsCol } from '../store/dashboardsStore'
import { parseDashboard, type Dashboard } from '../types'
import { debugLog } from '@/lib/debugLog'

export function useDashboards(): { items: Dashboard[]; broken: BrokenBoard[] } {
  const uid = useWorkspaceUid()
  const [items, setItems] = useState<Dashboard[]>([])
  const [broken, setBroken] = useState<BrokenBoard[]>([])

  useEffect(() => {
    if (!uid) { setItems([]); setBroken([]); return }
    return onSnapshot(
      query(collection(db, dashboardsCol(uid)), orderBy('updatedAt', 'desc')),
      (snap) => {
        const out: Dashboard[] = []
        const bad: BrokenBoard[] = []
        for (const d of snap.docs) {
          try {
            out.push(parseDashboard(d.data()))
          } catch (e) {
            // ⚠⚠ Un document invalide n'emporte pas la liste entière — mais il ne doit pas
            // devenir un FANTÔME : présent en base, invisible à l'écran, impossible à
            // supprimer par l'interface. Il est donc REMONTÉ, avec sa cause.
            debugLog('[bi] tableau de bord illisible', d.id, e)
            bad.push({ id: d.id, reason: e instanceof Error ? e.message : String(e) })
          }
        }
        setItems(out)
        setBroken(bad)
      },
      (e) => console.warn('[bi] liste des tableaux de bord illisible :', e),
    )
  }, [uid])

  return { items, broken }
}

/** Un document que `parseDashboard` refuse : il n'a aucune place dans la liste, mais on doit
 *  pouvoir le nommer et le supprimer. */
export interface BrokenBoard { id: string; reason: string }
